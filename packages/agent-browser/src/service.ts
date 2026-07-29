import {readFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import path from 'node:path'

import {
	Array,
	Context,
	Duration,
	Effect,
	HashMap,
	Layer,
	Option,
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

function socketDir() {
	return path.join(homedir(), '.agent-browser')
}

function agentBrowserEnableEnv(enable: string | undefined) {
	if (Predicate.isUndefined(enable) || String.isEmpty(enable)) return 'react-devtools'
	if (String.includes('react-devtools')(enable)) return enable
	return `${enable},react-devtools`
}

function agentBrowserEnv() {
	return {...process.env, AGENT_BROWSER_ENABLE: agentBrowserEnableEnv(process.env['AGENT_BROWSER_ENABLE'])}
}

const streamPort = Effect.fn('AgentBrowser.streamPort')(function* (session: string) {
	const source = yield* pipe(
		Effect.tryPromise(() => readFile(path.join(socketDir(), `${session}.stream`), 'utf8')),
		Effect.mapError(cause => new AgentBrowserError({cause, message: `Unknown agent-browser session: ${session}`}))
	)
	const port = Number.parseInt(String.trim(source), 10)
	if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
		return yield* new AgentBrowserError({message: `Invalid stream metadata for ${session}`})
	}
	return port
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
				Effect.provide(Socket.layerWebSocketConstructorGlobal),
				Effect.option
			)
			if (Option.isNone(outbound)) return HttpServerResponse.empty({status: 502})

			const inbound = yield* request.upgrade
			const writeInbound = yield* inbound.writer
			const writeOutbound = yield* outbound.value.writer

			yield* Effect.all(
				[
					outbound.value.runRaw(message => writeInbound(message)).pipe(Effect.ignore),
					inbound
						.runRaw(message => writeOutbound(Predicate.isString(message) ? message : message.slice()))
						.pipe(Effect.ignore)
				],
				{concurrency: 'unbounded', discard: true}
			)

			return HttpServerResponse.empty()
		}),
		Effect.orElseSucceed(() => HttpServerResponse.empty({status: 404}))
	)
}

const runAgentBrowser = Effect.fn('AgentBrowser.run')(function* (args: readonly string[]) {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
	return yield* Effect.scoped(
		Effect.gen(function* () {
			const handle = yield* pipe(
				spawner.spawn(
					ChildProcess.make('vpx', ['agent-browser', ...args], {env: agentBrowserEnv(), stderr: 'pipe', stdout: 'pipe'})
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
			if (exitCode === ChildProcessSpawner.ExitCode(0)) return output.stdout

			const stderr = String.trim(output.stderr)
			const stdout = String.trim(output.stdout)
			return yield* new AgentBrowserError({
				cause: new Error(stderr || stdout || `vpx agent-browser ${Array.join(' ')(args)} exited with ${exitCode}`),
				message: stderr || stdout || 'agent-browser command failed'
			})
		})
	)
})

function runAgentBrowserWith(spawner: ChildProcessSpawner.ChildProcessSpawner['Service'], args: readonly string[]) {
	return pipe(runAgentBrowser(args), Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner))
}

const AgentBrowserCliTabs = Schema.Struct({
	data: Schema.Struct({
		tabs: Schema.Array(Schema.Struct({label: Schema.NullOr(Schema.String), tabId: Schema.String, url: Schema.String}))
	})
})

function decodeAgentBrowserTabs(output: string) {
	try {
		const decoded = JSON.parse(output) as unknown
		return pipe(
			Schema.decodeUnknownSync(AgentBrowserCliTabs)(decoded).data.tabs,
			Array.map(tab => ({label: Predicate.isNull(tab.label) ? undefined : tab.label, tabId: tab.tabId, url: tab.url}))
		)
	} catch {
		return Array.empty<{readonly label?: string; readonly tabId: string; readonly url: string}>()
	}
}

const listTabs = Effect.fn('AgentBrowser.listTabs')(function* (input: {
	readonly sessionId: string
	readonly spawner: ChildProcessSpawner.ChildProcessSpawner['Service']
}) {
	return decodeAgentBrowserTabs(
		yield* runAgentBrowserWith(input.spawner, ['--session', input.sessionId, '--json', 'tab'])
	)
})

const reachable = Effect.fn('AgentBrowser.reachable')(function* (url: string) {
	const controller = new AbortController()
	const timeout = setTimeout(() => {
		controller.abort()
	}, 750)
	return yield* pipe(
		Effect.tryPromise({
			catch: cause => new AgentBrowserError({cause, message: `unreachable browser tab origin: ${url}`}),
			try: () => fetch(url, {redirect: 'manual', signal: controller.signal})
		}),
		Effect.ensuring(
			Effect.sync(() => {
				clearTimeout(timeout)
			})
		),
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
	readonly label: string
	readonly origin: string
	readonly sessionId: string
	readonly spawner: ChildProcessSpawner.ChildProcessSpawner['Service']
}) {
	const existingTabs = yield* listTabs(input)
	const existingTab = pipe(
		existingTabs,
		Array.findFirst(tab => tab.label === input.label)
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
	make: Effect.fn('AgentBrowser.make')(function* (input: {
		readonly closeOnFinalize?: boolean
		readonly sessionId: string
	}) {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const labelsByOrigin = yield* Ref.make(HashMap.empty<string, string>())
		if (input.closeOnFinalize === true) {
			yield* Effect.addFinalizer(() =>
				runAgentBrowserWith(spawner, ['--session', input.sessionId, 'close']).pipe(Effect.ignore)
			)
		}
		return {
			openTabs(origins: readonly string[]) {
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
									Effect.fail(new AgentBrowserError({message: `Unknown agent-browser tab origin: ${origin}`})),
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
	public static layer = (input: {readonly closeOnFinalize?: boolean; readonly sessionId: string}) =>
		Layer.effect(this, this.make(input))

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
