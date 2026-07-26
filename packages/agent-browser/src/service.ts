import {readFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import path from 'node:path'

import {
	Array,
	Config,
	Context,
	Duration,
	Effect,
	HashMap,
	Layer,
	Match,
	Option,
	Predicate,
	Ref,
	Schema,
	Stream,
	String,
	pipe
} from 'effect'

import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
	HttpServerRequest,
	HttpServerResponse
} from 'effect/unstable/http'
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
const streamPort = Effect.fn('AgentBrowser.streamPort')(function* (session: string) {
	const source = yield* pipe(
		Effect.tryPromise(() => readFile(path.join(socketDir(), `${session}.stream`), 'utf8')),
		Effect.mapError(cause => AgentBrowserError.make({cause, message: `Unknown agent-browser session: ${session}`}))
	)
	const port = Number.parseInt(String.trim(source), 10)
	if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
		return yield* AgentBrowserError.make({message: `Invalid stream metadata for ${session}`})
	}
	return port
})
function workbenchOrigin(input: {readonly request: HttpServerRequest.HttpServerRequest; readonly session: string}) {
	try {
		const hostname = pipe(
			input.request.headers['host'] ?? '',
			String.split(':'),
			Array.head,
			Option.getOrElse(() => '')
		)
		if (new URL(input.request.headers['origin'] ?? '').host !== (input.request.headers['host'] ?? '')) return false
		return (
			!String.endsWith('.localhost')(hostname) ||
			hostname === `${input.session}.localhost` ||
			String.endsWith(`.workbench.${input.session}.localhost`)(hostname)
		)
	} catch {
		return false
	}
}
function proxyStream(session: string) {
	return pipe(
		Effect.gen(function* () {
			const request = yield* HttpServerRequest.HttpServerRequest
			if (!workbenchOrigin({request, session})) return HttpServerResponse.empty({status: 403})
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
					pipe(
						outbound.value.runRaw(message => writeInbound(message)),
						Effect.ignore
					),
					pipe(
						inbound.runRaw(message => writeOutbound(Predicate.isString(message) ? message : message.slice())),
						Effect.ignore
					)
				],
				{concurrency: 'unbounded', discard: true}
			)
			return HttpServerResponse.empty()
		}),
		Effect.orElseSucceed(() => HttpServerResponse.empty({status: 404}))
	)
}
const runAgentBrowser = Effect.fn('AgentBrowser.run')(function* (input: {
	readonly args: readonly string[]
	readonly enable: string
	readonly spawner: ChildProcessSpawner.ChildProcessSpawner['Service']
}) {
	return yield* Effect.scoped(
		Effect.gen(function* () {
			const handle = yield* pipe(
				input.spawner.spawn(
					ChildProcess.make('vpx', ['agent-browser', ...input.args], {
						env: {AGENT_BROWSER_ENABLE: input.enable},
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
				cause: new Error(
					stderr || stdout || `vpx agent-browser ${Array.join(' ')(input.args)} exited with ${exitCode}`
				),
				message: stderr || stdout || 'agent-browser command failed'
			})
		})
	)
})
type AgentBrowserCliTabs = typeof AgentBrowserCliTabs.Type
const AgentBrowserCliTabs = Schema.Struct({
	data: Schema.Struct({
		tabs: Schema.Array(Schema.Struct({label: Schema.NullOr(Schema.String), tabId: Schema.String, url: Schema.String}))
	})
})
function decodeAgentBrowserTabs(
	output: string
): readonly {readonly label?: string; readonly tabId: string; readonly url: string}[] {
	try {
		const decoded = JSON.parse(output) as unknown
		return pipe(
			Schema.decodeUnknownSync(AgentBrowserCliTabs)(decoded).data.tabs,
			Array.map(tab =>
				Predicate.isNull(tab.label)
					? {tabId: tab.tabId, url: tab.url}
					: {label: tab.label, tabId: tab.tabId, url: tab.url}
			)
		)
	} catch {
		return Array.empty<{readonly label?: string; readonly tabId: string; readonly url: string}>()
	}
}
type AgentBrowserRuntime = {
	readonly client: HttpClient.HttpClient
	readonly enable: string
	readonly spawner: ChildProcessSpawner.ChildProcessSpawner['Service']
}
const listTabs = Effect.fn('AgentBrowser.listTabs')(function* (
	input: AgentBrowserRuntime & {readonly sessionId: string}
) {
	return decodeAgentBrowserTabs(
		yield* runAgentBrowser({
			args: ['--session', input.sessionId, '--json', 'tab'],
			enable: input.enable,
			spawner: input.spawner
		})
	)
})
const reachable = Effect.fn('AgentBrowser.reachable')(function* (input: {
	readonly client: HttpClient.HttpClient
	readonly url: string
}) {
	return yield* pipe(
		input.client.execute(HttpClientRequest.fromWeb(new Request(input.url, {redirect: 'manual'}))),
		Effect.timeoutOrElse({
			duration: Duration.millis(750),
			orElse: () => Effect.fail(AgentBrowserError.make({message: `unreachable browser tab origin: ${input.url}`}))
		}),
		Effect.mapError(cause => AgentBrowserError.make({cause, message: `unreachable browser tab origin: ${input.url}`})),
		Effect.asVoid
	)
})
function waitForReachable(
	input: AgentBrowserRuntime & {readonly url: string; readonly attempts?: number}
): Effect.Effect<boolean> {
	return pipe(
		reachable({client: input.client, url: input.url}),
		Effect.as(true),
		Effect.catch(() =>
			(input.attempts ?? 40) <= 1
				? Effect.succeed(false)
				: pipe(
						Effect.sleep(Duration.millis(750)),
						Effect.andThen(waitForReachable({...input, attempts: (input.attempts ?? 40) - 1}))
					)
		)
	)
}
const openOwnedTab = Effect.fn('AgentBrowser.openOwnedTab')(function* (
	input: AgentBrowserRuntime & {readonly label: string; readonly origin: string; readonly sessionId: string}
) {
	const existingTabs = yield* listTabs(input)
	const existingTab = pipe(
		existingTabs,
		Array.findFirst(tab => tab.label === input.label)
	)
	if (Option.isSome(existingTab)) return
	yield* waitForReachable({...input, url: input.origin})
	yield* pipe(
		runAgentBrowser({
			args: ['--session', input.sessionId, 'tab', 'new', input.origin, '--label', input.label],
			enable: input.enable,
			spawner: input.spawner
		}),
		Effect.catch(error => (String.includes('already used')(error.message) ? Effect.void : Effect.fail(error)))
	)
	yield* runAgentBrowser({
		args: ['--session', input.sessionId, 'set', 'viewport', '1600', '900'],
		enable: input.enable,
		spawner: input.spawner
	})
})
export class AgentBrowser extends Context.Service<AgentBrowser>()('@deslop/agent-browser/service/AgentBrowser', {
	make: Effect.fn('AgentBrowser.make')(function* (input: {
		readonly closeOnFinalize?: boolean
		readonly sessionId: string
	}) {
		const client = yield* HttpClient.HttpClient
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const enable = yield* pipe(
			Config.string('AGENT_BROWSER_ENABLE'),
			Effect.option,
			Effect.map(Option.getOrUndefined),
			Effect.map(agentBrowserEnableEnv)
		)
		const runtime = {client, enable, spawner}
		const labelsByOrigin = yield* Ref.make(HashMap.empty<string, string>())
		if (input.closeOnFinalize === true) {
			yield* Effect.addFinalizer(() =>
				pipe(runAgentBrowser({args: ['--session', input.sessionId, 'close'], enable, spawner}), Effect.ignore)
			)
		}
		return {
			openTabs(origins: readonly string[]) {
				return pipe(
					Ref.set(labelsByOrigin, agentBrowserOwnedTabLabels(origins)),
					Effect.andThen(
						pipe(
							runAgentBrowser({args: ['--session', input.sessionId, 'stream', 'enable'], enable, spawner}),
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
												onSome: label => openOwnedTab({...runtime, label, origin, sessionId: input.sessionId})
											})
										)
									)
								),
							{concurrency: 1, discard: true}
						)
					),
					Effect.asVoid,
					Effect.withSpan('AgentBrowser.openTabs')
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
								onSome: label => runAgentBrowser({args: ['--session', input.sessionId, 'tab', label], enable, spawner})
							})
						)
					),
					Effect.asVoid,
					Effect.withSpan('AgentBrowser.switchTab')
				)
			}
		}
	})
}) {
	public static layer = (input: {readonly closeOnFinalize?: boolean; readonly sessionId: string}) =>
		pipe(Layer.effect(this, this.make(input)), Layer.provide(FetchHttpClient.layer))
	public static middleware = Effect.fnUntraced(function* <E, R>(
		app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
	) {
		const request = yield* HttpServerRequest.HttpServerRequest
		const match = pipe(
			Match.value(request.url),
			Match.when(Predicate.isUndefined, () => undefined),
			Match.orElse(url =>
				/^\/api\/agent-browser\/sessions\/([^/]+)\/stream$/u.exec(new URL(url, 'http://localhost').pathname)
			)
		)
		if (Predicate.isNull(match) || Predicate.isUndefined(match)) return yield* app
		return yield* proxyStream(decodeURIComponent(match[1] ?? ''))
	})
}
