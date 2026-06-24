import {execFile} from 'node:child_process'
import {access, readdir, readFile, rm} from 'node:fs/promises'
import {homedir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {Array, Context, Effect, Layer, Option, Predicate, Schedule, Stream, String, pipe} from 'effect'

import {AgentBrowserError, AgentBrowserHealth, AgentBrowserSession} from './schema.ts'

const sessionNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u

export function validAgentBrowserSessionName(name: string) {
	return sessionNamePattern.test(name)
}

export function agentBrowserSessionNameForAgent(uuid: string) {
	return `deslop-agent-${uuid}`
}

export function agentBrowserSocketDirs(env: NodeJS.ProcessEnv = process.env) {
	return pipe(
		[
			env['AGENT_BROWSER_SOCKET_DIR'],
			Predicate.isUndefined(env['XDG_RUNTIME_DIR']) ? undefined : path.join(env['XDG_RUNTIME_DIR'], 'agent-browser'),
			path.join(env['HOME'] ?? homedir(), '.agent-browser')
		],
		Array.filter(Predicate.isString),
		Array.dedupe
	)
}

function parsePort(source: string) {
	const port = Number.parseInt(String.trim(source), 10)
	return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : undefined
}

function parsePid(source: string) {
	const pid = Number.parseInt(String.trim(source), 10)
	return Number.isInteger(pid) && pid > 0 ? pid : undefined
}

function processAlive(pid: number) {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

function optionalFile(file: string) {
	return pipe(
		Effect.tryPromise(() => readFile(file, 'utf8')),
		Effect.option,
		Effect.map(Option.map(String.trim)),
		Effect.map(Option.filter(String.isNonEmpty)),
		Effect.map(Option.getOrUndefined)
	)
}

function removeSidecars(socketDir: string, session: string) {
	return pipe(
		Effect.forEach(['stream', 'pid', 'engine', 'version'], extension =>
			Effect.tryPromise(() => rm(path.join(socketDir, `${session}.${extension}`), {force: true}))
		),
		Effect.ignore
	)
}

export const agentBrowserMetadata = Effect.fn('AgentBrowser.metadata')(function* (input: {
	readonly session: string
	readonly socketDir: string
}) {
	if (!validAgentBrowserSessionName(input.session)) {
		return yield* new AgentBrowserError({message: `Invalid agent-browser session: ${input.session}`})
	}

	const streamFile = path.join(input.socketDir, `${input.session}.stream`)
	const pidFile = path.join(input.socketDir, `${input.session}.pid`)
	const streamPort = yield* pipe(
		Effect.tryPromise(() => readFile(streamFile, 'utf8')),
		Effect.map(parsePort),
		Effect.mapError(
			cause => new AgentBrowserError({cause, message: `Unknown agent-browser session: ${input.session}`})
		),
		Effect.flatMap(port =>
			Predicate.isUndefined(port)
				? Effect.fail(new AgentBrowserError({message: `Invalid stream metadata for ${input.session}`}))
				: Effect.succeed(port)
		)
	)
	const pid = yield* pipe(
		Effect.tryPromise(() => readFile(pidFile, 'utf8')),
		Effect.map(parsePid),
		Effect.mapError(cause => new AgentBrowserError({cause, message: `Missing pid metadata for ${input.session}`})),
		Effect.flatMap(value =>
			Predicate.isUndefined(value)
				? Effect.fail(new AgentBrowserError({message: `Invalid pid metadata for ${input.session}`}))
				: Effect.succeed(value)
		)
	)
	if (!processAlive(pid)) {
		yield* removeSidecars(input.socketDir, input.session)
		return yield* new AgentBrowserError({message: `Stale agent-browser session: ${input.session}`})
	}

	return AgentBrowserSession.make({
		engine: yield* optionalFile(path.join(input.socketDir, `${input.session}.engine`)),
		name: input.session,
		pid,
		socketDir: input.socketDir,
		streamPort,
		version: yield* optionalFile(path.join(input.socketDir, `${input.session}.version`))
	})
})

const discoverSocketDir = Effect.fn('AgentBrowser.discoverSocketDir')(function* (socketDir: string) {
	const files = yield* pipe(
		Effect.tryPromise(() => readdir(socketDir)),
		Effect.catch(() => Effect.succeed<readonly string[]>([]))
	)
	const sessions = pipe(
		files,
		Array.filter(String.endsWith('.stream')),
		Array.map(file => String.slice(0, -'.stream'.length)(file)),
		Array.filter(validAgentBrowserSessionName),
		Array.dedupe
	)

	return yield* pipe(
		sessions,
		Effect.forEach(
			sessionName =>
				pipe(
					agentBrowserMetadata({session: sessionName, socketDir}),
					Effect.match({onFailure: () => [], onSuccess: metadata => [metadata]})
				),
			{concurrency: 8}
		),
		Effect.map(Array.flatten)
	)
})

function packageRoot() {
	return path.dirname(fileURLToPath(import.meta.url))
}

function selfAndParents(directory: string): readonly string[] {
	const parent = path.dirname(directory)
	return parent === directory ? [directory] : [directory, ...selfAndParents(parent)]
}

function candidateBinDirs() {
	const start = packageRoot()
	return pipe(
		[
			...Array.map(selfAndParents(start), directory => path.join(directory, 'node_modules', '.bin')),
			path.resolve(start, '..', 'node_modules', '.bin')
		],
		Array.dedupe
	)
}

const executableName = process.platform === 'win32' ? 'agent-browser.cmd' : 'agent-browser'

const resolveAgentBrowserBin = Effect.gen(function* () {
	for (const binDir of candidateBinDirs()) {
		const bin = path.join(binDir, executableName)
		const available = yield* pipe(
			Effect.tryPromise(() => access(bin)),
			Effect.as(true),
			Effect.catch(() => Effect.succeed(false))
		)
		if (available) return {bin, binDir}
	}

	return yield* new AgentBrowserError({message: 'agent-browser CLI is not installed'})
})

function execAgentBrowser(args: readonly string[]) {
	return pipe(
		resolveAgentBrowserBin,
		Effect.flatMap(resolved =>
			Effect.tryPromise({
				catch: cause => new AgentBrowserError({cause, message: 'agent-browser command failed'}),
				try: () =>
					new Promise<void>((resolve, reject) => {
						execFile(resolved.bin, [...args], (cause, stdout, stderr) => {
							if (cause) {
								reject(
									new AgentBrowserError({cause, message: String.trim(stderr) || String.trim(stdout) || cause.message})
								)
								return
							}
							resolve()
						})
					})
			})
		)
	)
}

export class AgentBrowser extends Context.Service<AgentBrowser>()('@deslop/agent-browser/service/AgentBrowser', {
	make: Effect.gen(function* () {
		return {
			browserEnv: Effect.fn('AgentBrowser.browserEnv')(function* (input: {readonly session: string}) {
				if (!validAgentBrowserSessionName(input.session)) {
					return yield* new AgentBrowserError({message: `Invalid agent-browser session: ${input.session}`})
				}
				const resolved = yield* resolveAgentBrowserBin
				return {
					AGENT_BROWSER_SESSION: input.session,
					PATH: `${resolved.binDir}${path.delimiter}${process.env['PATH'] ?? ''}`
				}
			}),
			close: Effect.fn('AgentBrowser.close')(function* (input: {readonly session: string}) {
				if (!validAgentBrowserSessionName(input.session)) {
					return yield* new AgentBrowserError({message: `Invalid agent-browser session: ${input.session}`})
				}
				yield* execAgentBrowser(['--session', input.session, 'close'])
			}),
			health: pipe(
				resolveAgentBrowserBin,
				Effect.map(resolved => AgentBrowserHealth.make({available: true, bin: resolved.bin, binDir: resolved.binDir})),
				Effect.catch(() => Effect.succeed(AgentBrowserHealth.make({available: false})))
			),
			open: Effect.fn('AgentBrowser.open')(function* (input: {readonly session: string; readonly url: string}) {
				if (!validAgentBrowserSessionName(input.session)) {
					return yield* new AgentBrowserError({message: `Invalid agent-browser session: ${input.session}`})
				}
				yield* execAgentBrowser(['--session', input.session, 'open', input.url])
			}),
			session: Effect.fn('AgentBrowser.session')(function* (input: {readonly session: string}) {
				const sessions = yield* pipe(
					agentBrowserSocketDirs(),
					Effect.forEach(socketDir =>
						pipe(
							agentBrowserMetadata({session: input.session, socketDir}),
							Effect.match({onFailure: () => [], onSuccess: metadata => [metadata]})
						)
					),
					Effect.map(Array.flatten)
				)
				const session = sessions[0]
				if (Predicate.isUndefined(session)) {
					return yield* new AgentBrowserError({message: `Unknown agent-browser session: ${input.session}`})
				}
				return session
			}),
			sessions: pipe(
				Stream.fromEffect(pipe(agentBrowserSocketDirs(), Effect.forEach(discoverSocketDir), Effect.map(Array.flatten))),
				Stream.repeat(Schedule.spaced('1 second'))
			)
		}
	})
}) {
	public static layer = Layer.effect(this, this.make)
}
