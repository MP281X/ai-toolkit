import {Error, Loading, NotFound} from '@ai-toolkit/components/fallbacks'
import {createRouter, RouterProvider} from '@tanstack/react-router'
import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import {routeTree} from './routeTree.gen.ts'

const router = createRouter({
	routeTree,
	defaultPreload: 'intent',
	scrollRestoration: true,
	defaultErrorComponent: Error,
	defaultPendingComponent: Loading,
	defaultNotFoundComponent: NotFound
})

declare module '@tanstack/react-router' {
	// biome-ignore lint/style/useConsistentTypeDefinitions: tanstack
	interface Register {
		router: typeof router
	}
}

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>
)
