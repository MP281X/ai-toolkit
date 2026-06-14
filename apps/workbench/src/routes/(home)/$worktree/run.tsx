import {useAtomSuspense} from '@effect/atom-react'

import {Schema} from 'effect'

import {createFileRoute} from '@tanstack/react-router'

import {activeHomeAtom} from '#lib/state.ts'
import {WorkbenchTerminal} from '#routes/components/-workbench-terminal.tsx'
import {TerminalPayload} from '#rpcs/contracts.ts'
import {Fallback} from '@deslop/components/fallbacks'

export const Route = createFileRoute('/(home)/$worktree/run')({
	component: RunPage,
	validateSearch: Schema.toStandardSchemaV1(
		Schema.Struct({inactive: Schema.optional(Schema.Boolean), sessionId: Schema.String})
	)
})

function RunPage() {
	const params = Route.useParams()
	const search = Route.useSearch()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return

	if (search.inactive === true) {
		return (
			<div className="bg-background h-full min-h-0 min-w-0 p-2">
				<Fallback message="This script has not been started yet. Use the play button to start it." />
			</div>
		)
	}

	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<WorkbenchTerminal
				key={search.sessionId}
				session={TerminalPayload.make({cwd: activeHome.value.activeWorktree.root, sessionId: search.sessionId})}
			/>
		</div>
	)
}
