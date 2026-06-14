import {homedir} from 'node:os'
import path from 'node:path'

import {Config, Effect, Layer, pipe} from 'effect'

import {FetchHttpClient} from 'effect/unstable/http'
import {KeyValueStore} from 'effect/unstable/persistence'
import {RpcSerialization} from 'effect/unstable/rpc'

import {RpcHandlers} from '#rpcs/handlers.ts'
import {AgentCommand} from '@deslop/ai/service'
import {GitWorkspace} from '@deslop/git/service'
import {OtelLayer} from '@deslop/opentelemetry/server'
import {Usage} from '@deslop/usage/service'

export const LiveLayers = pipe(
	Layer.empty,
	// Rpc handlers
	Layer.provideMerge(RpcHandlers),
	// Application layers
	Layer.provideMerge(AgentCommand.layer),
	Layer.provideMerge(GitWorkspace.layer),
	Layer.provideMerge(Usage.layer),
	Layer.provideMerge(
		Layer.unwrap(
			pipe(
				Config.string('HOME'),
				Config.withDefault(homedir()),
				Effect.map(home => KeyValueStore.layerFileSystem(path.join(home, '.deslop')))
			)
		)
	),
	// Base layers
	Layer.provideMerge(OtelLayer('workbench-server')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(RpcSerialization.layerMsgPack)
)
