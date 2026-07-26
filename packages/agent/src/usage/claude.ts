import {homedir} from 'node:os'
import {join} from 'node:path'

import type {Exit} from 'effect'
import {
	Array,
	Effect,
	FileSystem,
	HashMap,
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

import {AgentError, AgentUsageData, AgentUsageTokens} from '../schema.ts'
type ClaudeCredentials = typeof ClaudeCredentials.Type
const ClaudeCredentials = Schema.fromJsonString(
	Schema.Struct({claudeAiOauth: Schema.Struct({accessToken: Schema.String})})
)
type ClaudeUsageWindow = typeof ClaudeUsageWindow.Type
const ClaudeUsageWindow = Schema.Struct({
	resets_at: Schema.optional(Schema.NullOr(Schema.String)),
	utilization: Schema.Finite
})
type ClaudeUsage = typeof ClaudeUsage.Type
const ClaudeUsage = Schema.Struct({five_hour: ClaudeUsageWindow, seven_day: ClaudeUsageWindow})
const claudeJsonlFiles = Effect.fnUntraced(function* (root: string) {
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
	return pipe(
		parameters.input[parameters.key],
		Option.liftPredicate(Predicate.isNumber),
		Option.getOrElse(() => 0)
	)
}
function jsonLine(line: string) {
	return pipe(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(line), Option.getOrUndefined)
}
function claudeUsageTokens(input: unknown) {
	const cacheCreation = numberProperty({input, key: 'cache_creation_input_tokens'})
	return {
		cached:
			numberProperty({input, key: 'cache_read_input_tokens'}) +
			(cacheCreation === 0 ? numberProperty({input, key: 'cached_input_tokens'}) : cacheCreation),
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
function claudeTokensFromContent(content: string) {
	return AgentUsageTokens.make(
		pipe(
			content,
			String.split('\n'),
			Array.reduce({cached: 0, input: 0, output: 0}, (current, line) => {
				if (!String.includes('"usage"')(line)) return current
				const decoded = jsonLine(line)
				const usage =
					objectProperty({input: objectProperty({input: decoded, key: 'message'}), key: 'usage'}) ??
					objectProperty({input: decoded, key: 'usage'})
				return Predicate.isUndefined(usage) ? current : addTokens({left: current, right: claudeUsageTokens(usage)})
			})
		)
	)
}
function sumTokenFiles(files: Iterable<{readonly tokens: AgentUsageTokens}>) {
	return AgentUsageTokens.make(
		Array.reduce(Array.fromIterable(files), {cached: 0, input: 0, output: 0}, (total, file) =>
			addTokens({left: total, right: file.tokens})
		)
	)
}
export const loadClaudeUsageTokens = Effect.fnUntraced(function* (input: {readonly projectsRoot: string}) {
	const fs = yield* FileSystem.FileSystem
	const files = yield* pipe(
		claudeJsonlFiles(input.projectsRoot),
		Effect.mapError(cause => AgentError.make({cause}))
	)
	const contents = yield* pipe(
		Effect.forEach(files, path => fs.readFileString(path), {concurrency: 8}),
		Effect.mapError(cause => AgentError.make({cause}))
	)
	return pipe(
		contents,
		Array.map(content => ({tokens: claudeTokensFromContent(content)})),
		sumTokenFiles
	)
})
export const makeLayerClaudeUsage = Effect.fnUntraced(function* (_config: {readonly provider: 'claude'}) {
	const client = yield* HttpClient.HttpClient
	const fs = yield* FileSystem.FileSystem
	const home = homedir()
	const projectsRoot = join(home, '.claude', 'projects')
	const claudeCredentialsFile = pipe(
		fs.readFileString(join(home, '.claude', '.credentials.json')),
		Effect.mapError(cause => AgentError.make({cause, message: 'not signed in'}))
	)
	const claudeToken = pipe(
		claudeCredentialsFile,
		Effect.flatMap(input =>
			pipe(
				Schema.decodeEffect(ClaudeCredentials)(input),
				Effect.mapError(cause => AgentError.make({cause, message: 'not signed in'}))
			)
		),
		Effect.map(credentials => credentials.claudeAiOauth.accessToken)
	)
	const tokenFileCache = yield* Ref.make(
		HashMap.empty<string, {readonly mtimeMs: number; readonly size: number; readonly tokens: AgentUsageTokens}>()
	)
	const loadCachedTokens = Effect.gen(function* () {
		const files = yield* pipe(
			claudeJsonlFiles(projectsRoot),
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
							const size = Number(info.size)
							const cached = pipe(currentCache, HashMap.get(path), Option.getOrUndefined)
							if (Predicate.isNotUndefined(cached) && cached.mtimeMs === mtimeMs && cached.size === size) {
								return [[path, cached] as const]
							}
							const tokens = yield* pipe(fs.readFileString(path), Effect.map(claudeTokensFromContent))
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
	const remoteUsage = remoteClaudeUsage({client, token: claudeToken})
	const subscription = AgentError.make({message: 'subscription unavailable'})
	const loadUsage = pipe(
		remoteUsage,
		Effect.flatMap(usage =>
			pipe(
				loadCachedTokens,
				Effect.map(tokens =>
					AgentUsageData.make({fiveHour: claudeWindow(usage.five_hour), tokens, weekly: claudeWindow(usage.seven_day)})
				)
			)
		),
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
function claudeWindow(input: ClaudeUsageWindow) {
	return {resetsAt: input.resets_at ?? undefined, utilization: input.utilization}
}
function remoteClaudeUsage(input: {
	readonly client: HttpClient.HttpClient
	readonly token: Effect.Effect<string, AgentError>
}) {
	return pipe(
		Effect.gen(function* () {
			const accessToken = yield* input.token
			const response = yield* pipe(
				input.client.get('https://api.anthropic.com/api/oauth/usage', {
					headers: {
						'anthropic-beta': 'oauth-2025-04-20',
						authorization: `Bearer ${accessToken}`,
						'user-agent': 'claude-code/2.0.31'
					}
				}),
				Effect.mapError(cause => AgentError.make({cause}))
			)
			if (response.status !== 200) {
				return yield* AgentError.make({
					message: response.status === 401 ? 'not signed in' : `claude usage responded with status ${response.status}`
				})
			}
			return yield* pipe(
				response.json,
				Effect.flatMap(Schema.decodeUnknownEffect(ClaudeUsage)),
				Effect.mapError(cause => AgentError.make({cause}))
			)
		}),
		Effect.timeout('10 seconds'),
		Effect.mapError(cause => AgentError.make({cause}))
	)
}
