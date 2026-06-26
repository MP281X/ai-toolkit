import {readdir, readFile, rm} from 'node:fs/promises'
import {homedir} from 'node:os'
import path from 'node:path'

import {
	Array,
	Context,
	Effect,
	Hash,
	HashSet,
	Layer,
	Option,
	Predicate,
	Schedule,
	Schema,
	Semaphore,
	Stream,
	String,
	pipe
} from 'effect'

import {HttpServerRequest, HttpServerResponse} from 'effect/unstable/http'
import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'
import {Socket} from 'effect/unstable/socket'

import {AgentBrowserError, AgentBrowserHealth, AgentBrowserSession, AgentBrowserTabListResponse} from './schema.ts'

function validViewportDimension(value: number) {
	return Number.isInteger(value) && value >= 320 && value <= 4096
}

function socketDir(env: NodeJS.ProcessEnv = process.env) {
	if (Predicate.isNotUndefined(env['AGENT_BROWSER_SOCKET_DIR']) && String.isNonEmpty(env['AGENT_BROWSER_SOCKET_DIR'])) {
		return env['AGENT_BROWSER_SOCKET_DIR']
	}

	if (Predicate.isNotUndefined(env['XDG_RUNTIME_DIR']) && String.isNonEmpty(env['XDG_RUNTIME_DIR'])) {
		return path.join(env['XDG_RUNTIME_DIR'], 'agent-browser')
	}

	return path.join(env['HOME'] ?? homedir(), '.agent-browser')
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
	} catch (error) {
		return Predicate.hasProperty(error, 'code') && error.code === 'EPERM'
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

function extensionPaths(source: string | undefined) {
	if (Predicate.isUndefined(source)) return []
	return pipe(String.split(',')(source), Array.map(String.trim), Array.filter(String.isNonEmpty))
}

function removeSidecars(directory: string, session: string) {
	return pipe(
		Effect.forEach(['sock', 'stream', 'pid', 'engine', 'provider', 'version', 'extensions'], extension =>
			Effect.tryPromise(() => rm(path.join(directory, `${session}.${extension}`), {force: true}))
		),
		Effect.ignore
	)
}

const metadata = Effect.fn('AgentBrowser.metadata')(function* (input: {
	readonly session: string
	readonly socketDir: string
}) {
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(input.session)) {
		return yield* new AgentBrowserError({message: `Invalid agent-browser session: ${input.session}`})
	}

	const streamPort = yield* pipe(
		Effect.tryPromise(() => readFile(path.join(input.socketDir, `${input.session}.stream`), 'utf8')),
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
		Effect.tryPromise(() => readFile(path.join(input.socketDir, `${input.session}.pid`), 'utf8')),
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
		extensions: extensionPaths(yield* optionalFile(path.join(input.socketDir, `${input.session}.extensions`))),
		name: input.session,
		pid,
		provider: yield* optionalFile(path.join(input.socketDir, `${input.session}.provider`)),
		streamPort,
		version: yield* optionalFile(path.join(input.socketDir, `${input.session}.version`))
	})
})

const discoverSessions = Effect.gen(function* () {
	const directory = socketDir()
	const files = yield* pipe(
		Effect.tryPromise(() => readdir(directory)),
		Effect.catch(() => Effect.succeed<readonly string[]>([]))
	)
	const sessionNames = pipe(
		files,
		Array.filter(String.endsWith('.stream')),
		Array.map(file => String.slice(0, -'.stream'.length)(file)),
		Array.filter(session => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(session)),
		Array.dedupe
	)

	return yield* pipe(
		sessionNames,
		Effect.forEach(
			session =>
				pipe(
					metadata({session, socketDir: directory}),
					Effect.match({onFailure: () => [], onSuccess: value => [value]})
				),
			{concurrency: 8}
		),
		Effect.map(Array.flatten)
	)
})

function streamSessionPath(url: string) {
	const match = /^\/api\/agent-browser\/sessions\/([^/]+)\/stream$/u.exec(new URL(url, 'http://localhost').pathname)
	if (Predicate.isNull(match)) return
	return match[1]
}

function sameOrigin(request: HttpServerRequest.HttpServerRequest) {
	if (Predicate.isUndefined(request.headers['origin']) || Predicate.isUndefined(request.headers['host'])) return false
	try {
		return new URL(request.headers['origin']).host === request.headers['host']
	} catch {
		return false
	}
}

function comparableUrl(source: string) {
	try {
		return new URL(source).href
	} catch {
		return source
	}
}

function sameUrl(left: string, right: string) {
	try {
		const leftUrl = new URL(left)
		const rightUrl = new URL(right)
		if (rightUrl.pathname === '/' && rightUrl.search === '' && rightUrl.hash === '') {
			return leftUrl.origin === rightUrl.origin
		}
		return leftUrl.href === rightUrl.href
	} catch {
		return comparableUrl(left) === comparableUrl(right)
	}
}

function tabKey(source: string) {
	const normalized = comparableUrl(source)
	const slug = pipe(
		normalized,
		String.toLowerCase,
		String.replaceAll(/[^a-z0-9]+/gu, '-'),
		String.replace(/^-+|-+$/gu, ''),
		String.slice(0, 64)
	)
	return `portless-${String.isEmpty(slug) ? 'tab' : slug}-${Math.abs(Hash.string(normalized))}`
}

function proxyStream(sessionName: string) {
	return pipe(
		Effect.gen(function* () {
			const request = yield* HttpServerRequest.HttpServerRequest
			if (!sameOrigin(request)) return HttpServerResponse.empty({status: 403})
			const agentBrowser = yield* AgentBrowser
			const session = yield* pipe(agentBrowser.session({session: sessionName}), Effect.option)
			if (Option.isNone(session)) return HttpServerResponse.empty({status: 404})

			const outbound = yield* pipe(
				Socket.makeWebSocket(`ws://127.0.0.1:${session.value.streamPort}`),
				Effect.provide(Socket.layerWebSocketConstructorGlobal),
				Effect.option
			)
			if (Option.isNone(outbound)) return HttpServerResponse.empty({status: 502})

			const inbound = yield* request.upgrade
			const writeInbound = yield* inbound.writer
			const writeOutbound = yield* outbound.value.writer

			yield* Effect.all(
				[
					outbound.value
						.runRaw(message => writeInbound(message))
						.pipe(
							Effect.catchReason('SocketError', 'SocketCloseError', reason =>
								writeInbound(new Socket.CloseEvent(reason.code, reason.closeReason)).pipe(
									Effect.catch(() => Effect.void)
								)
							),
							Effect.catch(() =>
								writeInbound(new Socket.CloseEvent(1011, 'agent-browser proxy error')).pipe(
									Effect.catch(() => Effect.void)
								)
							)
						),
					inbound
						.runRaw(message => writeOutbound(Predicate.isString(message) ? message : message.slice()))
						.pipe(
							Effect.catch(() => Effect.void),
							Effect.ensuring(writeOutbound(new Socket.CloseEvent()).pipe(Effect.catch(() => Effect.void)))
						)
				],
				{concurrency: 'unbounded', discard: true}
			)

			return HttpServerResponse.empty()
		}),
		Effect.catch(() => Effect.succeed(HttpServerResponse.empty({status: 404})))
	)
}

export class AgentBrowser extends Context.Service<AgentBrowser>()('@deslop/agent-browser/service/AgentBrowser', {
	make: Effect.gen(function* () {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const tabLock = yield* Semaphore.make(1)
		const run = Effect.fn('AgentBrowser.run')(function* (args: readonly string[]) {
			return yield* Effect.scoped(
				Effect.gen(function* () {
					const handle = yield* pipe(
						spawner.spawn(
							ChildProcess.make('vpx', ['agent-browser', ...args], {
								env: {...process.env, AGENT_BROWSER_ENABLE: 'react-devtools'},
								stderr: 'pipe',
								stdout: 'pipe'
							})
						),
						Effect.mapError(cause => new AgentBrowserError({cause, message: 'failed to spawn agent-browser'}))
					)
					const output = yield* Effect.all(
						{
							stderr: pipe(
								Stream.decodeText(handle.stderr),
								Stream.mkString,
								Effect.orElseSucceed(() => '')
							),
							stdout: pipe(
								Stream.decodeText(handle.stdout),
								Stream.mkString,
								Effect.orElseSucceed(() => '')
							)
						},
						{concurrency: 'unbounded'}
					)
					const exitCode = yield* pipe(
						handle.exitCode,
						Effect.mapError(cause => new AgentBrowserError({cause, message: 'agent-browser command failed'}))
					)
					if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
						const stderr = String.trim(output.stderr)
						const stdout = String.trim(output.stdout)
						return yield* new AgentBrowserError({
							cause: new Error(
								stderr || stdout || `vpx agent-browser ${Array.join(' ')(args)} exited with ${exitCode}`
							),
							message: stderr || stdout || 'agent-browser command failed'
						})
					}
					return output.stdout
				})
			)
		})
		const validateSession = Effect.fnUntraced(function* (session: string) {
			if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(session)) {
				return yield* new AgentBrowserError({message: `Invalid agent-browser session: ${session}`})
			}
		})
		const listTabs = Effect.fn('AgentBrowser.listTabs')(function* (session: string) {
			yield* validateSession(session)
			return yield* pipe(
				run(['--json', '--session', session, 'tab']),
				Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(AgentBrowserTabListResponse))),
				Effect.map(response => response.data.tabs)
			)
		})
		const syncTabs = Effect.fn('AgentBrowser.syncTabs')(function* (input: {
			readonly active: readonly {readonly url: string}[]
			readonly inactive: readonly {readonly url: string}[]
			readonly session: string
		}) {
			const tabs = yield* pipe(listTabs(input.session), Effect.option, Effect.map(Option.getOrElse(() => [])))
			const active = Array.map(input.active, item => ({key: tabKey(item.url), url: item.url}))
			const activeKeys = pipe(
				active,
				Array.reduce(HashSet.empty<string>(), (keys, item) => HashSet.add(keys, item.key))
			)
			const commands = Array.empty<string>()
			for (const inactive of input.inactive) {
				const key = tabKey(inactive.url)
				if (HashSet.has(activeKeys, key)) continue
				for (const matchingTab of Array.filter(
					tabs,
					candidate =>
						candidate.label === key || (Predicate.isNotUndefined(candidate.url) && sameUrl(candidate.url, inactive.url))
				)) {
					commands.push(`tab close ${matchingTab.tabId}`)
				}
			}
			for (const desired of active) {
				const matching = Array.filter(
					tabs,
					tab => tab.label === desired.key || (Predicate.isNotUndefined(tab.url) && sameUrl(tab.url, desired.url))
				)
				const keep = pipe(
					matching,
					Array.findFirst(tab => tab.label === desired.key),
					Option.orElse(() => Array.head(matching))
				)
				for (const tab of matching) {
					if (Option.isSome(keep) && tab.tabId === keep.value.tabId) continue
					commands.push(`tab close ${tab.tabId}`)
				}
				if (Option.isNone(keep)) commands.push(`tab new --label ${desired.key} ${desired.url}`)
			}
			if (Array.isReadonlyArrayEmpty(commands)) return
			yield* run(['--session', input.session, 'batch', ...commands])
		}, Semaphore.withPermit(tabLock))
		const openTab = Effect.fn('AgentBrowser.openTab')(function* (input: {
			readonly label: string
			readonly session: string
			readonly url: string
		}) {
			const tabs = yield* pipe(listTabs(input.session), Effect.option, Effect.map(Option.getOrElse(() => [])))
			const matchingTabs = Array.filter(tabs, tab => Predicate.isNotUndefined(tab.url) && sameUrl(tab.url, input.url))
			const existing = Array.head(matchingTabs)
			if (Option.isSome(existing)) {
				yield* run(['--session', input.session, 'tab', existing.value.tabId])
				yield* Effect.forEach(
					Array.drop(matchingTabs, 1),
					tab => pipe(run(['--session', input.session, 'tab', 'close', tab.tabId]), Effect.ignore),
					{discard: true}
				)
				return
			}
			yield* pipe(
				run(['--session', input.session, 'tab', 'new', input.url]),
				Effect.catch(() => run(['--session', input.session, 'open', input.url]))
			)
		}, Semaphore.withPermit(tabLock))

		return {
			browserEnv: Effect.fn('AgentBrowser.browserEnv')(function* (input: {readonly session: string}) {
				yield* validateSession(input.session)
				return {AGENT_BROWSER_ENABLE: 'react-devtools', AGENT_BROWSER_SESSION: input.session}
			}),
			close: Effect.fn('AgentBrowser.close')(function* (input: {readonly session: string}) {
				yield* validateSession(input.session)
				yield* run(['--session', input.session, 'close'])
			}),
			health: Effect.succeed(AgentBrowserHealth.make({available: true, bin: 'vpx'})),
			open: Effect.fn('AgentBrowser.open')(function* (input: {readonly session: string; readonly url: string}) {
				yield* validateSession(input.session)
				yield* run(['--session', input.session, 'open', input.url])
			}),
			openTab,
			session: Effect.fn('AgentBrowser.session')(function* (input: {readonly session: string}) {
				yield* validateSession(input.session)
				return yield* metadata({session: input.session, socketDir: socketDir()})
			}),
			sessions: pipe(Stream.fromEffect(discoverSessions), Stream.repeat(Schedule.spaced('1 second'))),
			switchTab: Effect.fn('AgentBrowser.switchTab')(function* (input: {
				readonly session: string
				readonly tab: string
			}) {
				yield* validateSession(input.session)
				yield* run(['--session', input.session, 'tab', input.tab])
			}),
			syncTabs,
			viewport: Effect.fn('AgentBrowser.viewport')(function* (input: {
				readonly height: number
				readonly session: string
				readonly width: number
			}) {
				yield* validateSession(input.session)
				if (!validViewportDimension(input.width) || !validViewportDimension(input.height)) {
					return yield* new AgentBrowserError({message: 'Invalid agent-browser viewport dimensions'})
				}
				yield* run(['--session', input.session, 'set', 'viewport', `${input.width}`, `${input.height}`])
			})
		}
	})
}) {
	public static layer = Layer.effect(this, this.make)

	public static middleware = Effect.fnUntraced(function* <E, R>(
		app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
	) {
		const request = yield* HttpServerRequest.HttpServerRequest
		const session = Predicate.isUndefined(request.url) ? undefined : streamSessionPath(request.url)
		if (Predicate.isUndefined(session)) return yield* app
		return yield* proxyStream(decodeURIComponent(session))
	})
}
