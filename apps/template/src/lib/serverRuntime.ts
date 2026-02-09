import * as BunKeyValueStore from '@effect/platform-bun/BunKeyValueStore'
import {RpcSerialization} from '@effect/rpc'
import {Layer, pipe} from 'effect'

import {AiSdk} from '@ai-toolkit/ai/service'
import {OAuth} from '@ai-toolkit/oauth/server'
import {OtelLayer} from '@ai-toolkit/opentelemetry/server'
import {ResearchEngine} from '@ai-toolkit/research/service'
import {ResearchStore} from '@ai-toolkit/research/storage'
import {JsonStore} from '@ai-toolkit/storage/json'

import {AuthMiddlewareLive} from '#rpcs/middlewares/handlers.ts'
import {ResearchLive} from '#rpcs/research/handler.ts'

const storageLayer = BunKeyValueStore.layerFileSystem('./data/research')
const jsonStoreLayer = pipe(JsonStore.Default, Layer.provideMerge(storageLayer))
const researchStoreLayer = pipe(ResearchStore.Default, Layer.provideMerge(jsonStoreLayer))
const aiSdkLayer = AiSdk.Default
const researchEngineLayer = pipe(
	ResearchEngine.Default,
	Layer.provideMerge(researchStoreLayer),
	Layer.provideMerge(aiSdkLayer)
)

const RpcLayers = Layer.mergeAll(ResearchLive, OtelLayer('backend')).pipe(
	Layer.provideMerge(AuthMiddlewareLive),
	Layer.provideMerge(RpcSerialization.layerNdjson)
)

export const LiveLayers = pipe(
	RpcLayers,
	Layer.provideMerge(researchEngineLayer),
	Layer.provideMerge(aiSdkLayer),
	Layer.provideMerge(OAuth.Default)
)
