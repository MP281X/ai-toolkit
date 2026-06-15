import {useAtomSuspense} from '@effect/atom-react'

import {Array, Match, Option, Schema, pipe} from 'effect'

import {createFileRoute} from '@tanstack/react-router'

import {activeWorktreeAtom} from '#lib/state.ts'
import {
	WorkbenchPackageRunTerminal,
	WorkbenchPendingRunsTerminal,
	WorkbenchPortlessRunTerminal
} from '#routes/components/-workbench-terminal.tsx'
import {TerminalPackageScriptPayload, TerminalPortlessScriptPayload} from '#rpcs/contracts.ts'
import type {SidebarPackageRun, SidebarPortlessRun} from '#rpcs/contracts.ts'
import {Fallback} from '@deslop/components/fallbacks'
import {terminalStatusActive} from '@deslop/terminal/schema'

export const Route = createFileRoute('/(home)/$worktree/run')({
	component: RunPage,
	validateSearch: Schema.toStandardSchemaV1(
		Schema.Struct({
			sessionId: Schema.String,
			start: Schema.optional(Schema.Boolean),
			startAll: Schema.optional(Schema.Boolean),
			type: Schema.Literals(['package-script', 'portless-script'])
		})
	)
})

function terminalPayloadForRun(run: SidebarPackageRun | SidebarPortlessRun) {
	return Match.value(run).pipe(
		Match.tag(
			'package-script',
			script => new TerminalPackageScriptPayload({cwd: script.cwd, sessionId: script.sessionId})
		),
		Match.tag(
			'portless-script',
			script => new TerminalPortlessScriptPayload({cwd: script.cwd, sessionId: script.sessionId})
		),
		Match.exhaustive
	)
}

function terminalRunStartable(run: SidebarPackageRun | SidebarPortlessRun) {
	return run.status.state === 'idle' || !terminalStatusActive(run.status.state)
}

function RunPage() {
	const params = Route.useParams()
	const search = Route.useSearch()
	const activeWorktree = useAtomSuspense(activeWorktreeAtom(params.worktree))
	const navigate = Route.useNavigate()
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
	const startSessions =
		search.startAll === true && search.type === 'portless-script'
			? pipe(activeWorktree.value.portlessRuns, Array.filter(terminalRunStartable), Array.map(terminalPayloadForRun))
			: Match.value(terminalRunStartable(selectedRun)).pipe(
					Match.when(true, () => [terminalPayloadForRun(selectedRun)]),
					Match.orElse(() => [])
				)

	if ((search.start === true || search.startAll === true) && startSessions.length > 0) {
		return (
			<div className="bg-background h-full min-h-0 min-w-0">
				<WorkbenchPendingRunsTerminal
					sessions={startSessions}
					onStarted={() => {
						void navigate({
							params: {worktree: params.worktree},
							replace: true,
							search: {sessionId: search.sessionId, type: search.type},
							to: '/$worktree/run'
						})
					}}
				/>
			</div>
		)
	}

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
