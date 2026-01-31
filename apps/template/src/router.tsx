import * as Fallbacks from '@ai-toolkit/components/fallbacks'
import {createRouter} from '@tanstack/react-router'

import {routeTree} from './routeTree.gen.ts'

export function getRouter() {
	return createRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreload: 'intent',
		defaultPreloadStaleTime: 0,
		defaultErrorComponent: Fallbacks.Error,
		defaultPendingComponent: Fallbacks.Loading,
		defaultNotFoundComponent: Fallbacks.NotFound
	})
}
