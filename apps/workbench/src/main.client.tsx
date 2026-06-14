import {RouterProvider, createRouter} from '@tanstack/react-router'
import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import {routeTree} from './routeTree.gen.ts'

import * as Fallbacks from '@deslop/components/fallbacks'

const router = createRouter({
	defaultErrorComponent: Fallbacks.Error,
	defaultNotFoundComponent: Fallbacks.NotFound,
	defaultPendingComponent: Fallbacks.Loading,
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
if (!(root instanceof HTMLElement)) throw new Error('Missing #root element')

createRoot(root).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>
)
