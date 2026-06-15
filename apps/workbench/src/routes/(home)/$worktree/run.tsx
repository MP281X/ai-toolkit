import {useAtomSuspense} from '@effect/atom-react'

import {Array, Match, Option, Schema, pipe} from 'effect'

import {createFileRoute} from '@tanstack/react-router'

import {activeWorktreeAtom} from '#lib/state.ts'
import {WorkbenchPackageRunTerminal, WorkbenchPortlessRunTerminal} from '#routes/components/-workbench-terminal.tsx'
import {Fallback} from '@deslop/components/fallbacks'

export const Route = createFileRoute('/(home)/$worktree/run')({
	component: RunPage,
	validateSearch: Schema.toStandardSchemaV1(
		Schema.Struct({sessionId: Schema.String, type: Schema.Literals(['package-script', 'portless-script'])})
	)
})

function RunPage() {
	const params = Route.useParams()
	const search = Route.useSearch()
	const activeWorktree = useAtomSuspense(activeWorktreeAtom(params.worktree))
	const selectedRun = Match.value(search.type).pipe(
		Match.when('package-script', () =>
			pipe(
				activeWorktree.value.packageRuns,
				Array.findFirst(run => run.sessionId === search.sessionId),
				Option.getOrThrowWith(() => new Error(`Unknown package script run: ${search.sessionId}`))
			)
		),
		Match.when('portless-script', () =>
			pipe(
				activeWorktree.value.portlessRuns,
				Array.findFirst(run => run.sessionId === search.sessionId),
				Option.getOrThrowWith(() => new Error(`Unknown portless script run: ${search.sessionId}`))
			)
		),
		Match.exhaustive
	)

	if (selectedRun.status.state === 'idle') {
		return (
			<div className="bg-background h-full min-h-0 min-w-0 p-2">
				<Fallback message="This script has not been started yet. Use the play button to start it." />
			</div>
		)
	}

	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			{Match.value(selectedRun).pipe(
				Match.tag('package-script', run => <WorkbenchPackageRunTerminal run={run} />),
				Match.tag('portless-script', run => <WorkbenchPortlessRunTerminal run={run} />),
				Match.exhaustive
			)}
		</div>
	)
}
