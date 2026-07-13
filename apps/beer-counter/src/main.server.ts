import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'

import {NodeFileSystem, NodeHttpServer, NodePath, NodeRuntime} from '@effect/platform-node'

import {Config, Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter, HttpStaticServer} from 'effect/unstable/http'
import {KeyValueStore} from 'effect/unstable/persistence'
import {RpcServer} from 'effect/unstable/rpc'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'

const DataLayer = Layer.unwrap(
	Config.string('DATA_DIR').pipe(
		Config.withDefault('/data'),
		Config.map(directory =>
			pipe(
				KeyValueStore.layerFileSystem(directory),
				Layer.provideMerge(NodeFileSystem.layer),
				Layer.provideMerge(NodePath.layer)
			)
		)
	)
)

NodeRuntime.runMain(
	pipe(
		HttpRouter.serve(
			Layer.mergeAll(
				RpcServer.layerHttp({group: RpcContracts, path: '/api/rpc', protocol: 'websocket'}),
				HttpStaticServer.layer({
					index: 'index.html',
					root: fileURLToPath(new URL('./client', import.meta.url)),
					spa: true
				}),
				HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
			),
			{disableLogger: true}
		),
		Layer.provide(LiveLayers),
		Layer.provide(DataLayer),
		Layer.provide(NodeHttpServer.layerConfig(createServer, {port: Config.port('PORT').pipe(Config.withDefault(5020))})),
		Layer.launch
	)
)
