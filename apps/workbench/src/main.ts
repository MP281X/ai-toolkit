import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'

import {NodeHttpServer, NodeRuntime} from '@effect/platform-node'

import {Config, Context, Effect, Layer, pipe} from 'effect'

import {HttpRouter, HttpStaticServer} from 'effect/unstable/http'

import HttpApplication from './main.server.ts'

const Server = HttpRouter.serve(
	pipe(
		HttpStaticServer.layer({index: 'index.html', root: fileURLToPath(new URL('./client', import.meta.url)), spa: true}),
		Layer.provideMerge(HttpApplication)
	),
	{disableLogger: true}
)

const Program = pipe(
	Server,
	Layer.provide(
		NodeHttpServer.layerConfig(createServer, {
			gracefulShutdownTimeout: Config.succeed('1500 millis'),
			port: Config.port('PORT').pipe(Config.withDefault(5010))
		})
	),
	Layer.launch,
	Effect.provideContext(Context.makeUnsafe<unknown>(new Map<string, never>())),
	Effect.orDie
)

NodeRuntime.runMain(Program)
