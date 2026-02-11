import {HttpMiddleware, HttpRouter, HttpServer} from '@effect/platform'
import {BunHttpServer, BunRuntime} from '@effect/platform-bun'
import {Function, Layer, pipe} from 'effect'

import {OAuth} from '@ai-toolkit/oauth/server'

import {LiveLayers, RivetServer} from '#lib/serverRuntime.ts'

const Routes = HttpRouter.empty.pipe(
	HttpRouter.all('/api/rivet/*', RivetServer.handler),
	HttpRouter.all('/api/auth/*', OAuth.handler),
	HttpMiddleware.cors({
		credentials: true,
		allowedOrigins: ['http://localhost:5173'],
		allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
	}),
	HttpMiddleware.xForwardedHeaders
)

BunRuntime.runMain(
	Layer.launch(
		pipe(
			Routes,
			HttpServer.serve(),
			HttpServer.withLogAddress,
			HttpMiddleware.withTracerDisabledWhen(Function.constTrue),
			Layer.provide(BunHttpServer.layer({port: 8080})),
			Layer.provide(LiveLayers)
		)
	)
)
