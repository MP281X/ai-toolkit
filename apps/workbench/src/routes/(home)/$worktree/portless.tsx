import {useAtomSuspense} from '@effect/atom-react'

import {Schema} from 'effect'

import {createFileRoute, Navigate} from '@tanstack/react-router'

import {activeHomeAtom, portlessOriginsAtom} from '#lib/state.ts'
import {Browser} from '@deslop/components/render/browser'

export const Route = createFileRoute('/(home)/$worktree/portless')({
	component: PortlessPage,
	validateSearch: Schema.toStandardSchemaV1(Schema.Struct({origin: Schema.optional(Schema.String)}))
})

function PortlessPage() {
	const params = Route.useParams()
	const search = Route.useSearch()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return <Navigate to="/" replace />

	return <WorktreeBrowser cwd={activeHome.value.activeWorktree.root} origin={search.origin} />
}

function WorktreeBrowser(input: {readonly cwd: string; readonly origin?: string}) {
	const origins = useAtomSuspense(portlessOriginsAtom(input.cwd))
	const origin = input.origin && origins.value.includes(input.origin) ? input.origin : origins.value[0]

	return (
		<div className="bg-background h-full min-h-0 min-w-0 p-2">
			<Browser className="h-full min-h-0 w-full min-w-0" origin={origin} />
		</div>
	)
}
