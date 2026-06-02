import path from 'node:path'

import {Config, Effect, Layer, pipe} from 'effect'

import {FetchHttpClient} from 'effect/unstable/http'
import {KeyValueStore} from 'effect/unstable/persistence'
import {RpcSerialization} from 'effect/unstable/rpc'

import {RpcHandlers} from '#rpcs/handlers.ts'
import {GitWorkspace} from '@deslop/git/service'
import {OtelLayer} from '@deslop/opentelemetry/server'
import {Portless} from '@deslop/portless/http'

export const LiveLayers = pipe(
	Layer.empty,
	// Rpc handlers
	Layer.provideMerge(RpcHandlers),
	// Application layers
	Layer.provideMerge(Portless.layer),
	Layer.provideMerge(GitWorkspace.layer),
	Layer.provideMerge(
		Layer.unwrap(
			pipe(
				Config.string('HOME'),
				Config.withDefault(process.cwd()),
				Effect.map(home => KeyValueStore.layerFileSystem(path.join(home, '.deslop')))
			)
		)
	),
	// Base layers
	Layer.provideMerge(OtelLayer('workbench-server')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(RpcSerialization.layerMsgPack)
)
