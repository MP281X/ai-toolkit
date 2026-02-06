import {Context, Effect, Layer} from 'effect'

import type {FunctionReference, FunctionReturnType, OptionalRestArgs} from 'convex/server'

import type {ActionCtx} from '#convex/server.js'

type ConvexRunQuery = <Query extends FunctionReference<'query', 'public' | 'internal'>>(
	query: Query,
	...args: [...OptionalRestArgs<Query>]
) => Effect.Effect<FunctionReturnType<Query>, unknown>

type ConvexRunMutation = <Mutation extends FunctionReference<'mutation', 'public' | 'internal'>>(
	mutation: Mutation,
	...args: [...OptionalRestArgs<Mutation>]
) => Effect.Effect<FunctionReturnType<Mutation>, unknown>

type ConvexRunAction = <Action extends FunctionReference<'action', 'public' | 'internal'>>(
	action: Action,
	...args: [...OptionalRestArgs<Action>]
) => Effect.Effect<FunctionReturnType<Action>, unknown>

type ConvexRequestService = {
	readonly runQuery: ConvexRunQuery
	readonly runMutation: ConvexRunMutation
	readonly runAction: ConvexRunAction
}

export class ConvexRequestContext extends Context.Tag('@ai-toolkit/ConvexRequestContext')<
	ConvexRequestContext,
	ConvexRequestService
>() {}

const createConvexRequestService = (actionContext: ActionCtx): ConvexRequestService => ({
	runQuery: (...args) => Effect.tryPromise(() => actionContext.runQuery(...args)),
	runMutation: (...args) => Effect.tryPromise(() => actionContext.runMutation(...args)),
	runAction: (...args) => Effect.tryPromise(() => actionContext.runAction(...args))
})

export const convexRequestContext = (actionContext: ActionCtx) =>
	ConvexRequestContext.context(createConvexRequestService(actionContext))

export const convexRequestLayer = (actionContext: ActionCtx) =>
	Layer.succeed(ConvexRequestContext, createConvexRequestService(actionContext))
