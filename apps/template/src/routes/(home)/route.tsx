import {createFileRoute, Outlet} from '@tanstack/react-router'

export const Route = createFileRoute('/(home)')({
	component: Layout
})

function Layout() {
	return <Outlet />
}
