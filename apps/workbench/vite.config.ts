import {readFile} from 'node:fs/promises'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {join} from 'node:path'
import process from 'node:process'
import type {Duplex} from 'node:stream'

import {NodeHttpServer} from '@effect/platform-node'
import {NodeWS} from '@effect/platform-node/NodeSocket'

import {Effect, Exit, Scope, pipe} from 'effect'
import type {Layer} from 'effect'

import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import {tanstackRouter} from '@tanstack/router-plugin/vite'
import react, {reactCompilerPreset} from '@vitejs/plugin-react'
import {HttpRouter} from 'effect/unstable/http'
import {defineConfig} from 'vite-plus'
import type {Plugin, ViteDevServer} from 'vite-plus'

const viteIndexKey = Symbol.for('deslop/ViteIndexByPort')
const viteIndexes: Map<number, (url: string) => Promise<string>> = ((
	process as typeof process & {[viteIndexKey]?: Map<number, (url: string) => Promise<string>>}
)[viteIndexKey] ??= new Map())

function loadApp(server: ViteDevServer, entry: string) {
	return Effect.gen(function* () {
		const scope = yield* Scope.make()
		const module = (yield* Effect.promise(() => server.ssrLoadModule(entry))) as {
			readonly default: Layer.Layer<unknown>
		}
		const httpEffect = yield* pipe(
			HttpRouter.toHttpEffect(module.default),
			Effect.provide(NodeHttpServer.layerHttpServices),
			Effect.provideService(Scope.Scope, scope)
		)
		const wss = yield* pipe(
			Effect.acquireRelease(
				Effect.sync(() => new NodeWS.WebSocketServer({noServer: true})),
				wss =>
					Effect.callback<void>(resume => {
						wss.close(() => resume(Effect.void))
					})
			),
			Scope.provide(scope),
			Effect.cached
		)
		const requestHandler = yield* NodeHttpServer.makeHandler(httpEffect, {scope})
		const upgradeHandler = yield* NodeHttpServer.makeUpgradeHandler(wss, httpEffect, {scope})

		return {close: () => Effect.runFork(Effect.ignore(Scope.close(scope, Exit.void))), requestHandler, upgradeHandler}
	})
}

function effectVitePlugin(entry: string): Plugin {
	return {
		configureServer(server) {
			const httpServer = server.httpServer
			if (httpServer === null) return

			return () => {
				const indexPath = join(server.config.root, 'index.html')
				const middlewares = server.middlewares
				async function renderIndex(url: string) {
					const html = await readFile(indexPath, 'utf8')

					return server.transformIndexHtml(url, html)
				}
				const ports = new Set<number>()
				let active: Effect.Success<ReturnType<typeof loadApp>> | undefined
				let pending = Promise.resolve()

				function scheduleReload() {
					pending = pending
						.then(async () => {
							const next = await Effect.runPromise(loadApp(server, entry))
							active?.close()
							active = next
						})
						.catch(cause => server.config.logger.error(cause))
				}

				function requestHandler(request: IncomingMessage, response: ServerResponse, next: () => void) {
					if (active === undefined) return next()
					const port = request.socket.localPort
					if (port !== undefined) {
						ports.add(port)
						viteIndexes.set(port, renderIndex)
					}
					active.requestHandler(request, response)
				}
				function onChange(_event: string, file: string) {
					if ((server.environments.ssr.moduleGraph.getModulesByFile(file)?.size ?? 0) > 0) scheduleReload()
				}

				scheduleReload()
				middlewares.use(requestHandler)
				server.watcher.on('all', onChange)

				const viteUpgradeHandlers = httpServer.listeners('upgrade')
				function upgradeDispatcher(request: IncomingMessage, socket: Duplex, head: Buffer) {
					if (request.headers['sec-websocket-protocol']?.includes('vite-hmr') === true) {
						for (const handler of viteUpgradeHandlers) {
							handler.call(httpServer, request, socket, head)
						}
						return
					}

					if (active === undefined) return socket.destroy()
					active.upgradeHandler(request, socket, head)
				}

				httpServer.removeAllListeners('upgrade')
				httpServer.on('upgrade', upgradeDispatcher)

				return () => {
					server.watcher.off('all', onChange)
					httpServer.off('upgrade', upgradeDispatcher)
					middlewares.stack = middlewares.stack.filter(layer => layer.handle !== requestHandler)
					for (const handler of viteUpgradeHandlers) {
						httpServer.on('upgrade', handler)
					}
					for (const port of ports) {
						viteIndexes.delete(port)
					}
					active?.close()
				}
			}
		},
		name: 'deslop-effect-vite'
	}
}

export default defineConfig({
	build: {
		chunkSizeWarningLimit: 2000,
		modulePreload: {polyfill: false},
		outDir: 'dist/client',
		rolldownOptions: {experimental: {lazyBarrel: true}}
	},
	pack: {
		clean: false,
		entry: ['src/main.server.ts'],
		format: 'esm',
		inputOptions: {external: ['@lydell/node-pty']},
		outDir: 'dist',
		outputOptions: {banner: '#!/usr/bin/env node', entryFileNames: 'server.js'},
		platform: 'node',
		target: 'node24'
	},
	plugins: [
		effectVitePlugin('/src/main.dev.ts'),
		tanstackRouter({autoCodeSplitting: true, target: 'react'}),
		react(),
		babel({parserOpts: {plugins: ['jsx', 'typescript']}, presets: [reactCompilerPreset()]}),
		tailwindcss({optimize: true})
	],
	server: {forwardConsole: true},
	ssr: {external: ['@xterm/headless']}
})
