import {Option, pipe} from 'effect'

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
	// oxlint-disable-next-line @typescript-eslint/consistent-type-definitions -- TanStack Router augments this interface by name.
	interface Register {
		router: typeof router
	}
}

createRoot(pipe(document.querySelector('#root'), Option.fromNullOr, Option.getOrThrow)).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>
)
