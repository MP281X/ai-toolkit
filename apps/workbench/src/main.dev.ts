import {readFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import nodeProcess from 'node:process'

import {NodeHttpServer, NodeRuntime, NodeServices} from '@effect/platform-node'
import * as NodeHttpServerRequest from '@effect/platform-node/NodeHttpServerRequest'

import {Config, Effect, Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter, HttpServerResponse} from 'effect/unstable/http'
import {RpcGroup, RpcServer} from 'effect/unstable/rpc'
import {createServer as createViteServer} from 'vite-plus'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'
import {BrowserProxyMiddleware} from '@deslop/browser/http'

const shutdownSignals = ['SIGINT', 'SIGTERM'] as const

function forceCloseConnections(server: ReturnType<typeof createServer>) {
	let exitTimer: NodeJS.Timeout | undefined

	function close(signal: (typeof shutdownSignals)[number]) {
		server.closeAllConnections()
		server.closeIdleConnections()
		exitTimer ??= setTimeout(() => {
			nodeProcess.exit(signal === 'SIGINT' ? 130 : 143)
		}, 1500)
		exitTimer.unref()
	}

	for (const signal of shutdownSignals) nodeProcess.on(signal, close)

	return Effect.sync(() => {
		for (const signal of shutdownSignals) nodeProcess.off(signal, close)
		if (exitTimer) clearTimeout(exitTimer)
	})
}

function ViteRoute(vite: Awaited<ReturnType<typeof createViteServer>>) {
	return HttpRouter.add('*', '/*', request => {
		if (request.headers['upgrade'] !== undefined) return Effect.never

		return Effect.callback<HttpServerResponse.HttpServerResponse, unknown>(resume => {
			const response = NodeHttpServerRequest.toServerResponse(request)
			const cleanup = Effect.sync(() => {
				response.off('finish', finish)
				response.off('error', fail)
			})
			function finish() {
				resume(Effect.succeed(HttpServerResponse.empty()).pipe(Effect.ensuring(cleanup)))
			}
			function fail(error: unknown) {
				resume(Effect.fail(error).pipe(Effect.ensuring(cleanup)))
			}

			response.once('finish', finish)
			response.once('error', fail)
			vite.middlewares(NodeHttpServerRequest.toIncomingMessage(request), response, (error: unknown) => {
				if (error === undefined) {
					finish()
				} else {
					fail(error)
				}
			})

			return cleanup
		})
	})
}

NodeRuntime.runMain(
	Layer.launch(
		Layer.unwrap(
			Effect.gen(function* () {
				const server = createServer()
				const cleanupConnections = forceCloseConnections(server)
				yield* Effect.addFinalizer(() => cleanupConnections)
				const vite = yield* Effect.acquireRelease(
					Effect.promise(() => createViteServer({appType: 'spa', server: {hmr: {server}, middlewareMode: true}})),
					vite => Effect.promise(() => vite.close())
				)

				yield* Effect.promise(async () => {
					await vite.transformIndexHtml('/', await readFile(new URL('../index.html', import.meta.url), 'utf8'))
					await vite.transformRequest('/src/main.client.tsx')
					await Promise.all(
						vite.environments.client.depsOptimizer?.metadata.depInfoList.map(dep => dep.processing) ?? []
					)
				})

				return pipe(
					HttpRouter.serve(
						Layer.mergeAll(
							RpcServer.layerHttp({
								group: RpcGroup.make().merge(RpcContracts),
								path: '/api/rpc',
								protocol: 'websocket'
							}),
							ViteRoute(vite),
							HttpRouter.middleware(BrowserProxyMiddleware, {global: true}),
							HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
						),
						{disableLogger: true}
					),
					Layer.provide(LiveLayers),
					Layer.provide(NodeHttpServer.layer(() => server, {port: yield* Config.port('PORT')})),
					Layer.provide(NodeServices.layer)
				)
			})
		)
	)
)
