import {cpus, freemem, homedir, totalmem} from 'node:os'

import {Config, Context, Effect, FileSystem, Layer, Schema, Stream, pipe} from 'effect'

import {HttpClient} from 'effect/unstable/http'
import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import {SystemUsage, UsageError, UsageProvider, UsageWindow} from './schema.ts'

const ClaudeCredentials = Schema.fromJsonString(
	Schema.Struct({claudeAiOauth: Schema.Struct({accessToken: Schema.String})})
)

const ClaudeUsageWindow = Schema.Struct({
	resets_at: Schema.optional(Schema.NullOr(Schema.String)),
	utilization: Schema.Number
})

const ClaudeUsage = Schema.Struct({five_hour: ClaudeUsageWindow, seven_day: ClaudeUsageWindow})

const CodexCredentials = Schema.fromJsonString(Schema.Struct({tokens: Schema.Struct({access_token: Schema.String})}))

const CodexUsageWindow = Schema.Struct({
	reset_at: Schema.optional(Schema.NullOr(Schema.Number)),
	used_percent: Schema.Number
})

const CodexUsage = Schema.Struct({
	rate_limit: Schema.Struct({primary_window: CodexUsageWindow, secondary_window: CodexUsageWindow})
})

function codexWindow(window: typeof CodexUsageWindow.Type) {
	return new UsageWindow({
		resetsAt: typeof window.reset_at === 'number' ? new Date(window.reset_at * 1000).toISOString() : undefined,
		utilization: window.used_percent
	})
}

function cpuTimes() {
	return cpus().reduce(
		(total, cpu) => ({
			idle: total.idle + cpu.times.idle,
			total: total.total + cpu.times.idle + cpu.times.irq + cpu.times.nice + cpu.times.sys + cpu.times.user
		}),
		{idle: 0, total: 0}
	)
}

function usageError(error: unknown) {
	return error instanceof UsageError ? error : new UsageError({cause: error})
}

const fallbackClaudeVersion = '2.0.31'

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
				Effect.map(output => /\d+\.\d+\.\d+/u.exec(output)?.[0] ?? fallbackClaudeVersion),
				Effect.orElseSucceed(() => fallbackClaudeVersion)
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

		const system = pipe(
			Effect.gen(function* () {
				const before = cpuTimes()
				yield* Effect.sleep('250 millis')
				const after = cpuTimes()
				const total = after.total - before.total
				const idle = after.idle - before.idle
				return new SystemUsage({
					cpuUtilization: total <= 0 ? 0 : ((total - idle) / total) * 100,
					memoryUtilization: ((totalmem() - freemem()) / totalmem()) * 100
				})
			}),
			Effect.withSpan('Usage.system')
		)

		const claude = pipe(
			Effect.all({token: claudeToken, version: claudeVersion}, {concurrency: 2}),
			Effect.flatMap(({token, version}) =>
				client.get('https://api.anthropic.com/api/oauth/usage', {
					headers: {
						'anthropic-beta': 'oauth-2025-04-20',
						authorization: `Bearer ${token}`,
						'user-agent': `claude-code/${version}`
					}
				})
			),
			Effect.flatMap(response =>
				Effect.gen(function* () {
					if (response.status === 401) return yield* new UsageError({message: 'not signed in'})
					if (response.status !== 200) {
						return yield* new UsageError({message: `claude usage responded with status ${response.status}`})
					}
					const usage = yield* Effect.flatMap(response.json, Schema.decodeUnknownEffect(ClaudeUsage))
					return new UsageProvider({
						fiveHour: new UsageWindow({
							resetsAt: usage.five_hour.resets_at ?? undefined,
							utilization: usage.five_hour.utilization
						}),
						weekly: new UsageWindow({
							resetsAt: usage.seven_day.resets_at ?? undefined,
							utilization: usage.seven_day.utilization
						})
					})
				})
			),
			Effect.timeout('10 seconds'),
			Effect.mapError(usageError),
			Effect.withSpan('Usage.claude')
		)

		const codex = pipe(
			codexToken,
			Effect.flatMap(token =>
				client.get('https://chatgpt.com/backend-api/wham/usage', {headers: {authorization: `Bearer ${token}`}})
			),
			Effect.flatMap(response =>
				Effect.gen(function* () {
					if (response.status === 401) return yield* new UsageError({message: 'not signed in'})
					if (response.status !== 200) {
						return yield* new UsageError({message: `codex usage responded with status ${response.status}`})
					}
					const usage = yield* Effect.flatMap(response.json, Schema.decodeUnknownEffect(CodexUsage))
					return new UsageProvider({
						fiveHour: codexWindow(usage.rate_limit.primary_window),
						weekly: codexWindow(usage.rate_limit.secondary_window)
					})
				})
			),
			Effect.timeout('10 seconds'),
			Effect.mapError(usageError),
			Effect.withSpan('Usage.codex')
		)

		return {claude, codex, system}
	})
}) {
	public static layer = Layer.effect(this, this.make)
}
