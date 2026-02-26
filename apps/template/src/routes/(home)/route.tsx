import {useAtomSuspense} from '@effect/atom-react'

import {OAuth} from '@ai-toolkit/oauth/client'
import {createFileRoute, Navigate, Outlet} from '@tanstack/react-router'
import {AsyncResult} from 'effect/unstable/reactivity'

import {AtomRuntime} from '#lib/atomRuntime.ts'

export const Route = createFileRoute('/(home)')({
	component: Layout
})

const sessionAtom = AtomRuntime.atom(OAuth.session)

function Layout() {
	const session = useAtomSuspense(sessionAtom, {includeFailure: true})
	return AsyncResult.builder(session)
		.onErrorTag('OAuthError', () => <Navigate to="/auth" />)
		.onSuccess(() => <Outlet />)
		.render()
}
