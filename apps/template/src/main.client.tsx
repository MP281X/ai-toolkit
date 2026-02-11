import * as Fallbacks from '@ai-toolkit/components/fallbacks'
import {createRouter, RouterProvider} from '@tanstack/react-router'
import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import {routeTree} from './routeTree.gen.ts'

const router = createRouter({
	routeTree,
	defaultPreload: 'intent',
	scrollRestoration: true,
	defaultErrorComponent: Fallbacks.Error,
	defaultPendingComponent: Fallbacks.Loading,
	defaultNotFoundComponent: Fallbacks.NotFound
})

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}

// biome-ignore lint/style/noNonNullAssertion: root
createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>
)
