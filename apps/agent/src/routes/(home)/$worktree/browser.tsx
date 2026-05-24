import {useAtomSuspense} from '@effect/atom-react'

import {createFileRoute, Navigate} from '@tanstack/react-router'

import {activeHomeAtom} from '#lib/state.ts'
import {Browser} from '@ai-toolkit/components/render/browser'

export const Route = createFileRoute('/(home)/$worktree/browser')({component: BrowserPage})

function BrowserPage() {
	const params = Route.useParams()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return <Navigate to="/" replace />

	return (
		<div className="bg-background h-full min-h-0 min-w-0 p-2">
			<Browser className="h-full min-h-0 w-full min-w-0" url="http://localhost:3000" />
		</div>
	)
}
