import {homedir} from 'node:os'

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
	Path,
	Predicate,
	Ref,
	Schedule,
	Schema,
	Stream,
	String,
	SubscriptionRef,
	flow,
	pipe
} from 'effect'

import {HttpClient} from 'effect/unstable/http'

import {AgentError, AgentSubscription, AgentUsageData, AgentUsageTokens} from '../schema.ts'

type CodexCredentials = typeof CodexCredentials.Type
const CodexCredentials = Schema.fromJsonString(Schema.Struct({tokens: Schema.Struct({access_token: Schema.String})}))

type CodexUsage = typeof CodexUsage.Type
const CodexUsage = Schema.Struct({
	plan_type: Schema.OptionFromOptionalNullOr(Schema.String, {onNoneEncoding: 'omit'}),
	rate_limit: Schema.Struct({
		primary_window: Schema.Struct({
			reset_at: Schema.OptionFromOptionalNullOr(Schema.Finite, {onNoneEncoding: 'omit'}),
			used_percent: Schema.Finite
		}),
		secondary_window: Schema.Struct({
			reset_at: Schema.OptionFromOptionalNullOr(Schema.Finite, {onNoneEncoding: 'omit'}),
			used_percent: Schema.Finite
		})
	})
})

type CodexUsageTokens = typeof CodexUsageTokens.Type
const CodexUsageTokens = Schema.Struct({
	cached_input_tokens: Schema.optional(Schema.Finite),
	input_tokens: Schema.optional(Schema.Finite),
	output_tokens: Schema.optional(Schema.Finite)
})

type CodexUsageLine = typeof CodexUsageLine.Type
const CodexUsageLine = Schema.fromJsonString(
	Schema.Struct({
		payload: Schema.optional(
			Schema.Struct({
				info: Schema.optional(Schema.Struct({last_token_usage: Schema.optional(CodexUsageTokens)})),
				usage: Schema.optional(CodexUsageTokens)
			})
		),
		usage: Schema.optional(CodexUsageTokens)
	})
)

const codexJsonlFiles = Effect.fnUntraced(function* (root: string) {
	const fs = yield* FileSystem.FileSystem
	const path = yield* Path.Path
	if (!(yield* fs.exists(root))) return []

	return pipe(
		yield* fs.readDirectory(root, {recursive: true}),
		Array.filter(entry => String.endsWith('.jsonl')(entry)),
		Array.map(entry => path.join(root, entry))
	)
})

function codexUsageTokens(input: CodexUsageTokens) {
	return {cached: input.cached_input_tokens ?? 0, input: input.input_tokens ?? 0, output: input.output_tokens ?? 0}
}

function addTokens(left: AgentUsageTokens, right: AgentUsageTokens) {
	return {cached: left.cached + right.cached, input: left.input + right.input, output: left.output + right.output}
}

function sameTokens(right: AgentUsageTokens, left?: AgentUsageTokens) {
	return (
		Predicate.isNotUndefined(left) &&
		left.cached === right.cached &&
		left.input === right.input &&
		left.output === right.output
	)
}

function tokenNumber(content: string, cursor: number, until: number) {
	return pipe(
		/^\s*(\d+)/u.exec(String.slice(cursor, until)(content))?.[1],
		Option.fromUndefinedOr,
		Option.flatMap(Number.parse),
		Option.getOrElse(() => 0)
	)
}

function indexBetween(content: string, search: string, from: number, until = String.length(content)) {
	return pipe(
		String.slice(from, until)(content),
		String.indexOf(search),
		Option.map(index => index + from)
	)
}

function tokenField(content: string, field: string, from: number, until: number) {
	return pipe(
		indexBetween(content, field, from, until),
		Option.flatMap(fieldIndex => indexBetween(content, ':', fieldIndex + String.length(field), until)),
		Option.map(separatorIndex => tokenNumber(content, separatorIndex + 1, until)),
		Option.getOrElse(() => 0)
	)
}

function totalUsageFromMarker(content: string, markerIndex: number) {
	const start = indexBetween(content, '{', markerIndex + String.length('"total_token_usage"'))
	if (Option.isNone(start)) return

	const end = indexBetween(content, '}', start.value)
	if (Option.isNone(end)) return

	return {
		cached: tokenField(content, '"cached_input_tokens"', start.value, end.value),
		input: tokenField(content, '"input_tokens"', start.value, end.value),
		output: tokenField(content, '"output_tokens"', start.value, end.value)
	}
}

function totalDelta(next: AgentUsageTokens, previous?: AgentUsageTokens) {
	if (Predicate.isUndefined(previous)) return next
	if (next.cached < previous.cached || next.input < previous.input || next.output < previous.output) return next

	return {
		cached: next.cached - previous.cached,
		input: next.input - previous.input,
		output: next.output - previous.output
	}
}

function totalUsageTokensFromContent(content: string) {
	const matches = Array.fromIterable(String.matchAll(/"total_token_usage"/gu)(content))
	if (Array.isReadonlyArrayEmpty(matches)) return

	return Array.reduce(
		matches,
		{previous: Option.none<AgentUsageTokens>(), total: AgentUsageTokens.make({cached: 0, input: 0, output: 0})},
		(current, match) => {
			const next = totalUsageFromMarker(content, match.index ?? 0)
			return Predicate.isUndefined(next)
				? current
				: {
						previous: Option.some(next),
						total: addTokens(current.total, totalDelta(next, Option.getOrUndefined(current.previous)))
					}
		}
	).total
}

function explicitUsageFromLine(line: string) {
	return pipe(
		Schema.decodeOption(CodexUsageLine)(line),
		Option.flatMap(decoded =>
			Option.fromNullishOr(decoded.payload?.info?.last_token_usage ?? decoded.payload?.usage ?? decoded.usage)
		),
		Option.getOrUndefined
	)
}

function explicitUsageTokensFromContent(content: string) {
	return pipe(
		content,
		String.split('\n'),
		Array.reduce(
			{previous: Option.none<AgentUsageTokens>(), total: AgentUsageTokens.make({cached: 0, input: 0, output: 0})},
			(current, line) => {
				if (String.includes('"last_token_usage"')(line) || String.includes('"usage"')(line)) {
					const usage = explicitUsageFromLine(line)
					if (Predicate.isUndefined(usage)) return current

					const next = codexUsageTokens(usage)
					return {
						previous: Option.some(next),
						total: sameTokens(next, Option.getOrUndefined(current.previous))
							? current.total
							: addTokens(current.total, next)
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

function sumTokenFiles(files: {tokens: AgentUsageTokens}[]) {
	return AgentUsageTokens.make(
		Array.reduce(files, {cached: 0, input: 0, output: 0}, (total, file) => addTokens(total, file.tokens))
	)
}

export const makeLayerCodexUsage = Effect.fnUntraced(function* (_config: {provider: 'codex'}) {
	const client = yield* HttpClient.HttpClient
	const fs = yield* FileSystem.FileSystem
	const path = yield* Path.Path
	const codexRootValue = yield* pipe(
		Config.string('CODEX_HOME'),
		Config.withDefault(''),
		Effect.mapError(cause => AgentError.make({cause}))
	)
	const codexRoot = pipe(codexRootValue, String.trim, value =>
		String.isNonEmpty(value) ? path.resolve(value) : path.join(homedir(), '.codex')
	)

	const codexToken = pipe(
		fs.readFileString(path.join(codexRoot, 'auth.json')),
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
		HashMap.empty<string, {mtimeMs: number; size: number; tokens: AgentUsageTokens}>()
	)
	const loadCachedTokens = Effect.fnUntraced(function* () {
		const files = yield* pipe(
			Effect.all(
				[codexJsonlFiles(path.join(codexRoot, 'sessions')), codexJsonlFiles(path.join(codexRoot, 'archived_sessions'))],
				{concurrency: 2}
			),
			Effect.map(Array.flatten),
			Effect.mapError(cause => AgentError.make({cause}))
		)
		const currentCache = yield* Ref.get(tokenFileCache)
		const tokenFiles = yield* pipe(
			files,
			Effect.forEach(
				filePath =>
					Effect.gen(function* () {
						const info = yield* pipe(
							fs.stat(filePath),
							Effect.mapError(cause => AgentError.make({cause}))
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
						const cached = pipe(currentCache, HashMap.get(filePath), Option.getOrUndefined)
						if (Predicate.isNotUndefined(cached) && cached.mtimeMs === mtimeMs && cached.size === size) {
							return [[filePath, cached] as const]
						}

						const tokens = yield* pipe(fs.readFileString(filePath), Effect.map(codexTokensFromContent))
						return [[filePath, {mtimeMs, size, tokens}] as const]
					}),
				{concurrency: 4}
			),
			Effect.map(Array.flatten)
		)
		const nextCache = HashMap.fromIterable(tokenFiles)
		yield* Ref.set(tokenFileCache, nextCache)
		return sumTokenFiles(Array.fromIterable(HashMap.values(nextCache)))
	})

	const remoteUsage = yield* Effect.cachedWithTTL(remoteCodexUsage(client, codexToken), Duration.minutes(1))
	const subscription = pipe(
		remoteUsage,
		Effect.map(usage => codexSubscriptionLabel(usage.plan_type)),
		Effect.flatMap(
			Option.match({
				onNone: () => AgentError.make({message: 'subscription unavailable'}),
				onSome: label => Effect.succeed(AgentSubscription.make(label))
			})
		)
	)
	const loadUsage = pipe(
		Effect.gen(function* () {
			const usage = yield* remoteUsage
			const tokens = yield* pipe(
				loadCachedTokens(),
				Effect.mapError(cause => AgentError.make({cause}))
			)
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

function codexSubscriptionLabel(planType: Option.Option<string>) {
	return pipe(
		planType,
		Option.map(
			flow(
				String.trim,
				String.split(/[\s_-]+/u),
				Array.filter(token => String.isNonEmpty(token) && String.toLowerCase(token) !== 'default'),
				Array.map(token =>
					/^\d+x$/u.test(String.toLowerCase(token)) ? String.toLowerCase(token) : String.capitalize(token)
				),
				Array.join(' ')
			)
		),
		Option.filter(String.isNonEmpty)
	)
}

function codexWindow(input: typeof CodexUsage.Type.rate_limit.primary_window) {
	return {
		resetsAt: pipe(
			input.reset_at,
			Option.map(flow(DateTime.fromEpochSeconds, DateTime.formatIso)),
			Option.getOrUndefined
		),
		utilization: input.used_percent
	}
}

function remoteCodexUsage(client: HttpClient.HttpClient, token: Effect.Effect<string, AgentError>) {
	return pipe(
		Effect.gen(function* () {
			const accessToken = yield* token
			const response = yield* pipe(
				client.get('https://chatgpt.com/backend-api/wham/usage', {headers: {authorization: `Bearer ${accessToken}`}}),
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
