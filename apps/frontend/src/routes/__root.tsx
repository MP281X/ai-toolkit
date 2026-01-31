import {createRootRoute, Outlet} from '@tanstack/react-router'

export const Route = createRootRoute({component: RootComponent})

function RootComponent() {
	return (
		<div className="flex min-h-dvh w-full items-center justify-center">
			<Outlet />
		</div>
	)
}
