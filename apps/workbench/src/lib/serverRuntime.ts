import {NodeChildProcessSpawner, NodeFileSystem, NodePath, NodeSocket} from '@effect/platform-node'

import {Config, Effect, Layer, Redacted, pipe} from 'effect'

import {FetchHttpClient} from 'effect/unstable/http'
import {RpcSerialization} from 'effect/unstable/rpc'

import {AgentRpcHandlers, RpcHandlers} from '#rpcs/handlers.ts'
import {Assets} from '#services/assets/service.ts'
import {Preview} from '#services/preview/service.ts'
import {Processes} from '#services/processes/service.ts'
import {Publication} from '#services/publication/service.ts'
import {RepositoryError} from '#services/repositories/schema.ts'
import {Repositories} from '#services/repositories/service.ts'
import {WorkbenchError} from '#services/workbench/schema.ts'
import {Workbench} from '#services/workbench/service.ts'
import {AgentUsage} from '@deslop/agent/service'
import {OAuth} from '@deslop/oauth/service'
import {OtelLayer} from '@deslop/opentelemetry/server'

const OAuthLive = Layer.unwrap(
	Effect.gen(function* () {
		const allowedUserId = yield* Config.string('GITHUB_ALLOWED_USER_ID')
		const clientId = yield* Config.string('GITHUB_CLIENT_ID')
		const clientSecret = yield* Config.redacted('GITHUB_CLIENT_SECRET')
		return OAuth.layer({allowedUserId, clientId, clientSecret})
	})
)

const ApplicationLive = Layer.unwrap(
	Effect.gen(function* () {
		const oauth = yield* OAuth
		const directory = yield* Config.string('WORKBENCH_DATA_DIRECTORY').pipe(Config.withDefault('.workbench'))
		const model = yield* Config.string('WORKBENCH_MODEL').pipe(Config.withDefault('gpt-5.6-sol'))
		const reasoningEffort = yield* Config.string('WORKBENCH_REASONING_EFFORT').pipe(Config.withDefault('medium'))
		const repositoryToken = oauth.token.pipe(
			Effect.mapError(cause => RepositoryError.make({cause, message: 'GitHub authentication required'}))
		)
		const workbenchToken = oauth.token.pipe(
			Effect.map(Redacted.make),
			Effect.mapError(cause => WorkbenchError.make({cause, message: 'GitHub authentication required'}))
		)
		const repositories = Repositories.layer({directory, token: repositoryToken})
		const applicationServices = pipe(
			Layer.mergeAll(Assets.layer, Preview.layer, Processes.layer, Publication.layer),
			Layer.provideMerge(repositories)
		)
		const workbench = pipe(
			Workbench.layer({model, reasoningEffort, token: workbenchToken}),
			Layer.provideMerge(applicationServices),
			Layer.provideMerge(repositories)
		)
		return pipe(
			Layer.mergeAll(RpcHandlers, AgentRpcHandlers),
			Layer.provideMerge(AgentUsage.layer({provider: 'openai-codex'})),
			Layer.provideMerge(workbench),
			Layer.provideMerge(repositories)
		)
	})
)

export const LiveLayers = pipe(
	Layer.empty,
	Layer.provideMerge(ApplicationLive),
	Layer.provideMerge(OAuthLive),
	Layer.provideMerge(OtelLayer('workbench-server')),
	Layer.provideMerge(FetchHttpClient.layer),
	Layer.provideMerge(RpcSerialization.layerMsgPack),
	Layer.provideMerge(NodeChildProcessSpawner.layer),
	Layer.provideMerge(NodeFileSystem.layer),
	Layer.provideMerge(NodePath.layer),
	Layer.provideMerge(NodeSocket.layerWebSocketConstructor)
)
