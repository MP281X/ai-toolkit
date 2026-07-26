import {homedir} from 'node:os'
import {join, resolve} from 'node:path'

import type {Exit} from 'effect'
import {
	Array,
	Config,
	DateTime,
	Duration,
	Effect,
	FileSystem,
	HashMap,
	Number,
	Option,
	Predicate,
	Ref,
	Schedule,
	Schema,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import {HttpClient} from 'effect/unstable/http'

import {AgentError, AgentSubscription, AgentUsageData, AgentUsageTokens} from '../schema.ts'
type CodexCredentials = typeof CodexCredentials.Type
const CodexCredentials = Schema.fromJsonString(Schema.Struct({tokens: Schema.Struct({access_token: Schema.String})}))
type CodexUsage = typeof CodexUsage.Type
const CodexUsage = Schema.Struct({
	plan_type: Schema.optional(Schema.NullOr(Schema.String)),
	rate_limit: Schema.Struct({
		primary_window: Schema.Struct({
			reset_at: Schema.optional(Schema.NullOr(Schema.Finite)),
			used_percent: Schema.Finite
		}),
		secondary_window: Schema.Struct({
			reset_at: Schema.optional(Schema.NullOr(Schema.Finite)),
			used_percent: Schema.Finite
		})
	})
})
const codexJsonlFiles = Effect.fnUntraced(function* (root: string) {
	const fs = yield* FileSystem.FileSystem
	if (!(yield* fs.exists(root))) return []
	return pipe(
		yield* fs.readDirectory(root, {recursive: true}),
		Array.filter(entry => String.endsWith('.jsonl')(entry)),
		Array.map(entry => join(root, entry))
	)
})
function objectProperty(parameters: {readonly input: unknown; readonly key: string}) {
	if (!Predicate.isObject(parameters.input)) return
	return Predicate.isObject(parameters.input[parameters.key]) ? parameters.input[parameters.key] : undefined
}
function numberProperty(parameters: {readonly input: unknown; readonly key: string}) {
	if (!Predicate.isObject(parameters.input)) return 0
	return Predicate.isNumber(parameters.input[parameters.key]) ? parameters.input[parameters.key] : 0
}
function jsonLine(line: string) {
	return pipe(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(line), Option.getOrUndefined)
}
function codexUsageTokens(input: unknown) {
	return {
		cached: numberProperty({input, key: 'cached_input_tokens'}),
		input: numberProperty({input, key: 'input_tokens'}),
		output: numberProperty({input, key: 'output_tokens'})
	}
}
function addTokens(input: {readonly left: AgentUsageTokens; readonly right: AgentUsageTokens}) {
	return {
		cached: input.left.cached + input.right.cached,
		input: input.left.input + input.right.input,
		output: input.left.output + input.right.output
	}
}
function sameTokens(input: {readonly left: AgentUsageTokens | undefined; readonly right: AgentUsageTokens}) {
	return (
		Predicate.isNotUndefined(input.left) &&
		input.left.cached === input.right.cached &&
		input.left.input === input.right.input &&
		input.left.output === input.right.output
	)
}
function tokenNumber(input: {readonly content: string; readonly cursor: number; readonly until: number}) {
	return pipe(
		/^\s*(\d+)/u.exec(input.content.slice(input.cursor, input.until))?.[1],
		Option.fromUndefinedOr,
		Option.flatMap(Number.parse),
		Option.getOrElse(() => 0)
	)
}
function tokenField(input: {
	readonly content: string
	readonly field: string
	readonly from: number
	readonly until: number
}) {
	const fieldIndex = input.content.indexOf(input.field, input.from)
	if (fieldIndex < 0 || fieldIndex > input.until) return 0
	const separatorIndex = input.content.indexOf(':', fieldIndex + input.field.length)
	if (separatorIndex < 0 || separatorIndex > input.until) return 0
	return tokenNumber({content: input.content, cursor: separatorIndex + 1, until: input.until})
}
function totalUsageFromMarker(input: {readonly content: string; readonly markerIndex: number}) {
	const start = input.content.indexOf('{', input.markerIndex + '"total_token_usage"'.length)
	if (start < 0) return
	const end = input.content.indexOf('}', start)
	if (end < 0) return
	return {
		cached: tokenField({content: input.content, field: '"cached_input_tokens"', from: start, until: end}),
		input: tokenField({content: input.content, field: '"input_tokens"', from: start, until: end}),
		output: tokenField({content: input.content, field: '"output_tokens"', from: start, until: end})
	}
}
function totalDelta(input: {readonly previous: AgentUsageTokens | undefined; readonly next: AgentUsageTokens}) {
	if (Predicate.isUndefined(input.previous)) return input.next
	if (
		input.next.cached < input.previous.cached ||
		input.next.input < input.previous.input ||
		input.next.output < input.previous.output
	) {
		return input.next
	}
	return {
		cached: input.next.cached - input.previous.cached,
		input: input.next.input - input.previous.input,
		output: input.next.output - input.previous.output
	}
}
function totalUsageTokensFromContent(content: string) {
	const matches = [...content.matchAll(/"total_token_usage"/gu)]
	if (Array.isReadonlyArrayEmpty(matches)) return
	return Array.reduce(
		matches,
		{
			previous: undefined as AgentUsageTokens | undefined,
			total: AgentUsageTokens.make({cached: 0, input: 0, output: 0})
		},
		(current, match) => {
			const next = totalUsageFromMarker({content, markerIndex: match.index})
			return Predicate.isUndefined(next)
				? current
				: {
						previous: next,
						total: addTokens({left: current.total, right: totalDelta({next, previous: current.previous})})
					}
		}
	).total
}
function explicitUsageFromLine(line: string) {
	const decoded = jsonLine(line)
	const payload = objectProperty({input: decoded, key: 'payload'})
	const info = objectProperty({input: payload, key: 'info'})
	return (
		objectProperty({input: info, key: 'last_token_usage'}) ??
		objectProperty({input: payload, key: 'usage'}) ??
		objectProperty({input: decoded, key: 'usage'})
	)
}
function explicitUsageTokensFromContent(content: string) {
	return pipe(
		content,
		String.split('\n'),
		Array.reduce(
			{
				previous: undefined as AgentUsageTokens | undefined,
				total: AgentUsageTokens.make({cached: 0, input: 0, output: 0})
			},
			(current, line) => {
				if (String.includes('"last_token_usage"')(line) || String.includes('"usage"')(line)) {
					const usage = explicitUsageFromLine(line)
					if (Predicate.isUndefined(usage)) return current
					const next = codexUsageTokens(usage)
					return {
						previous: next,
						total: sameTokens({left: current.previous, right: next})
							? current.total
							: addTokens({left: current.total, right: next})
					}
				}
				return current
			}
		),
		result => result.total
	)
}
function codexTokensFromContent(content: string) {
	return totalUsageTokensFromContent(content) ?? explicitUsageTokensFromContent(content)
}
function sumTokenFiles(files: Iterable<{readonly tokens: AgentUsageTokens}>) {
	return AgentUsageTokens.make(
		Array.reduce(Array.fromIterable(files), {cached: 0, input: 0, output: 0}, (total, file) =>
			addTokens({left: total, right: file.tokens})
		)
	)
}
export const loadCodexUsageTokens = Effect.fnUntraced(function* (input: {readonly codexRoot: string}) {
	const fs = yield* FileSystem.FileSystem
	const files = yield* pipe(
		Effect.all(
			[codexJsonlFiles(join(input.codexRoot, 'sessions')), codexJsonlFiles(join(input.codexRoot, 'archived_sessions'))],
			{concurrency: 2}
		),
		Effect.map(Array.flatten),
		Effect.mapError(cause => AgentError.make({cause}))
	)
	const tokens = yield* pipe(
		files,
		Effect.forEach(path => pipe(fs.readFileString(path), Effect.map(codexTokensFromContent)), {concurrency: 8}),
		Effect.mapError(cause => AgentError.make({cause}))
	)
	return sumTokenFiles(Array.map(tokens, value => ({tokens: value})))
})
export const makeLayerCodexUsage = Effect.fnUntraced(function* (_config: {readonly provider: 'codex'}) {
	const client = yield* HttpClient.HttpClient
	const fs = yield* FileSystem.FileSystem
	const codexHome = yield* pipe(
		Config.string('CODEX_HOME'),
		Effect.orElseSucceed(() => '')
	)
	const codexRoot = pipe(codexHome, String.trim, value =>
		String.isNonEmpty(value) ? resolve(value) : join(homedir(), '.codex')
	)
	const codexToken = pipe(
		fs.readFileString(join(codexRoot, 'auth.json')),
		Effect.mapError(cause => AgentError.make({cause, message: 'not signed in'})),
		Effect.flatMap(input =>
			pipe(
				Schema.decodeEffect(CodexCredentials)(input),
				Effect.mapError(cause => AgentError.make({cause}))
			)
		),
		Effect.map(credentials => credentials.tokens.access_token)
	)
	const tokenFileCache = yield* Ref.make(
		HashMap.empty<string, {readonly mtimeMs: number; readonly size: number; readonly tokens: AgentUsageTokens}>()
	)
	const loadCachedTokens = Effect.gen(function* () {
		const files = yield* pipe(
			Effect.all(
				[codexJsonlFiles(join(codexRoot, 'sessions')), codexJsonlFiles(join(codexRoot, 'archived_sessions'))],
				{concurrency: 2}
			),
			Effect.map(Array.flatten),
			Effect.mapError(cause => AgentError.make({cause}))
		)
		const currentCache = yield* Ref.get(tokenFileCache)
		const tokenFiles = yield* pipe(
			files,
			Effect.forEach(
				path =>
					pipe(
						Effect.gen(function* () {
							const info = yield* fs.stat(path)
							if (info.type !== 'File') return []
							const mtimeMs = pipe(
								info.mtime,
								Option.map(value => value.getTime()),
								Option.getOrElse(() => 0)
							)
							const size = pipe(
								Number.parse(`${info.size}`),
								Option.getOrElse(() => 0)
							)
							const cached = pipe(currentCache, HashMap.get(path), Option.getOrUndefined)
							if (Predicate.isNotUndefined(cached) && cached.mtimeMs === mtimeMs && cached.size === size) {
								return [[path, cached] as const]
							}
							const tokens = yield* pipe(fs.readFileString(path), Effect.map(codexTokensFromContent))
							return [[path, {mtimeMs, size, tokens}] as const]
						}),
						Effect.mapError(cause => AgentError.make({cause}))
					),
				{concurrency: 4}
			),
			Effect.map(Array.flatten)
		)
		const nextCache = HashMap.fromIterable(tokenFiles)
		yield* Ref.set(tokenFileCache, nextCache)
		return sumTokenFiles(HashMap.values(nextCache))
	})
	const remoteUsage = yield* Effect.cachedWithTTL(remoteCodexUsage({client, token: codexToken}), Duration.minutes(1))
	const subscription = pipe(
		remoteUsage,
		Effect.map(usage => codexSubscriptionLabel(usage.plan_type)),
		Effect.flatMap(label =>
			Predicate.isString(label)
				? Effect.succeed(AgentSubscription.make(label))
				: AgentError.make({message: 'subscription unavailable'})
		)
	)
	const loadUsage = pipe(
		Effect.gen(function* () {
			const usage = yield* remoteUsage
			const tokens = yield* loadCachedTokens
			return AgentUsageData.make({
				fiveHour: codexWindow(usage.rate_limit.primary_window),
				tokens,
				weekly: codexWindow(usage.rate_limit.secondary_window)
			})
		}),
		Effect.provideService(FileSystem.FileSystem, fs)
	)
	const usage = yield* SubscriptionRef.make<Option.Option<Exit.Exit<AgentUsageData, AgentError>>>(Array.head([]))
	yield* pipe(
		Stream.fromEffect(Effect.exit(loadUsage)),
		Stream.repeat(Schedule.spaced('10 minutes')),
		Stream.runForEach(value => SubscriptionRef.set(usage, Array.head([value]))),
		Effect.forkScoped
	)
	return {subscription, usage}
})
function codexSubscriptionLabel(planType: string | null | undefined) {
	if (!Predicate.isString(planType)) return
	return pipe(
		planType,
		String.trim,
		String.split(/[\s_-]+/u),
		Array.filter(token => String.isNonEmpty(token) && String.toLowerCase(token) !== 'default'),
		Array.map(token =>
			/^\d+x$/u.test(String.toLowerCase(token)) ? String.toLowerCase(token) : String.capitalize(token)
		),
		tokens => (Array.isReadonlyArrayEmpty(tokens) ? undefined : Array.join(tokens, ' '))
	)
}
function codexWindow(input: typeof CodexUsage.Type.rate_limit.primary_window) {
	return {
		resetsAt: Predicate.isNumber(input.reset_at)
			? DateTime.formatIso(DateTime.makeUnsafe(input.reset_at * 1000))
			: undefined,
		utilization: input.used_percent
	}
}
function remoteCodexUsage(input: {
	readonly client: HttpClient.HttpClient
	readonly token: Effect.Effect<string, AgentError>
}) {
	return pipe(
		Effect.gen(function* () {
			const accessToken = yield* input.token
			const response = yield* pipe(
				input.client.get('https://chatgpt.com/backend-api/wham/usage', {
					headers: {authorization: `Bearer ${accessToken}`}
				}),
				Effect.mapError(cause => AgentError.make({cause}))
			)
			if (response.status !== 200) {
				return yield* AgentError.make({
					message: response.status === 401 ? 'not signed in' : `codex usage responded with status ${response.status}`
				})
			}
			return yield* pipe(
				response.json,
				Effect.flatMap(Schema.decodeUnknownEffect(CodexUsage)),
				Effect.mapError(cause => AgentError.make({cause}))
			)
		}),
		Effect.timeout('10 seconds'),
		Effect.mapError(cause => AgentError.make({cause}))
	)
}
