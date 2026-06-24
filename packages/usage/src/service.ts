import {homedir} from 'node:os'

import {Config, Context, Effect, FileSystem, Layer, Match, Predicate, Schema, Stream, pipe} from 'effect'

import {HttpClient} from 'effect/unstable/http'
import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import {
	ClaudeCredentials,
	ClaudeUsage,
	CodexCredentials,
	CodexUsage,
	NodeProcessUsage,
	SystemUsage,
	UsageError,
	UsageProvider,
	UsageWindow
} from './schema.ts'
import {cpuTimes, cpuUtilization, darwinMemoryUtilization, nodeProcessUsage, osMemoryUtilization} from './system.ts'

export class Usage extends Context.Service<Usage>()('@deslop/usage/service/Usage', {
	make: Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient
		const fs = yield* FileSystem.FileSystem
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const home = yield* pipe(Config.string('HOME'), Config.withDefault(homedir()))
		const codexHome = yield* pipe(Config.string('CODEX_HOME'), Config.withDefault(`${home}/.codex`))

		const commandOutput = Effect.fn('Usage.commandOutput')(function* (command: string, args: readonly string[]) {
			return yield* Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* spawner.spawn(ChildProcess.make(command, args, {stderr: 'pipe', stdout: 'pipe'}))
					const stdout = yield* pipe(
						Stream.decodeText(handle.stdout),
						Stream.mkString,
						Effect.orElseSucceed(() => '')
					)
					const exitCode = yield* handle.exitCode
					if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
						return yield* new UsageError({message: `${command} exited with ${exitCode}`})
					}
					return stdout
				})
			)
		})

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

		const claudeCredentialsFile = fs.readFileString(`${home}/.claude/.credentials.json`)
		const claudeToken = pipe(
			process.platform === 'darwin'
				? pipe(
						claudeCredentialsFile,
						Effect.catch(() => keychainCredentials)
					)
				: claudeCredentialsFile,
			Effect.flatMap(Schema.decodeEffect(ClaudeCredentials)),
			Effect.map(credentials => credentials.claudeAiOauth.accessToken),
			Effect.catch(() => new UsageError({message: 'not signed in'}))
		)

		const codexToken = pipe(
			fs.readFileString(`${codexHome}/auth.json`),
			Effect.flatMap(Schema.decodeEffect(CodexCredentials)),
			Effect.map(credentials => credentials.tokens.access_token),
			Effect.catch(() => new UsageError({message: 'not signed in'}))
		)

		const memoryUtilization =
			process.platform === 'darwin'
				? pipe(
						Effect.all(
							{
								memsizeOutput: commandOutput('sysctl', ['-n', 'hw.memsize']),
								vmStatOutput: commandOutput('vm_stat', [])
							},
							{concurrency: 2}
						),
						Effect.map(darwinMemoryUtilization),
						Effect.catch(() => Effect.sync(osMemoryUtilization))
					)
				: Effect.sync(osMemoryUtilization)

		const system = pipe(
			Effect.gen(function* () {
				const before = cpuTimes()
				yield* Effect.sleep('250 millis')
				const after = cpuTimes()
				return SystemUsage.make({
					cpuUtilization: cpuUtilization({after, before}),
					memoryUtilization: yield* memoryUtilization,
					nodeProcess: NodeProcessUsage.make(nodeProcessUsage())
				})
			}),
			Effect.withSpan('Usage.system')
		)

		const claude = pipe(
			Effect.all({token: claudeToken, version: claudeVersion}, {concurrency: 2}),
			Effect.flatMap(credentials =>
				client.get('https://api.anthropic.com/api/oauth/usage', {
					headers: {
						'anthropic-beta': 'oauth-2025-04-20',
						authorization: `Bearer ${credentials.token}`,
						'user-agent': `claude-code/${credentials.version}`
					}
				})
			),
			Effect.flatMap(response =>
				Effect.gen(function* () {
					yield* pipe(
						Match.value(response.status),
						Match.when(401, () => new UsageError({message: 'not signed in'})),
						Match.when(200, () => Effect.void),
						Match.orElse(status => new UsageError({message: `claude usage responded with status ${status}`}))
					)
					const usage = yield* Effect.flatMap(response.json, Schema.decodeUnknownEffect(ClaudeUsage))
					return UsageProvider.make({
						fiveHour: UsageWindow.make({
							resetsAt: usage.five_hour.resets_at ?? undefined,
							utilization: usage.five_hour.utilization
						}),
						weekly: UsageWindow.make({
							resetsAt: usage.seven_day.resets_at ?? undefined,
							utilization: usage.seven_day.utilization
						})
					})
				})
			),
			Effect.timeout('10 seconds'),
			Effect.mapError(cause => new UsageError({cause})),
			Effect.withSpan('Usage.claude')
		)

		const codex = pipe(
			codexToken,
			Effect.flatMap(token =>
				client.get('https://chatgpt.com/backend-api/wham/usage', {headers: {authorization: `Bearer ${token}`}})
			),
			Effect.flatMap(response =>
				Effect.gen(function* () {
					yield* pipe(
						Match.value(response.status),
						Match.when(401, () => new UsageError({message: 'not signed in'})),
						Match.when(200, () => Effect.void),
						Match.orElse(status => new UsageError({message: `codex usage responded with status ${status}`}))
					)
					const usage = yield* Effect.flatMap(response.json, Schema.decodeUnknownEffect(CodexUsage))
					return UsageProvider.make({
						fiveHour: UsageWindow.make({
							resetsAt: Predicate.isNumber(usage.rate_limit.primary_window.reset_at)
								? new Date(usage.rate_limit.primary_window.reset_at * 1000).toISOString()
								: undefined,
							utilization: usage.rate_limit.primary_window.used_percent
						}),
						weekly: UsageWindow.make({
							resetsAt: Predicate.isNumber(usage.rate_limit.secondary_window.reset_at)
								? new Date(usage.rate_limit.secondary_window.reset_at * 1000).toISOString()
								: undefined,
							utilization: usage.rate_limit.secondary_window.used_percent
						})
					})
				})
			),
			Effect.timeout('10 seconds'),
			Effect.mapError(cause => new UsageError({cause})),
			Effect.withSpan('Usage.codex')
		)

		return {claude, codex, system}
	})
}) {
	public static layer = Layer.effect(this, this.make)
}
