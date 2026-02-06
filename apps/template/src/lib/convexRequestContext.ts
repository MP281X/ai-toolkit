import {Effect} from 'effect'

import type {FunctionReference, OptionalRestArgs} from 'convex/server'

import type {ActionCtx} from '#convex/server.js'

const createConvexRequestService = (actionContext: ActionCtx) => ({
	runQuery: <Query extends FunctionReference<'query', 'public' | 'internal'>>(
		query: Query,
		...args: OptionalRestArgs<Query>
	) => Effect.tryPromise(() => actionContext.runQuery(query, ...args)),
	runMutation: <Mutation extends FunctionReference<'mutation', 'public' | 'internal'>>(
		mutation: Mutation,
		...args: OptionalRestArgs<Mutation>
	) => Effect.tryPromise(() => actionContext.runMutation(mutation, ...args)),
	runAction: <Action extends FunctionReference<'action', 'public' | 'internal'>>(
		action: Action,
		...args: OptionalRestArgs<Action>
	) => Effect.tryPromise(() => actionContext.runAction(action, ...args))
})

export class ConvexRequestContext extends Effect.Service<ConvexRequestContext>()('@ai-toolkit/ConvexRequestContext', {
	effect: Effect.fnUntraced(function* (actionContext: ActionCtx) {
		return createConvexRequestService(actionContext)
	})
}) {}

export const convexRequestContext = (actionContext: ActionCtx) =>
	ConvexRequestContext.context(ConvexRequestContext.make(createConvexRequestService(actionContext)))

export const convexRequestLayer = (actionContext: ActionCtx) => ConvexRequestContext.Default(actionContext)
