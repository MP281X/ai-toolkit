import {homedir} from 'node:os'

import {
	Array,
	Config,
	Context,
	Duration,
	Effect,
	FileSystem,
	HashMap,
	Layer,
	Number,
	Option,
	Path,
	Predicate,
	Ref,
	Schema,
	Stream,
	String,
	pipe
} from 'effect'

import {HttpServerRequest, HttpServerResponse} from 'effect/unstable/http'
import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'
import {Socket} from 'effect/unstable/socket'

import {AgentBrowserError, agentBrowserOwnedTabLabels} from './schema.ts'

function agentBrowserEnableEnv(enable?: string) {
	if (Predicate.isUndefined(enable) || String.isEmpty(enable)) return 'react-devtools'
	if (String.includes('react-devtools')(enable)) return enable
	return `${enable},react-devtools`
}

const streamPort = Effect.fn('AgentBrowser.streamPort')(function* (session: string) {
	const fs = yield* FileSystem.FileSystem
	const path = yield* Path.Path
	const source = yield* pipe(
		fs.readFileString(path.join(homedir(), '.agent-browser', `${session}.stream`)),
		Effect.mapError(cause => AgentBrowserError.make({cause, message: `Unknown agent-browser session: ${session}`}))
	)
	const port = pipe(String.trim(source), Number.parse)
	if (Option.isNone(port) || !Schema.is(Schema.Int)(port.value) || port.value <= 0 || port.value > 65_535) {
		return yield* AgentBrowserError.make({message: `Invalid stream metadata for ${session}`})
	}
	return port.value
})

function workbenchOrigin(request: HttpServerRequest.HttpServerRequest, session: string) {
	try {
		const host = request.headers['host'] ?? ''
		const hostname = pipe(
			host,
			String.split(':'),
			Array.head,
			Option.getOrElse(() => '')
		)
		if (new URL(request.headers['origin'] ?? '').host !== host) return false
		return (
			!String.endsWith('.localhost')(hostname) ||
			hostname === `${session}.localhost` ||
			String.endsWith(`.workbench.${session}.localhost`)(hostname)
		)
	} catch {
		return false
	}
}

function proxyStream(session: string) {
	return pipe(
		Effect.gen(function* () {
			const request = yield* HttpServerRequest.HttpServerRequest
			if (!workbenchOrigin(request, session)) return HttpServerResponse.empty({status: 403})

			const port = yield* pipe(streamPort(session), Effect.option)
			if (Option.isNone(port)) return HttpServerResponse.empty({status: 404})

			const outbound = yield* pipe(
				Socket.makeWebSocket(`ws://127.0.0.1:${port.value}`),
				Effect.provideService(Socket.WebSocketConstructor, (url, protocols) => new WebSocket(url, protocols)),
				Effect.option
			)
			if (Option.isNone(outbound)) return HttpServerResponse.empty({status: 502})

			const inbound = yield* request.upgrade
			const writeInbound = yield* inbound.writer
			const writeOutbound = yield* outbound.value.writer

			yield* pipe(
				Effect.raceFirst(
					pipe(
						outbound.value.runRaw(message => writeInbound(message)),
						Effect.catch(error =>
							writeInbound(
								error.reason._tag === 'SocketCloseError'
									? new Socket.CloseEvent(error.reason.code, error.reason.closeReason)
									: new Socket.CloseEvent(1011, 'agent browser stream failed')
							)
						)
					),
					pipe(
						inbound.runRaw(message => writeOutbound(Predicate.isString(message) ? message : Uint8Array.from(message))),
						Effect.catch(error =>
							writeOutbound(
								error.reason._tag === 'SocketCloseError'
									? new Socket.CloseEvent(error.reason.code, error.reason.closeReason)
									: new Socket.CloseEvent(1011, 'workbench stream failed')
							)
						)
					)
				),
				Effect.ignore
			)

			return HttpServerResponse.empty()
		}),
		Effect.orElseSucceed(() => HttpServerResponse.empty({status: 404}))
	)
}

const runAgentBrowser = Effect.fn('AgentBrowser.run')(function* (args: string[]) {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
	const enable = yield* pipe(
		Config.option(Config.string('AGENT_BROWSER_ENABLE')),
		Effect.mapError(cause => AgentBrowserError.make({cause, message: 'failed to read agent-browser configuration'}))
	)
	return yield* Effect.scoped(
		Effect.gen(function* () {
			const handle = yield* pipe(
				spawner.spawn(
					ChildProcess.make('vpx', ['agent-browser', ...args], {
						env: {AGENT_BROWSER_ENABLE: agentBrowserEnableEnv(Option.getOrUndefined(enable))},
						extendEnv: true,
						stderr: 'pipe',
						stdout: 'pipe'
					})
				),
				Effect.mapError(cause => AgentBrowserError.make({cause, message: 'failed to spawn agent-browser'}))
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
				Effect.mapError(cause => AgentBrowserError.make({cause, message: 'agent-browser command failed'}))
			)
			if (exitCode === ChildProcessSpawner.ExitCode(0)) return output.stdout

			const stderr = String.trim(output.stderr)
			const stdout = String.trim(output.stdout)
			return yield* AgentBrowserError.make({
				cause: stderr || stdout || `vpx agent-browser ${Array.join(' ')(args)} exited with ${exitCode}`,
				message: stderr || stdout || 'agent-browser command failed'
			})
		})
	)
})

function runAgentBrowserWith(spawner: ChildProcessSpawner.ChildProcessSpawner['Service'], args: string[]) {
	return pipe(runAgentBrowser(args), Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner))
}

type AgentBrowserCliTab = typeof AgentBrowserCliTab.Type
const AgentBrowserCliTab = Schema.Struct({
	label: Schema.OptionFromNullOr(Schema.String),
	tabId: Schema.String,
	url: Schema.String
})

type AgentBrowserCliTabsFromJson = typeof AgentBrowserCliTabsFromJson.Type
const AgentBrowserCliTabsFromJson = Schema.fromJsonString(
	Schema.Struct({data: Schema.Struct({tabs: Schema.Array(AgentBrowserCliTab)})})
)

const listTabs = Effect.fn('AgentBrowser.listTabs')(function* (input: {
	sessionId: string
	spawner: ChildProcessSpawner.ChildProcessSpawner['Service']
}) {
	return pipe(
		yield* runAgentBrowserWith(input.spawner, ['--session', input.sessionId, '--json', 'tab']),
		Schema.decodeUnknownOption(AgentBrowserCliTabsFromJson),
		Option.map(decoded => decoded.data.tabs),
		Option.getOrElse(() => Array.empty<AgentBrowserCliTab>())
	)
})

const reachable = Effect.fn('AgentBrowser.reachable')(function* (url: string) {
	return yield* pipe(
		Effect.tryPromise({
			catch: cause => AgentBrowserError.make({cause, message: `unreachable browser tab origin: ${url}`}),
			// Native fetch consumes Effect's abort signal at the browser reachability boundary.
			// @effect-diagnostics-next-line globalFetchInEffect:off
			try: signal => fetch(url, {redirect: 'manual', signal})
		}),
		Effect.timeout(Duration.millis(750)),
		Effect.mapError(cause => AgentBrowserError.make({cause, message: `unreachable browser tab origin: ${url}`})),
		Effect.asVoid
	)
})

function waitForReachable(url: string, attempts = 40): Effect.Effect<boolean> {
	return pipe(
		reachable(url),
		Effect.as(true),
		Effect.catch(() =>
			attempts <= 1
				? Effect.succeed(false)
				: pipe(Effect.sleep(Duration.millis(750)), Effect.andThen(waitForReachable(url, attempts - 1)))
		)
	)
}

const openOwnedTab = Effect.fn('AgentBrowser.openOwnedTab')(function* (input: {
	label: string
	origin: string
	sessionId: string
	spawner: ChildProcessSpawner.ChildProcessSpawner['Service']
}) {
	const existingTabs = yield* listTabs(input)
	const existingTab = pipe(
		existingTabs,
		Array.findFirst(tab => Option.contains(input.label)(tab.label))
	)
	if (Option.isSome(existingTab)) return

	yield* waitForReachable(input.origin)
	yield* pipe(
		runAgentBrowserWith(input.spawner, [
			'--session',
			input.sessionId,
			'tab',
			'new',
			input.origin,
			'--label',
			input.label
		]),
		Effect.catch(error => (String.includes('already used')(error.message) ? Effect.void : Effect.fail(error)))
	)
	yield* runAgentBrowserWith(input.spawner, ['--session', input.sessionId, 'set', 'viewport', '1600', '900'])
})

export class AgentBrowser extends Context.Service<AgentBrowser>()('@deslop/agent-browser/service/AgentBrowser', {
	make: Effect.fn('AgentBrowser.make')(function* (input: {closeOnFinalize?: boolean; sessionId: string}) {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const labelsByOrigin = yield* Ref.make(HashMap.empty<string, string>())
		if (input.closeOnFinalize === true) {
			yield* Effect.addFinalizer(() =>
				pipe(runAgentBrowserWith(spawner, ['--session', input.sessionId, 'close']), Effect.ignore)
			)
		}
		return {
			openTabs(origins: string[]) {
				return pipe(
					Ref.set(labelsByOrigin, agentBrowserOwnedTabLabels(origins)),
					Effect.andThen(
						pipe(
							runAgentBrowserWith(spawner, ['--session', input.sessionId, 'stream', 'enable']),
							Effect.catch(error =>
								String.includes('already enabled')(error.message) ? Effect.void : Effect.fail(error)
							)
						)
					),
					Effect.andThen(
						Effect.forEach(
							origins,
							origin =>
								pipe(
									Ref.get(labelsByOrigin),
									Effect.flatMap(labels =>
										pipe(
											HashMap.get(labels, origin),
											Option.match({
												onNone: () => Effect.void,
												onSome: label => openOwnedTab({label, origin, sessionId: input.sessionId, spawner})
											})
										)
									)
								),
							{concurrency: 1, discard: true}
						)
					),
					Effect.asVoid
				)
			},
			switchTab(origin: string) {
				return pipe(
					Ref.get(labelsByOrigin),
					Effect.flatMap(labels =>
						pipe(
							HashMap.get(labels, origin),
							Option.match({
								onNone: () =>
									Effect.fail(AgentBrowserError.make({message: `Unknown agent-browser tab origin: ${origin}`})),
								onSome: label => runAgentBrowserWith(spawner, ['--session', input.sessionId, 'tab', label])
							})
						)
					),
					Effect.asVoid
				)
			}
		}
	})
}) {
	public static layer = (input: {closeOnFinalize?: boolean; sessionId: string}) => Layer.effect(this, this.make(input))

	public static middleware = Effect.fnUntraced(function* <E, R>(
		app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
	) {
		const request = yield* HttpServerRequest.HttpServerRequest
		const match = Predicate.isUndefined(request.url)
			? undefined
			: /^\/api\/agent-browser\/sessions\/([^/]+)\/stream$/u.exec(new URL(request.url, 'http://localhost').pathname)
		if (Predicate.isNull(match) || Predicate.isUndefined(match)) return yield* app
		return yield* proxyStream(decodeURIComponent(match[1] ?? ''))
	})
}
