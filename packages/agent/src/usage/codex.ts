import {homedir} from 'node:os'
import {join, resolve} from 'node:path'

import type {Exit} from 'effect'
import {
	Array,
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

const CodexCredentials = Schema.fromJsonString(Schema.Struct({tokens: Schema.Struct({access_token: Schema.String})}))

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

type CodexUsageWindow = typeof CodexUsage.Type.rate_limit.primary_window

const codexJsonlFiles = Effect.fnUntraced(function* (root: string) {
	const fs = yield* FileSystem.FileSystem
	if (!(yield* fs.exists(root))) return []

	return pipe(
		yield* fs.readDirectory(root, {recursive: true}),
		Array.filter(entry => String.endsWith('.jsonl')(entry)),
		Array.map(entry => join(root, entry))
	)
})

function objectProperty(input: unknown, key: string) {
	if (!Predicate.isObject(input)) return
	const value = input[key]
	return Predicate.isObject(value) ? value : undefined
}

function numberProperty(input: unknown, key: string) {
	if (!Predicate.isObject(input)) return 0
	const value = input[key]
	return Predicate.isNumber(value) ? value : 0
}

function jsonLine(line: string) {
	return pipe(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(line), Option.getOrUndefined)
}

function codexUsageTokens(input: unknown) {
	return {
		cached: numberProperty(input, 'cached_input_tokens'),
		input: numberProperty(input, 'input_tokens'),
		output: numberProperty(input, 'output_tokens')
	}
}

function addTokens(left: AgentUsageTokens, right: AgentUsageTokens) {
	return {cached: left.cached + right.cached, input: left.input + right.input, output: left.output + right.output}
}

function sameTokens(left: AgentUsageTokens | undefined, right: AgentUsageTokens) {
	return (
		Predicate.isNotUndefined(left) &&
		left.cached === right.cached &&
		left.input === right.input &&
		left.output === right.output
	)
}

function tokenNumber(content: string, cursor: number, until: number) {
	return pipe(
		/^\s*(\d+)/u.exec(content.slice(cursor, until))?.[1],
		Option.fromUndefinedOr,
		Option.flatMap(Number.parse),
		Option.getOrElse(() => 0)
	)
}

function tokenField(content: string, field: string, from: number, until: number) {
	const fieldIndex = content.indexOf(field, from)
	if (fieldIndex < 0 || fieldIndex > until) return 0

	const separatorIndex = content.indexOf(':', fieldIndex + field.length)
	if (separatorIndex < 0 || separatorIndex > until) return 0

	return tokenNumber(content, separatorIndex + 1, until)
}

function totalUsageFromMarker(content: string, markerIndex: number) {
	const start = content.indexOf('{', markerIndex + '"total_token_usage"'.length)
	if (start < 0) return

	const end = content.indexOf('}', start)
	if (end < 0) return

	return {
		cached: tokenField(content, '"cached_input_tokens"', start, end),
		input: tokenField(content, '"input_tokens"', start, end),
		output: tokenField(content, '"output_tokens"', start, end)
	}
}

function totalDelta(previous: AgentUsageTokens | undefined, next: AgentUsageTokens) {
	if (Predicate.isUndefined(previous)) return next
	if (next.cached < previous.cached || next.input < previous.input || next.output < previous.output) return next

	return {
		cached: next.cached - previous.cached,
		input: next.input - previous.input,
		output: next.output - previous.output
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
			const next = totalUsageFromMarker(content, match.index)
			return Predicate.isUndefined(next)
				? current
				: {previous: next, total: addTokens(current.total, totalDelta(current.previous, next))}
		}
	).total
}

function explicitUsageFromLine(line: string) {
	const decoded = jsonLine(line)
	const payload = objectProperty(decoded, 'payload')
	const info = objectProperty(payload, 'info')
	return (
		objectProperty(info, 'last_token_usage') ?? objectProperty(payload, 'usage') ?? objectProperty(decoded, 'usage')
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
						total: sameTokens(current.previous, next) ? current.total : addTokens(current.total, next)
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
			addTokens(total, file.tokens)
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
		Effect.mapError(cause => new AgentError({cause}))
	)
	const tokens = yield* pipe(
		files,
		Effect.forEach(path => pipe(fs.readFileString(path), Effect.map(codexTokensFromContent)), {concurrency: 8}),
		Effect.mapError(cause => new AgentError({cause}))
	)

	return sumTokenFiles(Array.map(tokens, value => ({tokens: value})))
})

export const makeLayerCodexUsage = Effect.fnUntraced(function* (_config: {readonly provider: 'codex'}) {
	const client = yield* HttpClient.HttpClient
	const fs = yield* FileSystem.FileSystem
	const codexRoot = pipe(process.env['CODEX_HOME'] ?? '', String.trim, value =>
		String.isNonEmpty(value) ? resolve(value) : join(homedir(), '.codex')
	)

	const codexToken = pipe(
		fs.readFileString(join(codexRoot, 'auth.json')),
		Effect.mapError(cause => new AgentError({cause, message: 'not signed in'})),
		Effect.flatMap(input =>
			pipe(
				Schema.decodeEffect(CodexCredentials)(input),
				Effect.mapError(cause => new AgentError({cause}))
			)
		),
		Effect.map(credentials => credentials.tokens.access_token)
	)

	const tokenFileCache = yield* Ref.make(
		HashMap.empty<string, {readonly mtimeMs: number; readonly size: number; readonly tokens: AgentUsageTokens}>()
	)
	const loadCachedTokens = Effect.fnUntraced(function* () {
		const files = yield* pipe(
			Effect.all(
				[codexJsonlFiles(join(codexRoot, 'sessions')), codexJsonlFiles(join(codexRoot, 'archived_sessions'))],
				{concurrency: 2}
			),
			Effect.map(Array.flatten),
			Effect.mapError(cause => new AgentError({cause}))
		)
		const currentCache = yield* Ref.get(tokenFileCache)
		const tokenFiles = yield* pipe(
			files,
			Effect.forEach(
				path =>
					Effect.gen(function* () {
						const info = yield* pipe(
							fs.stat(path),
							Effect.mapError(cause => new AgentError({cause}))
						)
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
				{concurrency: 4}
			),
			Effect.map(Array.flatten)
		)
		const nextCache = HashMap.fromIterable(tokenFiles)
		yield* Ref.set(tokenFileCache, nextCache)
		return sumTokenFiles(HashMap.values(nextCache))
	})

	const remoteUsage = yield* Effect.cachedWithTTL(remoteCodexUsage(client, codexToken), Duration.minutes(1))
	const subscription = pipe(
		remoteUsage,
		Effect.map(usage => codexSubscriptionLabel(usage.plan_type)),
		Effect.flatMap(label =>
			Predicate.isString(label)
				? Effect.succeed(AgentSubscription.make(label))
				: new AgentError({message: 'subscription unavailable'})
		)
	)
	const loadUsage = Effect.gen(function* () {
		const usage = yield* remoteUsage
		const tokens = yield* loadCachedTokens()
		return AgentUsageData.make({
			fiveHour: codexWindow(usage.rate_limit.primary_window),
			tokens,
			weekly: codexWindow(usage.rate_limit.secondary_window)
		})
	}).pipe(Effect.provideService(FileSystem.FileSystem, fs))
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

function codexWindow(input: CodexUsageWindow) {
	return {
		resetsAt: Predicate.isNumber(input.reset_at) ? new Date(input.reset_at * 1000).toISOString() : undefined,
		utilization: input.used_percent
	}
}

function remoteCodexUsage(client: HttpClient.HttpClient, token: Effect.Effect<string, AgentError>) {
	return pipe(
		Effect.gen(function* () {
			const accessToken = yield* token
			const response = yield* pipe(
				client.get('https://chatgpt.com/backend-api/wham/usage', {headers: {authorization: `Bearer ${accessToken}`}}),
				Effect.mapError(cause => new AgentError({cause}))
			)
			if (response.status !== 200) {
				return yield* new AgentError({
					message: response.status === 401 ? 'not signed in' : `codex usage responded with status ${response.status}`
				})
			}
			return yield* pipe(
				response.json,
				Effect.flatMap(Schema.decodeUnknownEffect(CodexUsage)),
				Effect.mapError(cause => new AgentError({cause}))
			)
		}),
		Effect.timeout('10 seconds'),
		Effect.mapError(cause => new AgentError({cause}))
	)
}
