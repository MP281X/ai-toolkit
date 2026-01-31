import {HttpMiddleware, HttpRouter, HttpServer} from '@effect/platform'
import {BunHttpServer, BunRuntime} from '@effect/platform-bun'
import {RpcSerialization, RpcServer} from '@effect/rpc'
import {Config, Effect, Function, Layer, pipe} from 'effect'

import {AiHandlers} from '#core/ai/handlers.ts'
import {LiveLayers} from '#lib/runtime.ts'
import {Rpcs} from './rpcs.ts'

// RPC handlers layer
const Handlers = Layer.mergeAll(AiHandlers)

// RPC endpoint - handlers + auth middleware + serialization
const RpcHandler = pipe(
	RpcServer.toHttpAppWebsocket(Rpcs, {disableFatalDefects: true}),
	Effect.provide(Layer.mergeAll(Handlers, RpcSerialization.layerNdjson))
)

// HTTP routes
const Routes = Effect.gen(function* () {
	return HttpRouter.empty.pipe(
		HttpRouter.all('/rpc', yield* RpcHandler),
		HttpMiddleware.cors({
			credentials: true,
			allowedOrigins: [yield* Config.string('FRONTEND_URL')],
			allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
			allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
		}),
		HttpMiddleware.xForwardedHeaders
	)
})

// Server layer - provides LiveLayers globally
const Server = pipe(
	Routes,
	Effect.map(HttpServer.serve()),
	Layer.unwrapScoped,
	HttpServer.withLogAddress,
	HttpMiddleware.withTracerDisabledWhen(Function.constTrue),
	Layer.provide(BunHttpServer.layer({port: 8080})),
	Layer.provide(LiveLayers)
)

BunRuntime.runMain(Layer.launch(Server))
