import {RouterProvider, createRouter} from '@tanstack/react-router'
import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import {routeTree} from './routeTree.gen.ts'

import {Error, Loading, NotFound} from '@deslop/components/fallbacks'

const router = createRouter({
	defaultErrorComponent: Error,
	defaultNotFoundComponent: NotFound,
	defaultPendingComponent: Loading,
	defaultPendingMs: 0,
	defaultPreload: 'intent',
	routeTree,
	scrollRestoration: true
})

declare module '@tanstack/react-router' {
	interface Register {
		readonly router: typeof router
	}
}

const root = document.querySelector('#root')

if (root) {
	createRoot(root).render(
		<StrictMode>
			<RouterProvider router={router} />
		</StrictMode>
	)
}
