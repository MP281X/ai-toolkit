import {HttpServer} from '@effect/platform'
import {RpcSerialization} from '@effect/rpc'
import {ConfigProvider, Context, Effect, Layer, ManagedRuntime, pipe} from 'effect'

import {AiSdk} from '@ai-toolkit/ai'
import type {FunctionReference, FunctionReturnType, OptionalRestArgs} from 'convex/server'

export class ConvexCtx extends Context.Tag('@ai-toolkit/ConvexRequestContext')<
	ConvexCtx,
	{
		runQuery: <Query extends FunctionReference<'query', 'public' | 'internal'>>(
			query: Query,
			...args: OptionalRestArgs<Query>
		) => Effect.Effect<FunctionReturnType<Query>>
		runAction: <Action extends FunctionReference<'action', 'public' | 'internal'>>(
			action: Action,
			...args: OptionalRestArgs<Action>
		) => Effect.Effect<FunctionReturnType<Action>>
		runMutation: <Mutation extends FunctionReference<'mutation', 'public' | 'internal'>>(
			mutation: Mutation,
			...args: OptionalRestArgs<Mutation>
		) => Effect.Effect<FunctionReturnType<Mutation>>
	}
>() {
	static Placeholder = Layer.succeed(ConvexCtx, {
		runQuery: () => Effect.die('ConvexCtx.runQuery not initialized'),
		runAction: () => Effect.die('ConvexCtx.runAction not initialized'),
		runMutation: () => Effect.die('ConvexCtx.runMutation not initialized')
	})
}

export const LiveLayers = pipe(
	Layer.empty,
	// application layers
	Layer.provideMerge(AiSdk.Default),
	// placeholders (ctx that will be initialized at runtime)
	Layer.provideMerge(ConvexCtx.Placeholder),
	// base layers
	Layer.provideMerge(HttpServer.layerContext),
	Layer.provideMerge(RpcSerialization.layerNdjson),
	// envs
	Layer.provideMerge(
		Layer.setConfigProvider(
			ConfigProvider.fromJson({
				AI_EXA: process.env['AI_EXA'],
				AI_OPENCODE_ZEN: process.env['AI_OPENCODE_ZEN']
			})
		)
	)
)

export const ServerRuntime = ManagedRuntime.make(LiveLayers)
