import {HttpMiddleware, HttpRouter, HttpServer} from '@effect/platform'
import {BunHttpServer, BunRuntime} from '@effect/platform-bun'
import {RpcGroup, RpcServer} from '@effect/rpc'
import {Effect, Function, Layer, pipe} from 'effect'

import {OAuthRoutes} from '@ai-toolkit/oauth'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {AiRpcs, MessagesRpcs} from '#rpcs/contracts.ts'

// RPCs
const RpcHandler = RpcServer.toHttpAppWebsocket(RpcGroup.make().merge(AiRpcs, MessagesRpcs), {
	disableFatalDefects: true
})

// HTTP routes
const Routes = Effect.gen(function* () {
	return HttpRouter.empty.pipe(
		HttpRouter.all('/api/rpc', yield* RpcHandler),
		HttpRouter.mount('/api/auth', yield* OAuthRoutes),
		HttpMiddleware.cors({
			credentials: true,
			allowedOrigins: ['*'],
			allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
			allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
		}),
		HttpMiddleware.xForwardedHeaders
	)
})

BunRuntime.runMain(
	Layer.launch(
		pipe(
			Routes,
			Effect.map(HttpServer.serve()),
			Layer.unwrapScoped,
			HttpServer.withLogAddress,
			HttpMiddleware.withTracerDisabledWhen(Function.constTrue),
			Layer.provide(BunHttpServer.layer({port: 8080})),
			Layer.provide(LiveLayers)
		)
	)
)
