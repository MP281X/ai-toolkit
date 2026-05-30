#!/usr/bin/env bun

import {realpathSync} from 'node:fs'
import {pathToFileURL} from 'node:url'

import {BunHttpServer, BunRuntime} from '@effect/platform-bun'

import {Layer, pipe} from 'effect'

import {HttpMiddleware, HttpRouter, HttpStaticServer} from 'effect/unstable/http'
import {RpcGroup, RpcServer} from 'effect/unstable/rpc'

import {LiveLayers} from '#lib/serverRuntime.ts'
import {RpcContracts} from '#rpcs/contracts.ts'
import {BrowserProxyMiddleware} from '@deslop/browser/http'

BunRuntime.runMain(
	pipe(
		HttpRouter.serve(
			Layer.mergeAll(
				RpcServer.layerHttp({group: RpcGroup.make().merge(RpcContracts), path: '/api/rpc', protocol: 'websocket'}),
				HttpStaticServer.layer({
					index: 'index.html',
					root: new URL('./client', pathToFileURL(realpathSync(process.execPath))).pathname,
					spa: true
				}),
				HttpRouter.middleware(BrowserProxyMiddleware, {global: true}),
				HttpRouter.middleware(HttpMiddleware.xForwardedHeaders, {global: true})
			)
		),
		Layer.provide(LiveLayers),
		Layer.provide(BunHttpServer.layer({hostname: 'localhost'})),
		Layer.launch
	)
)
