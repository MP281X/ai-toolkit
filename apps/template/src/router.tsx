import * as Fallbacks from '@ai-toolkit/components/fallbacks'
import {createRouter} from '@tanstack/react-router'

import {routeTree} from './routeTree.gen.ts'

export function getRouter() {
	return createRouter({
		routeTree,
		defaultPreload: 'intent',
		scrollRestoration: true,
		defaultErrorComponent: Fallbacks.Error,
		defaultPendingComponent: Fallbacks.Loading,
		defaultNotFoundComponent: Fallbacks.NotFound
	})
}
