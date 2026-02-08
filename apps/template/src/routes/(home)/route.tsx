import {OAuth} from '@ai-toolkit/oauth/client'
import {Result, useAtomSuspense} from '@effect-atom/atom-react'
import {createFileRoute, Navigate, Outlet} from '@tanstack/react-router'

import {AtomRuntime} from '#lib/atomRuntime.ts'

export const Route = createFileRoute('/(home)')({
	component: Layout
})

const sessionAtom = AtomRuntime.atom(OAuth.session)

function Layout() {
	const session = useAtomSuspense(sessionAtom, {includeFailure: true})
	return Result.builder(session)
		.onErrorTag('OAuthError', () => <Navigate to="/auth" />)
		.onSuccess(() => <Outlet />)
		.render()
}
