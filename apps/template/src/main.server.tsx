import {HttpMiddleware, HttpRouter, HttpServer} from '@effect/platform'
import {BunHttpServer, BunRuntime} from '@effect/platform-bun'
import {RpcGroup, RpcServer} from '@effect/rpc'
import {Effect, Function, Layer, pipe} from 'effect'

import {OAuth} from '@ai-toolkit/oauth/server'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {ResearchRpcs} from '#rpcs/research/contracts.ts'

// RPCs
const RpcHandler = pipe(
	RpcServer.toHttpAppWebsocket(RpcGroup.make().merge(ResearchRpcs), {
		disableFatalDefects: true
	}),
	Effect.provide(Layer.scope)
)

// HTTP routes
const Routes = Effect.map(RpcHandler, handler =>
	pipe(
		HttpRouter.empty,
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
)

const ServerLayer = pipe(
	Routes,
	Effect.map(HttpServer.serve()),
	Layer.unwrapScoped,
	HttpServer.withLogAddress,
	HttpMiddleware.withTracerDisabledWhen(Function.constTrue),
	Layer.provide(BunHttpServer.layer({port: 8080})),
	Layer.provide(LiveLayers)
)

BunRuntime.runMain(Effect.provide(Layer.scope)(Layer.launch(ServerLayer)))
