import * as Fallbacks from '@ai-toolkit/components/fallbacks'
import {ConvexQueryClient} from '@convex-dev/react-query'
import {QueryClient} from '@tanstack/react-query'
import {createRouter} from '@tanstack/react-router'
import {routerWithQueryClient} from '@tanstack/react-router-with-query'
import {ConvexProvider} from 'convex/react'

import {routeTree} from './routeTree.gen.ts'

export function getRouter() {
	// biome-ignore lint/style/noNonNullAssertion: envs
	const convexQueryClient = new ConvexQueryClient(import.meta.env['VITE_CONVEX_URL']!)
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				queryKeyHashFn: convexQueryClient.hashFn(),
				queryFn: convexQueryClient.queryFn()
			}
		}
	})
	convexQueryClient.connect(queryClient)

	return routerWithQueryClient(
		createRouter({
			routeTree,
			context: {queryClient},
			scrollRestoration: true,
			defaultPreload: 'intent',
			defaultPreloadStaleTime: 0,
			defaultErrorComponent: Fallbacks.Error,
			defaultPendingComponent: Fallbacks.Loading,
			defaultNotFoundComponent: Fallbacks.NotFound,
			Wrap: ({children}) => <ConvexProvider client={convexQueryClient.convexClient} children={children} />
		}),
		queryClient
	)
}
