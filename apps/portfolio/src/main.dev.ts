import {createServer} from 'node:http'

import {NodeHttpServer, NodeRuntime} from '@effect/platform-node'
import * as NodeHttpServerRequest from '@effect/platform-node/NodeHttpServerRequest'

import {Config, Effect, Layer} from 'effect'

import {HttpMiddleware, HttpRouter, HttpServerResponse} from 'effect/unstable/http'
import {RpcGroup, RpcServer} from 'effect/unstable/rpc'
import {createServer as createViteServer} from 'vite-plus'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'

NodeRuntime.runMain(
	Layer.launch(
		Layer.unwrap(
			Effect.gen(function* () {
				const server = createServer()
				const vite = yield* Effect.acquireRelease(
					Effect.promise(() => createViteServer({appType: 'spa', server: {hmr: {server}, middlewareMode: true}})),
					vite => Effect.promise(() => vite.close())
				)
				const routes = Layer.mergeAll(
					Layer.provide(
						Layer.mergeAll(
							RpcServer.layerHttp({
								group: RpcGroup.make().merge(RpcContracts),
								path: '/api/rpc',
								protocol: 'websocket'
							}),
							HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
						),
						LiveLayers
					),
					HttpRouter.add('*', '/*', request => {
						const nodeRequest = NodeHttpServerRequest.toIncomingMessage(request)
						const nodeResponse = NodeHttpServerRequest.toServerResponse(request)

						return Effect.map(
							Effect.callback<'handled' | 'next', unknown>(resume => {
								const cleanup = Effect.sync(() => {
									nodeResponse.off('finish', handled)
									nodeResponse.off('close', handled)
									nodeResponse.off('error', fail)
								})

								function fail(error: unknown) {
									resume(Effect.fail(error).pipe(Effect.ensuring(cleanup)))
								}

								function handled() {
									resume(Effect.succeed('handled' as const).pipe(Effect.ensuring(cleanup)))
								}

								nodeResponse.once('finish', handled)
								nodeResponse.once('close', handled)
								nodeResponse.once('error', fail)

								try {
									vite.middlewares(nodeRequest, nodeResponse, (error: unknown) => {
										if (error === undefined) resume(Effect.succeed('next' as const).pipe(Effect.ensuring(cleanup)))
										else fail(error)
									})
								} catch (error) {
									fail(error)
								}

								return cleanup
							}),
							result => (result === 'handled' ? HttpServerResponse.empty() : HttpServerResponse.empty({status: 404}))
						)
					})
				)

				return Layer.provide(
					HttpRouter.serve(routes, {disableLogger: true}),
					NodeHttpServer.layer(() => server, {port: yield* Config.port('PORT')})
				)
			})
		)
	)
)
