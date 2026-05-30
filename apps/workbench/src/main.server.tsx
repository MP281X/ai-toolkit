#!/usr/bin/env bun

import {BunHttpServer, BunRuntime} from '@effect/platform-bun'

import {Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter, HttpStaticServer} from 'effect/unstable/http'
import {RpcGroup, RpcServer} from 'effect/unstable/rpc'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'

BunRuntime.runMain(
	pipe(
		HttpRouter.serve(
			Layer.mergeAll(
				RpcServer.layerHttp({group: RpcGroup.make().merge(RpcContracts), path: '/api/rpc', protocol: 'websocket'}),
				HttpStaticServer.layer({index: 'index.html', root: new URL('./client', import.meta.url).pathname, spa: true}),
				HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
			)
		),
		Layer.provide(LiveLayers),
		Layer.provide(BunHttpServer.layer({hostname: '0.0.0.0'})),
		Layer.launch
	)
)
