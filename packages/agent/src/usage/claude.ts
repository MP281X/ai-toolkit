import {homedir} from 'node:os'

import type {Exit} from 'effect'
import {
	Array,
	BigInt,
	Effect,
	FileSystem,
	HashMap,
	Match,
	Option,
	Path,
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

const ClaudeCredentials = Schema.fromJsonString(
	Schema.Struct({claudeAiOauth: Schema.Struct({accessToken: Schema.String})})
)

type ClaudeUsageWindow = typeof ClaudeUsageWindow.Type
const ClaudeUsageWindow = Schema.Struct({
	resets_at: Schema.optional(Schema.NullOr(Schema.String)),
	utilization: Schema.Finite
})

const ClaudeUsage = Schema.Struct({five_hour: ClaudeUsageWindow, seven_day: ClaudeUsageWindow})

const claudeJsonlFiles = Effect.fnUntraced(function* (root: string) {
	const fs = yield* FileSystem.FileSystem
	const path = yield* Path.Path
	if (!(yield* fs.exists(root))) return []

	return pipe(
		yield* fs.readDirectory(root, {recursive: true}),
		Array.filter(entry => String.endsWith('.jsonl')(entry)),
		Array.map(entry => path.join(root, entry))
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
	return pipe(Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(line), Option.getOrUndefined)
}

function claudeUsageTokens(input: unknown) {
	return {
		cached:
			numberProperty(input, 'cache_read_input_tokens') +
			(numberProperty(input, 'cache_creation_input_tokens') || numberProperty(input, 'cached_input_tokens')),
		input: numberProperty(input, 'input_tokens'),
		output: numberProperty(input, 'output_tokens')
	}
}

function addTokens(left: AgentUsageTokens, right: AgentUsageTokens) {
	return {cached: left.cached + right.cached, input: left.input + right.input, output: left.output + right.output}
}

function claudeTokensFromContent(content: string) {
	return AgentUsageTokens.make(
		pipe(
			content,
			String.split('\n'),
			Array.reduce({cached: 0, input: 0, output: 0}, (current, line) => {
				if (!String.includes('"usage"')(line)) return current

				const decoded = jsonLine(line)
				const usage = objectProperty(objectProperty(decoded, 'message'), 'usage') ?? objectProperty(decoded, 'usage')
				return Predicate.isUndefined(usage) ? current : addTokens(current, claudeUsageTokens(usage))
			})
		)
	)
}

function sumTokenFiles(files: Iterable<{tokens: AgentUsageTokens}>) {
	return AgentUsageTokens.make(
		Array.reduce(Array.fromIterable(files), {cached: 0, input: 0, output: 0}, (total, file) =>
			addTokens(total, file.tokens)
		)
	)
}

export const loadClaudeUsageTokens = Effect.fnUntraced(function* (input: {projectsRoot: string}) {
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

export const makeLayerClaudeUsage = Effect.fnUntraced(function* (_config: {provider: 'claude'}) {
	const client = yield* HttpClient.HttpClient
	const fs = yield* FileSystem.FileSystem
	const path = yield* Path.Path
	const home = homedir()
	const projectsRoot = path.join(home, '.claude', 'projects')
	const claudeCredentialsFile = pipe(
		fs.readFileString(path.join(home, '.claude', '.credentials.json')),
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
		HashMap.empty<string, {mtimeMs: number; size: number; tokens: AgentUsageTokens}>()
	)
	const loadCachedTokens = Effect.fnUntraced(function* () {
		const files = yield* pipe(
			claudeJsonlFiles(projectsRoot),
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
							Match.value(info.size),
							Match.when(Predicate.isNumber, value => value),
							Match.orElse(value =>
								pipe(
									BigInt.toNumber(value),
									Option.getOrElse(() => 0)
								)
							)
						)
						const cached = pipe(currentCache, HashMap.get(filePath), Option.getOrUndefined)
						if (Predicate.isNotUndefined(cached) && cached.mtimeMs === mtimeMs && cached.size === size) {
							return [[filePath, cached] as const]
						}

						const tokens = yield* pipe(fs.readFileString(filePath), Effect.map(claudeTokensFromContent))
						return [[filePath, {mtimeMs, size, tokens}] as const]
					}),
				{concurrency: 4}
			),
			Effect.map(Array.flatten)
		)
		const nextCache = HashMap.fromIterable(tokenFiles)
		yield* Ref.set(tokenFileCache, nextCache)
		return sumTokenFiles(HashMap.values(nextCache))
	})

	const remoteUsage = remoteClaudeUsage(client, claudeToken)
	const subscription = AgentError.make({message: 'subscription unavailable'})
	const loadUsage = pipe(
		remoteUsage,
		Effect.flatMap(usage =>
			pipe(
				loadCachedTokens(),
				Effect.mapError(cause => AgentError.make({cause})),
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

function remoteClaudeUsage(client: HttpClient.HttpClient, token: Effect.Effect<string, AgentError>) {
	return pipe(
		Effect.gen(function* () {
			const accessToken = yield* token
			const response = yield* pipe(
				client.get('https://api.anthropic.com/api/oauth/usage', {
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
