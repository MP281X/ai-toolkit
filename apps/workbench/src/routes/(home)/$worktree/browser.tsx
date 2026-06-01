import {useAtomSuspense} from '@effect/atom-react'

import {createFileRoute, Navigate} from '@tanstack/react-router'

import {activeHomeAtom, terminalPortsAtom} from '#lib/state.ts'
import {Browser} from '@deslop/components/render/browser'

export const Route = createFileRoute('/(home)/$worktree/browser')({component: BrowserPage})

function BrowserPage() {
	const params = Route.useParams()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return <Navigate to="/" replace />

	return <WorktreeBrowser cwd={activeHome.value.activeWorktree.root} />
}

function WorktreeBrowser(input: {readonly cwd: string}) {
	const ports = useAtomSuspense(terminalPortsAtom(input.cwd))

	return (
		<div className="bg-background h-full min-h-0 min-w-0 p-2">
			<Browser className="h-full min-h-0 w-full min-w-0" ports={ports.value} />
		</div>
	)
}
