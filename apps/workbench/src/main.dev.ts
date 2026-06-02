import process from 'node:process'

import * as NodeHttpServerRequest from '@effect/platform-node/NodeHttpServerRequest'

import {Effect, Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter, HttpServerResponse} from 'effect/unstable/http'
import {RpcServer} from 'effect/unstable/rpc'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'
import {BrowserProxyMiddleware} from '@deslop/browser/http'

const viteIndexKey = Symbol.for('deslop/ViteIndexByPort')
const viteIndexes: Map<number, (url: string) => Promise<string>> = ((
	process as typeof process & {[viteIndexKey]?: Map<number, (url: string) => Promise<string>>}
)[viteIndexKey] ??= new Map())

const ViteRoute = HttpRouter.add('*', '/*', request => {
	if (request.headers['upgrade'] !== undefined) return Effect.never
	const incoming = NodeHttpServerRequest.toIncomingMessage(request)
	const port = incoming.socket.localPort
	const render = port === undefined ? undefined : viteIndexes.get(port)
	if (render === undefined) return Effect.succeed(HttpServerResponse.empty({status: 404}))

	return Effect.map(
		Effect.promise(() => render(request.url)),
		HttpServerResponse.html
	)
})

export default pipe(
	Layer.mergeAll(
		RpcServer.layerHttp({group: RpcContracts, path: '/api/rpc', protocol: 'websocket'}),
		ViteRoute,
		HttpRouter.middleware(BrowserProxyMiddleware, {global: true}),
		HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
	),
	Layer.provide(LiveLayers)
)
