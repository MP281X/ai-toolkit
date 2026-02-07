import {RpcGroup, RpcServer} from '@effect/rpc'
import {Effect, Layer, Record} from 'effect'

import {httpRouter} from 'convex/server'

import {httpAction} from '#convex/server.js'
import {ConvexRequestContext} from '#lib/convexRequestContext.ts'
import {LiveLayers} from '#lib/serverRuntime.ts'
import {AiRpcs} from '#rpcs/contracts.ts'
import {AiLive} from '#rpcs/handlers.ts'
import {auth} from './auth.ts'

const http = httpRouter()

const {handler} = RpcServer.toWebHandler(RpcGroup.make().merge(AiRpcs), {
	layer: Layer.provideMerge(AiLive, LiveLayers),
	disableTracing: true,
	disableFatalDefects: true
})

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers':
		'Content-Type, traceparent, tracestate, b3, x-b3-traceid, x-b3-spanid, x-b3-sampled, x-b3-parentspanid'
}

auth.addHttpRoutes(http)

http.route({
	path: '/',
	method: 'OPTIONS',
	handler: httpAction(async () => {
		return new Response(null, {status: 204, headers: corsHeaders})
	})
})

http.route({
	path: '/',
	method: 'POST',
	handler: httpAction(async (actionContext, request) => {
		const response = await handler(
			request,
			ConvexRequestContext.context(
				new ConvexRequestContext({
					runQuery: (query, ...args) => Effect.tryPromise(() => actionContext.runQuery(query, ...args)),
					runMutation: (mutation, ...args) => Effect.tryPromise(() => actionContext.runMutation(mutation, ...args)),
					runAction: (action, ...args) => Effect.tryPromise(() => actionContext.runAction(action, ...args))
				})
			)
		)

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: new Headers({
				...Record.fromEntries(response.headers),
				...corsHeaders
			})
		})
	})
})

export default http
