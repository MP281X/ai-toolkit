import {homedir} from 'node:os'
import {join} from 'node:path'

import type {Exit} from 'effect'
import {
	Array,
	Effect,
	FileSystem,
	Option,
	Predicate,
	Schedule,
	Schema,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import {HttpClient} from 'effect/unstable/http'
import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import {AgentError, AgentSubscription, AgentUsageData, AgentUsageTokens} from '../schema.ts'

const ClaudeCredentials = Schema.fromJsonString(
	Schema.Struct({claudeAiOauth: Schema.Struct({accessToken: Schema.String})})
)

const ClaudeAuthStatus = Schema.fromJsonString(
	Schema.Struct({
		authMethod: Schema.optional(Schema.String),
		loggedIn: Schema.Boolean,
		subscriptionType: Schema.optional(Schema.String)
	})
)

const ClaudeUsageWindow = Schema.Struct({
	resets_at: Schema.optional(Schema.NullOr(Schema.String)),
	utilization: Schema.Number
})

const ClaudeUsage = Schema.Struct({five_hour: ClaudeUsageWindow, seven_day: ClaudeUsageWindow})

const ClaudeTokenUsage = Schema.Struct({
	cache_read_input_tokens: Schema.optional(Schema.Number),
	cached_input_tokens: Schema.optional(Schema.Number),
	input_tokens: Schema.optional(Schema.Number),
	output_tokens: Schema.optional(Schema.Number)
})

const ClaudeTokenLine = Schema.fromJsonString(
	Schema.Struct({
		message: Schema.optional(Schema.Struct({usage: Schema.optional(ClaudeTokenUsage)})),
		usage: Schema.optional(ClaudeTokenUsage)
	})
)

const claudeJsonlFiles = Effect.fnUntraced(function* (root: string) {
	const fs = yield* FileSystem.FileSystem
	if (!(yield* fs.exists(root))) return []

	return pipe(
		yield* fs.readDirectory(root, {recursive: true}),
		Array.filter(entry => String.endsWith('.jsonl')(entry)),
		Array.map(entry => join(root, entry))
	)
})

function claudeUsageTokens(input: typeof ClaudeTokenUsage.Type) {
	return AgentUsageTokens.make({
		cached: input.cache_read_input_tokens ?? input.cached_input_tokens ?? 0,
		input: input.input_tokens ?? 0,
		output: input.output_tokens ?? 0
	})
}

function addTokens(left: typeof AgentUsageTokens.Type, right: typeof AgentUsageTokens.Type) {
	return {cached: left.cached + right.cached, input: left.input + right.input, output: left.output + right.output}
}

export const loadClaudeUsageTokens = Effect.fnUntraced(function* (input: {readonly projectsRoot: string}) {
	const fs = yield* FileSystem.FileSystem
	const files = yield* pipe(
		claudeJsonlFiles(input.projectsRoot),
		Effect.mapError(cause => new AgentError({cause}))
	)
	const contents = yield* pipe(
		Effect.forEach(files, path => fs.readFileString(path), {concurrency: 'unbounded'}),
		Effect.mapError(cause => new AgentError({cause}))
	)

	return AgentUsageTokens.make(
		pipe(
			contents,
			Array.reduce({cached: 0, input: 0, output: 0}, (total, content) =>
				pipe(
					content,
					String.split('\n'),
					Array.reduce(total, (current, line) =>
						pipe(
							Schema.decodeOption(ClaudeTokenLine)(line),
							Option.match({
								onNone: () => current,
								onSome: value => {
									const usage = value.message?.usage ?? value.usage
									return Predicate.isUndefined(usage) ? current : addTokens(current, claudeUsageTokens(usage))
								}
							})
						)
					)
				)
			)
		)
	)
})

export const makeLayerClaudeUsage = Effect.fnUntraced(function* (_config: {readonly provider: 'claude'}) {
	const client = yield* HttpClient.HttpClient
	const fs = yield* FileSystem.FileSystem
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
	const home = homedir()
	const projectsRoot = join(home, '.claude', 'projects')

	const commandOutput = Effect.fnUntraced(function* (commandName: string, args: readonly string[]) {
		return yield* Effect.scoped(
			Effect.gen(function* () {
				const handle = yield* pipe(
					spawner.spawn(ChildProcess.make(commandName, args, {stderr: 'pipe', stdout: 'pipe'})),
					Effect.mapError(cause => new AgentError({cause}))
				)
				const [stdout, exitCode] = yield* Effect.all([
					Stream.runCollect(handle.stdout).pipe(Effect.map(chunks => Buffer.concat(chunks).toString('utf8'))),
					handle.exitCode
				]).pipe(Effect.mapError(cause => new AgentError({cause})))
				if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
					return yield* new AgentError({message: `${commandName} exited with ${exitCode}`})
				}
				return stdout
			})
		)
	})

	const status = commandOutput('claude', ['auth', 'status', '--json'])
	const keychainCredentials = commandOutput('security', [
		'find-generic-password',
		'-s',
		'Claude Code-credentials',
		'-w'
	])
	const claudeVersion = yield* Effect.cached(
		pipe(
			commandOutput('claude', ['--version']),
			Effect.map(output => /\d+\.\d+\.\d+/u.exec(output)?.[0] ?? '2.0.31'),
			Effect.orElseSucceed(() => '2.0.31')
		)
	)
	const claudeCredentialsFile = pipe(
		fs.readFileString(join(home, '.claude', '.credentials.json')),
		Effect.mapError(cause => new AgentError({cause, message: 'not signed in'}))
	)
	const claudeToken = pipe(
		process.platform === 'darwin'
			? pipe(
					claudeCredentialsFile,
					Effect.catch(() => keychainCredentials)
				)
			: claudeCredentialsFile,
		Effect.flatMap(input =>
			pipe(
				Schema.decodeEffect(ClaudeCredentials)(input),
				Effect.mapError(cause => new AgentError({cause, message: 'not signed in'}))
			)
		),
		Effect.map(credentials => credentials.claudeAiOauth.accessToken)
	)
	function retryAuth<A, R>(effect: Effect.Effect<A, AgentError, R>) {
		return pipe(
			effect,
			Effect.catch(() => pipe(status, Effect.ignore, Effect.andThen(effect)))
		)
	}

	const subscription = pipe(
		pipe(
			status,
			Effect.flatMap(input =>
				pipe(
					Schema.decodeEffect(ClaudeAuthStatus)(input),
					Effect.mapError(cause => new AgentError({cause}))
				)
			),
			Effect.flatMap(input => {
				if (!input.loggedIn) return new AgentError({message: 'not signed in'})
				const label = claudeSubscriptionLabel(input.subscriptionType ?? input.authMethod)
				return Predicate.isString(label)
					? Effect.succeed(AgentSubscription.make(label))
					: new AgentError({message: 'subscription unavailable'})
			})
		),
		Effect.catch(() =>
			pipe(
				status,
				Effect.flatMap(input =>
					pipe(
						Schema.decodeEffect(ClaudeAuthStatus)(input),
						Effect.mapError(cause => new AgentError({cause}))
					)
				),
				Effect.flatMap(input => {
					if (!input.loggedIn) return new AgentError({message: 'not signed in'})
					const label = claudeSubscriptionLabel(input.subscriptionType ?? input.authMethod)
					return Predicate.isString(label)
						? Effect.succeed(AgentSubscription.make(label))
						: new AgentError({message: 'subscription unavailable'})
				})
			)
		)
	)
	const remoteUsage = remoteClaudeUsage(client, claudeToken, claudeVersion)
	const loadUsage = retryAuth(
		Effect.gen(function* () {
			const usage = yield* remoteUsage
			const tokens = yield* loadClaudeUsageTokens({projectsRoot})
			return AgentUsageData.make({
				fiveHour: claudeWindow(usage.five_hour),
				tokens,
				weekly: claudeWindow(usage.seven_day)
			})
		})
	).pipe(Effect.provideService(FileSystem.FileSystem, fs))
	const usage = yield* SubscriptionRef.make<Option.Option<Exit.Exit<typeof AgentUsageData.Type, AgentError>>>(
		Array.head([])
	)
	yield* pipe(
		Stream.fromEffect(Effect.exit(loadUsage)),
		Stream.repeat(Schedule.spaced('1 minute')),
		Stream.runForEach(value => SubscriptionRef.set(usage, Array.head([value]))),
		Effect.forkScoped
	)

	return {subscription, usage}
})

function claudeSubscriptionLabel(value: string | undefined) {
	if (!Predicate.isString(value)) return
	return pipe(
		value,
		String.trim,
		String.split(/[\s_-]+/u),
		Array.filter(
			token =>
				String.isNonEmpty(token) && String.toLowerCase(token) !== 'default' && String.toLowerCase(token) !== 'claude'
		),
		Array.map(token =>
			/^\d+x$/u.test(String.toLowerCase(token)) ? String.toLowerCase(token) : String.capitalize(token)
		),
		tokens => (Array.isReadonlyArrayEmpty(tokens) ? undefined : Array.join(tokens, ' '))
	)
}

function claudeWindow(input: typeof ClaudeUsageWindow.Type) {
	return {resetsAt: input.resets_at ?? undefined, utilization: input.utilization}
}

function remoteClaudeUsage(
	client: HttpClient.HttpClient,
	token: Effect.Effect<string, AgentError>,
	version: Effect.Effect<string>
) {
	return pipe(
		Effect.fnUntraced(function* () {
			const [accessToken, claudeVersion] = yield* Effect.all([token, version], {concurrency: 2})
			const response = yield* pipe(
				client.get('https://api.anthropic.com/api/oauth/usage', {
					headers: {
						'anthropic-beta': 'oauth-2025-04-20',
						authorization: `Bearer ${accessToken}`,
						'user-agent': `claude-code/${claudeVersion}`
					}
				}),
				Effect.mapError(cause => new AgentError({cause}))
			)
			if (response.status !== 200) {
				return yield* new AgentError({
					message: response.status === 401 ? 'not signed in' : `claude usage responded with status ${response.status}`
				})
			}
			return yield* pipe(
				response.json,
				Effect.flatMap(Schema.decodeUnknownEffect(ClaudeUsage)),
				Effect.mapError(cause => new AgentError({cause}))
			)
		})(),
		Effect.timeout('10 seconds'),
		Effect.mapError(cause => new AgentError({cause}))
	)
}
