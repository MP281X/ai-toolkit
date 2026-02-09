import {HttpMiddleware, HttpRouter, HttpServer} from '@effect/platform'
import {BunHttpServer, BunRuntime} from '@effect/platform-bun'
import {RpcGroup, RpcServer} from '@effect/rpc'
import {Effect, Function, Layer, pipe} from 'effect'

import {OAuth} from '@ai-toolkit/oauth/server'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {ReviewRpcs} from '#rpcs/review/contracts.ts'

// RPCs
const RpcHandler = RpcServer.toHttpAppWebsocket(RpcGroup.make().merge(ReviewRpcs), {
	disableFatalDefects: true
})

// HTTP routes
const Routes = RpcHandler.pipe(
	Effect.map(handler =>
		HttpRouter.empty.pipe(
			HttpRouter.all('/api/rpc', handler),
			HttpRouter.all('/api/auth/*', OAuth.handler),
			HttpMiddleware.cors({
				credentials: true,
				allowedOrigins: ['*'],
				allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
				allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
			}),
			HttpMiddleware.xForwardedHeaders
		)
	),
	Effect.orDie
)

BunRuntime.runMain(
	Layer.launch(
		pipe(
			Routes,
			Effect.flatMap(HttpServer.serve()),
			Layer.unwrapScoped,
			HttpServer.withLogAddress,
			HttpMiddleware.withTracerDisabledWhen(Function.constTrue),
			Layer.provide(BunHttpServer.layer({port: 8080})),
			Layer.provide(LiveLayers)
		)
	)
)
