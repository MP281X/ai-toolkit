import {Layer, pipe} from 'effect'

import {Agent} from '@ai-toolkit/ai/service'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'
import {FetchHttpClient} from 'effect/unstable/http'
import {RpcSerialization} from 'effect/unstable/rpc'

import {RpcHandlers} from '#rpcs/handlers.ts'

export const LiveLayers = pipe(
	Layer.empty,
	// rpc handlers
	Layer.provideMerge(RpcHandlers),
	// application layers
	Layer.provideMerge(Agent.layer),
	Layer.provideMerge(Agent.resolveLanguageModel({provider: 'opencode-go', model: 'minimax-m2.5'})),
	// base layers
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(OtelLayer('agent-server')),
	Layer.provideMerge(RpcSerialization.layerMsgPack)
)
