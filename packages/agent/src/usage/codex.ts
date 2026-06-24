import {homedir} from 'node:os'
import {join, resolve} from 'node:path'

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

const CodexCredentials = Schema.fromJsonString(Schema.Struct({tokens: Schema.Struct({access_token: Schema.String})}))

const CodexUsage = Schema.Struct({
	plan_type: Schema.optional(Schema.NullOr(Schema.String)),
	rate_limit: Schema.Struct({
		primary_window: Schema.Struct({
			reset_at: Schema.optional(Schema.NullOr(Schema.Number)),
			used_percent: Schema.Number
		}),
		secondary_window: Schema.Struct({
			reset_at: Schema.optional(Schema.NullOr(Schema.Number)),
			used_percent: Schema.Number
		})
	})
})

const CodexTokenUsage = Schema.Struct({
	cached_input_tokens: Schema.optional(Schema.Number),
	input_tokens: Schema.optional(Schema.Number),
	output_tokens: Schema.optional(Schema.Number)
})

const CodexTokenLine = Schema.fromJsonString(
	Schema.Struct({
		payload: Schema.optional(
			Schema.Struct({
				info: Schema.optional(
					Schema.Struct({
						last_token_usage: Schema.optional(CodexTokenUsage),
						total_token_usage: Schema.optional(CodexTokenUsage)
					})
				),
				usage: Schema.optional(CodexTokenUsage)
			})
		),
		usage: Schema.optional(CodexTokenUsage)
	})
)

const codexJsonlFiles = Effect.fnUntraced(function* (root: string) {
	const fs = yield* FileSystem.FileSystem
	if (!(yield* fs.exists(root))) return []

	return pipe(
		yield* fs.readDirectory(root, {recursive: true}),
		Array.filter(entry => String.endsWith('.jsonl')(entry)),
		Array.map(entry => join(root, entry))
	)
})

function codexUsageTokens(input: typeof CodexTokenUsage.Type) {
	return {cached: input.cached_input_tokens ?? 0, input: input.input_tokens ?? 0, output: input.output_tokens ?? 0}
}

function addTokens(left: typeof AgentUsageTokens.Type, right: typeof AgentUsageTokens.Type) {
	return {cached: left.cached + right.cached, input: left.input + right.input, output: left.output + right.output}
}

function sameTokens(left: typeof AgentUsageTokens.Type | undefined, right: typeof AgentUsageTokens.Type) {
	return (
		Predicate.isNotUndefined(left) &&
		left.cached === right.cached &&
		left.input === right.input &&
		left.output === right.output
	)
}

export const loadCodexUsageTokens = Effect.fnUntraced(function* (input: {readonly codexRoot: string}) {
	const fs = yield* FileSystem.FileSystem
	const files = yield* pipe(
		Effect.all(
			[codexJsonlFiles(join(input.codexRoot, 'sessions')), codexJsonlFiles(join(input.codexRoot, 'archived_sessions'))],
			{concurrency: 'unbounded'}
		),
		Effect.map(Array.flatten),
		Effect.mapError(cause => new AgentError({cause}))
	)
	const tokens = yield* pipe(
		Effect.forEach(
			files,
			path =>
				pipe(
					fs.readFileString(path),
					Effect.map(content =>
						pipe(
							content,
							String.split('\n'),
							Array.reduce(
								{
									previousExplicit: undefined as typeof AgentUsageTokens.Type | undefined,
									previousTotal: undefined as typeof AgentUsageTokens.Type | undefined,
									total: AgentUsageTokens.make({cached: 0, input: 0, output: 0})
								},
								(current, line) =>
									pipe(
										Schema.decodeOption(CodexTokenLine)(line),
										Option.match({
											onNone: () => current,
											onSome: value => {
												if (Predicate.isNotUndefined(value.payload?.info?.total_token_usage)) {
													const nextTotal = codexUsageTokens(value.payload.info.total_token_usage)
													return {
														previousExplicit: undefined,
														previousTotal: nextTotal,
														total: addTokens(
															current.total,
															Predicate.isUndefined(current.previousTotal)
																? nextTotal
																: {
																		cached: Math.max(0, nextTotal.cached - current.previousTotal.cached),
																		input: Math.max(0, nextTotal.input - current.previousTotal.input),
																		output: Math.max(0, nextTotal.output - current.previousTotal.output)
																	}
														)
													}
												}

												const explicit = value.payload?.info?.last_token_usage ?? value.payload?.usage ?? value.usage
												if (Predicate.isUndefined(explicit)) return current

												const nextExplicit = codexUsageTokens(explicit)
												return {
													...current,
													previousExplicit: nextExplicit,
													total: sameTokens(current.previousExplicit, nextExplicit)
														? current.total
														: addTokens(current.total, nextExplicit)
												}
											}
										})
									)
							),
							result => result.total
						)
					)
				),
			{concurrency: 8}
		),
		Effect.mapError(cause => new AgentError({cause}))
	)

	return AgentUsageTokens.make(
		pipe(
			tokens,
			Array.reduce({cached: 0, input: 0, output: 0}, (total, value) => addTokens(total, value))
		)
	)
})

export const makeLayerCodexUsage = Effect.fnUntraced(function* (_config: {readonly provider: 'codex'}) {
	const client = yield* HttpClient.HttpClient
	const fs = yield* FileSystem.FileSystem
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
	const codexRoot = pipe(process.env['CODEX_HOME'] ?? '', String.trim, value =>
		String.isNonEmpty(value) ? resolve(value) : join(homedir(), '.codex')
	)

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

	const status = commandOutput('codex', ['login', 'status'])
	function retryAuth<A, R>(effect: Effect.Effect<A, AgentError, R>) {
		return pipe(
			effect,
			Effect.catch(() => pipe(status, Effect.ignore, Effect.andThen(effect)))
		)
	}

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

	const remoteUsage = remoteCodexUsage(client, codexToken)
	const subscription = retryAuth(
		pipe(
			remoteUsage,
			Effect.map(usage => codexSubscriptionLabel(usage.plan_type)),
			Effect.flatMap(label =>
				Predicate.isString(label)
					? Effect.succeed(AgentSubscription.make(label))
					: new AgentError({message: 'subscription unavailable'})
			)
		)
	)
	const loadUsage = retryAuth(
		Effect.gen(function* () {
			const usage = yield* remoteUsage
			const tokens = yield* loadCodexUsageTokens({codexRoot})
			return AgentUsageData.make({
				fiveHour: codexWindow(usage.rate_limit.primary_window),
				tokens,
				weekly: codexWindow(usage.rate_limit.secondary_window)
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
		resetsAt: Predicate.isNumber(input.reset_at) ? new Date(input.reset_at * 1000).toISOString() : undefined,
		utilization: input.used_percent
	}
}

function remoteCodexUsage(client: HttpClient.HttpClient, token: Effect.Effect<string, AgentError>) {
	return pipe(
		Effect.fnUntraced(function* () {
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
		})(),
		Effect.timeout('10 seconds'),
		Effect.mapError(cause => new AgentError({cause}))
	)
}
