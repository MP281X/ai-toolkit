import {
	Context,
	Effect,
	Fiber,
	HashMap,
	Layer,
	Option,
	Predicate,
	Ref,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import {
	Headers,
	HttpClient,
	HttpClientRequest,
	HttpRouter,
	HttpServerRequest,
	HttpServerResponse
} from 'effect/unstable/http'
import {Socket} from 'effect/unstable/socket'

import {PreviewError, PreviewExposure} from './schema.ts'

import type {ManagedProcess} from '@deslop/process/service'

function targetFromLogs(logs: readonly string[]): Option.Option<string> {
	for (const line of logs) {
		const match = /https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/u.exec(line)
		const port = match?.[1]
		if (Predicate.isNotUndefined(port)) return Option.some(`http://127.0.0.1:${port}`)
	}
	return Option.none()
}

function rewritePreviewBody(body: string, prefix: string) {
	return body.replace(/(["'`(=])\/(?!\/|preview\/)/gu, `$1${prefix}/`).replace(/url\(\//gu, `url(${prefix}/`)
}

export class Preview extends Context.Service<Preview>()('@deslop/workbench/services/preview/service/Preview', {
	make: Effect.fnUntraced(function* () {
		const client = yield* HttpClient.HttpClient
		const applicationScope = yield* Effect.scope
		const exposures = yield* Ref.make(HashMap.empty<string, string>())
		const watchers = yield* Ref.make(HashMap.empty<string, Fiber.Fiber<void>>())

		function target(id: string) {
			return pipe(
				Ref.get(exposures),
				Effect.flatMap(current =>
					Option.match(HashMap.get(current, id), {
						onNone: () => PreviewError.make({message: `preview ${id} is not exposed`}),
						onSome: Effect.succeed
					})
				)
			)
		}

		return {
			expose: Effect.fn('Preview.expose')(function* (input: {
				readonly id: string
				readonly process: ManagedProcess['Service']
			}) {
				if ((yield* SubscriptionRef.get(input.process.status)) !== 'running') {
					return yield* PreviewError.make({message: 'process is not running'})
				}
				const origin = targetFromLogs(yield* SubscriptionRef.get(input.process.logs))
				if (Option.isNone(origin)) {
					return yield* PreviewError.make({message: 'Vite has not reported its preview origin'})
				}
				const previous = HashMap.get(yield* Ref.get(watchers), input.id)
				if (Option.isSome(previous)) yield* Fiber.interrupt(previous.value)
				yield* Ref.update(exposures, current => HashMap.set(current, input.id, origin.value))
				const watcher = yield* pipe(
					SubscriptionRef.changes(input.process.status),
					Stream.filter(status => status === 'stopped'),
					Stream.runHead,
					Effect.andThen(Ref.update(exposures, current => HashMap.remove(current, input.id))),
					Effect.andThen(Ref.update(watchers, current => HashMap.remove(current, input.id))),
					Effect.forkIn(applicationScope)
				)
				yield* Ref.update(watchers, current => HashMap.set(current, input.id, watcher))
				return PreviewExposure.make({id: input.id, url: `/preview/${input.id}/`})
			}),
			http: Effect.fnUntraced(function* () {
				const router = yield* HttpRouter.HttpRouter
				yield* router.add(
					'*',
					'/preview/:id/*',
					Effect.gen(function* () {
						const request = yield* HttpServerRequest.HttpServerRequest
						const params = yield* HttpRouter.params
						const id = params['id']
						if (Predicate.isUndefined(id)) return HttpServerResponse.empty({status: 404})
						const origin = yield* target(id)
						const prefix = `/preview/${id}`
						const suffix = String.startsWith(prefix)(request.url)
							? String.slice(String.length(prefix))(request.url)
							: '/'
						const url = `${origin}${suffix === '' ? '/' : suffix}`
						if (request.headers['upgrade']?.toLowerCase() === 'websocket') {
							const incoming = yield* request.upgrade
							const outgoing = yield* Socket.makeWebSocket(Effect.succeed(String.replace(/^http/u, 'ws')(url)))
							const incomingWriter = yield* incoming.writer
							const outgoingWriter = yield* outgoing.writer
							yield* Effect.raceFirst(
								incoming.run(data => outgoingWriter(data)),
								outgoing.run(data => incomingWriter(data))
							)
							return HttpServerResponse.empty()
						}
						const outgoing = pipe(
							HttpClientRequest.make(request.method)(url),
							HttpClientRequest.setHeaders(request.headers),
							request.method === 'GET' || request.method === 'HEAD'
								? current => current
								: HttpClientRequest.bodyStream(request.stream)
						)
						const response = yield* client.execute(outgoing)
						const contentType = response.headers['content-type'] ?? ''
						if (
							contentType.includes('text/html') ||
							contentType.includes('javascript') ||
							contentType.includes('text/css')
						) {
							const headers = pipe(response.headers, Headers.removeMany(['content-encoding', 'content-length', 'etag']))
							return HttpServerResponse.text(rewritePreviewBody(yield* response.text, prefix), {
								headers,
								status: response.status
							})
						}
						const location = response.headers['location']
						if (Predicate.isNotUndefined(location) && String.startsWith('/')(location)) {
							return HttpServerResponse.stream(response.stream, {
								headers: pipe(response.headers, Headers.set('location', `${prefix}${location}`)),
								status: response.status
							})
						}
						return HttpServerResponse.stream(response.stream, {headers: response.headers, status: response.status})
					}).pipe(
						Effect.catch(error =>
							Effect.succeed(
								HttpServerResponse.text(error.message, {status: error._tag === 'PreviewError' ? 404 : 502})
							)
						)
					)
				)
				return router
			}),
			revoke: Effect.fn('Preview.revoke')(function* (id: string) {
				const watcher = HashMap.get(yield* Ref.get(watchers), id)
				if (Option.isSome(watcher)) yield* Fiber.interrupt(watcher.value)
				yield* Ref.update(watchers, current => HashMap.remove(current, id))
				yield* Ref.update(exposures, current => HashMap.remove(current, id))
			})
		}
	})
}) {
	public static layer = Layer.effect(this, this.make())
}
