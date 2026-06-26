import {readFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import path from 'node:path'

import {Array, Context, Effect, Layer, Option, Predicate, Stream, String, pipe} from 'effect'

import {HttpServerRequest, HttpServerResponse} from 'effect/unstable/http'
import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'
import {Socket} from 'effect/unstable/socket'

import {AgentBrowserError} from './schema.ts'

function socketDir() {
	return path.join(homedir(), '.agent-browser')
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
					outbound.value.runRaw(message => writeInbound(message)).pipe(Effect.catch(() => Effect.void)),
					inbound
						.runRaw(message => writeOutbound(Predicate.isString(message) ? message : message.slice()))
						.pipe(Effect.catch(() => Effect.void))
				],
				{concurrency: 'unbounded', discard: true}
			)

			return HttpServerResponse.empty()
		}),
		Effect.catch(() => Effect.succeed(HttpServerResponse.empty({status: 404})))
	)
}

const runAgentBrowser = Effect.fn('AgentBrowser.run')(function* (args: readonly string[]) {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
	return yield* Effect.scoped(
		Effect.gen(function* () {
			const handle = yield* pipe(
				spawner.spawn(
					ChildProcess.make('vpx', ['agent-browser', '--enable', 'react-devtools', ...args], {
						env: process.env,
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

export class AgentBrowser extends Context.Service<AgentBrowser>()('@deslop/agent-browser/service/AgentBrowser', {
	make: Effect.fn('AgentBrowser.make')(function* (input: {readonly sessionId: string}) {
		return {
			openTab(tab: {readonly label: string; readonly url: string}) {
				return pipe(
					runAgentBrowser(['--session', input.sessionId, 'tab', 'new', '--label', tab.label, tab.url]),
					Effect.catch(error =>
						String.includes('already used')(error.message)
							? runAgentBrowser(['--session', input.sessionId, 'tab', tab.label])
							: Effect.fail(error)
					),
					Effect.asVoid
				)
			},
			switchTab(tab: string) {
				return pipe(runAgentBrowser(['--session', input.sessionId, 'tab', tab]), Effect.asVoid)
			}
		}
	})
}) {
	public static layer = (input: {readonly sessionId: string}) => Layer.effect(this, this.make(input))

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
