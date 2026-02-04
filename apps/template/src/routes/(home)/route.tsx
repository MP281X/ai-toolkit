import {createFileRoute, Navigate, Outlet} from '@tanstack/react-router'
import {useConvexAuth} from 'convex/react'

export const Route = createFileRoute('/(home)')({
	component: Layout
})

function Layout() {
	const {isAuthenticated, isLoading} = useConvexAuth()

	if (isLoading) return null
	if (!isAuthenticated) return <Navigate to="/auth" />
	return <Outlet />
}
