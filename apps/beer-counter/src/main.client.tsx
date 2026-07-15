import {RouterProvider, createRouter} from '@tanstack/react-router'
import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import {routeTree} from './routeTree.gen.ts'

import {Error, NotFound} from '@deslop/components/fallbacks'
import {Spinner} from '@deslop/components/ui/spinner'

function Loading() {
	return (
		<main className="bg-background text-foreground grid h-dvh w-dvw place-items-center">
			<Spinner className="text-muted-foreground size-9 border-2 opacity-60" />
		</main>
	)
}

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
