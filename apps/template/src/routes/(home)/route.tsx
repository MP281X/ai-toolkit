import {createFileRoute, redirect} from '@tanstack/react-router'

export const Route = createFileRoute('/(home)')({
	beforeLoad: async () => {
		const response = await fetch('/api/auth/session', {credentials: 'include'})
		if (!response.ok) throw redirect({to: '/auth'})
	}
})
