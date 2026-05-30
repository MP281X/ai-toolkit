import {useAtomSuspense} from '@effect/atom-react'

import {Array, Effect, Stream, pipe} from 'effect'

import {createFileRoute, Navigate} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
import {Browser} from '@deslop/components/render/browser'

export const Route = createFileRoute('/(home)/$worktree/browser')({component: BrowserPage})

const terminalPortsAtom = Atom.family((cwd: string) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('terminal.ports', {cwd})),
			Stream.unwrap
		),
		{initialValue: Array.empty<number>()}
	)
)

function BrowserPage() {
	const params = Route.useParams()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return <Navigate to="/" replace />

	return <WorktreeBrowser cwd={activeHome.value.activeWorktree.root} />
}

function WorktreeBrowser(props: {readonly cwd: string}) {
	const terminalPorts = useAtomSuspense(terminalPortsAtom(props.cwd))

	return (
		<div className="bg-background h-full min-h-0 min-w-0 p-2">
			<Browser className="h-full min-h-0 w-full min-w-0" ports={terminalPorts.value} />
		</div>
	)
}
