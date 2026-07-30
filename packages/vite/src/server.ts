import type {IncomingMessage, ServerResponse} from 'node:http'
import type {Duplex} from 'node:stream'

import type {NodeServices} from '@effect/platform-node'
import {NodeHttpServer, NodeSocket} from '@effect/platform-node'

import {Array, Cause, Context, Effect, Exit, Layer, Predicate, Record, Scope, pipe} from 'effect'

import {HttpRouter, HttpServer} from 'effect/unstable/http'
import type {Connect, EnvironmentModuleNode, Plugin} from 'vite'
import {isRunnableDevEnvironment} from 'vite'

function isBackendRequest(request: IncomingMessage) {
	const url = request.url
	return url === '/api' || url?.startsWith('/api/') === true || url?.startsWith('/api?') === true
}

export function serverEnvironment(config?: {readonly external: string[]}): Plugin {
	let active:
		| {
				readonly request: (request: IncomingMessage, response: ServerResponse) => void
				readonly scope: Scope.Scope
				readonly upgrade: (request: IncomingMessage, socket: Duplex, head: Buffer) => void
		  }
		| undefined
	let pendingReplacement = false
	let reload: (() => Promise<void>) | undefined
	let reloadQueue = Promise.resolve()

	const close = Effect.suspend(() => {
		if (active === undefined) return Effect.void
		const scope = active.scope
		active = undefined
		return Scope.close(scope, Exit.void)
	})
	function queueReload() {
		reloadQueue = reloadQueue.then(() => reload?.())
		return reloadQueue
	}

	return {
		closeBundle: async () => {
			await reloadQueue
			await Effect.runPromise(close)
		},
		config: () => ({
			environments: {server: config === undefined ? {} : {resolve: {external: config.external}}},
			server: {
				hotUpdateEnvironments: async (server, hotUpdate) => {
					await Promise.all(Record.values(server.environments).map(hotUpdate))
					if (!pendingReplacement) return
					pendingReplacement = false
					await queueReload()
				}
			}
		}),
		configureServer: server => {
			const environment = server.environments['server']
			const httpServer = server.httpServer
			if (environment === undefined || !isRunnableDevEnvironment(environment)) {
				throw new TypeError('Vite environment "server" must be runnable')
			}
			if (Predicate.isNull(httpServer)) throw new TypeError('Vite must own an HTTP server')
			const runnableEnvironment = environment
			const viteServer = httpServer

			async function reloadBackend() {
				await Effect.runPromise(
					Effect.gen(function* () {
						yield* close
						runnableEnvironment.runner.clearCache()
						const application = yield* Effect.tryPromise(() =>
							runnableEnvironment.runner.import<{
								readonly default: Layer.Layer<never, never, HttpServer.HttpServer | NodeServices.NodeServices>
							}>('src/main.server.ts')
						)
						const address = viteServer.address()
						if (Predicate.isNull(address) || typeof address === 'string') {
							return yield* Effect.die('Vite HTTP server is not listening on TCP')
						}
						const scope = yield* Scope.make()
						return yield* pipe(
							Effect.gen(function* () {
								const webSocketServer = yield* Effect.acquireRelease(
									Effect.sync(() => new NodeSocket.NodeWS.WebSocketServer({noServer: true})),
									socketServer =>
										Effect.callback<true>(resume => {
											socketServer.close(() => {
												resume(Effect.succeed(true))
											})
										})
								)
								const httpEffect = yield* HttpRouter.toHttpEffect(application.default)
								active = {
									request: yield* NodeHttpServer.makeHandler(httpEffect, {scope}),
									scope,
									upgrade: yield* NodeHttpServer.makeUpgradeHandler(Effect.succeed(webSocketServer), httpEffect, {
										scope
									})
								}
							}),
							Scope.provide(scope),
							Effect.provide(
								Layer.merge(
									NodeHttpServer.layerHttpServices,
									Layer.succeed(HttpServer.HttpServer)(
										HttpServer.make({
											address: {_tag: 'TcpAddress', hostname: '0.0.0.0', port: address.port},
											serve: () => Effect.void
										})
									)
								)
							),
							Effect.onError(() => Scope.close(scope, Exit.void))
						)
					}).pipe(
						Effect.catchCause(cause =>
							Effect.sync(() => {
								server.config.logger.error(`Backend unavailable\n${Cause.pretty(cause)}`)
							})
						)
					)
				)
			}
			reload = reloadBackend

			const runFork = Effect.runForkWith(Context.empty())
			viteServer.once('listening', () => {
				runFork(Effect.promise(queueReload))
			})
			server.middlewares.use((request: Connect.IncomingMessage, response, next) => {
				if (!isBackendRequest(request)) {
					next()
					return
				}
				if (active === undefined) {
					response.writeHead(503).end()
					return
				}
				active.request(request, response)
			})
			viteServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
				if (!isBackendRequest(request)) return
				if (active === undefined) {
					socket.destroy()
					return
				}
				active.upgrade(request, socket, head)
			})
		},
		hotUpdate: {
			handler(options) {
				if (this.environment.name === 'client') {
					const serverModules = options.server.environments['server']?.moduleGraph.getModulesByFile(options.file)
					const clientModules = this.environment.moduleGraph.getModulesByFile(options.file)
					const clientOwnsFile =
						clientModules !== undefined &&
						pipe(
							clientModules,
							Array.fromIterable,
							Array.some(module => Predicate.isNotNull(module.id) && module.file === options.file)
						)
					if (serverModules !== undefined && serverModules.size > 0 && !clientOwnsFile) return []
					return
				}
				if (this.environment.name !== 'server' || options.modules.length === 0) return
				const invalidated = new Set<EnvironmentModuleNode>()
				for (const module of options.modules) {
					this.environment.moduleGraph.invalidateModule(module, invalidated, options.timestamp, true)
				}
				pendingReplacement = true
				return []
			},
			order: 'post'
		},
		name: '@deslop/vite/server-environment'
	}
}
