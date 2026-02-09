import * as BunKeyValueStore from '@effect/platform-bun/BunKeyValueStore'
import {RpcSerialization} from '@effect/rpc'
import {Layer} from 'effect'

import {AiSdk} from '@ai-toolkit/ai/service'
import {OAuth} from '@ai-toolkit/oauth/server'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'
import {ResearchEngine} from '@ai-toolkit/research/service'
import {ResearchStore} from '@ai-toolkit/research/storage'

import {AiLive} from '#rpcs/ai/handler.ts'
import {MessagesLive} from '#rpcs/messages/handlers.ts'
import {AuthMiddlewareLive} from '#rpcs/middlewares/handlers.ts'
import {ResearchLive} from '#rpcs/research/handler.ts'

const storageLayer = BunKeyValueStore.layerFileSystem('./data/research')
const researchStoreLayer = ResearchStore.Default.pipe(Layer.provideMerge(storageLayer))
const aiSdkLayer = AiSdk.Default
const researchEngineLayer = ResearchEngine.Default.pipe(
	Layer.provideMerge(researchStoreLayer),
	Layer.provideMerge(aiSdkLayer)
)

const RpcLayers = Layer.mergeAll(
	AiLive,
	MessagesLive,
	ResearchLive,
	AuthMiddlewareLive,
	OtelLayer('backend'),
	RpcSerialization.layerNdjson
)

export const LiveLayers = RpcLayers.pipe(
	Layer.provideMerge(researchEngineLayer),
	Layer.provideMerge(aiSdkLayer),
	Layer.provideMerge(OAuth.Default)
)
