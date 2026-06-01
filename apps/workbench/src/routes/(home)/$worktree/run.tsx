import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Schema} from 'effect'

import {Navigate, createFileRoute} from '@tanstack/react-router'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom, terminalEventsAtom, terminalStateAtom} from '#lib/state.ts'
import {Fallback} from '@deslop/components/fallbacks'
import {Terminal} from '@deslop/components/render/terminal'

export const Route = createFileRoute('/(home)/$worktree/run')({
	component: RunPage,
	validateSearch: Schema.toStandardSchemaV1(
		Schema.Struct({
			command: Schema.String,
			inactive: Schema.optional(Schema.Boolean),
			runId: Schema.optional(Schema.Number),
			sessionId: Schema.String
		})
	)
})

function RunPage() {
	const params = Route.useParams()
	const search = Route.useSearch()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return <Navigate to="/" replace />

	if (search.inactive === true) {
		return (
			<div className="bg-background h-full min-h-0 min-w-0 p-2">
				<Fallback message="This script has not been started yet. Use the play button to start it." />
			</div>
		)
	}

	return (
		<RunTerminal
			command={search.command}
			cwd={activeHome.value.activeWorktree.root}
			runId={search.runId}
			sessionId={search.sessionId}
		/>
	)
}

function RunTerminal(input: {
	readonly command: string
	readonly cwd: string
	readonly runId?: number
	readonly sessionId: string
}) {
	const writeInput = useAtomSet(RpcClient.mutation('terminal.input'), {mode: 'promise'})
	const resize = useAtomSet(RpcClient.mutation('terminal.resize'), {mode: 'promise'})
	const session = {args: ['-lc', input.command], command: 'sh', cwd: input.cwd, sessionId: input.sessionId}
	const terminalEvents = useAtomSuspense(terminalEventsAtom(session))
	const terminalState = useAtomSuspense(terminalStateAtom(session))

	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<Terminal
				key={input.sessionId}
				className="h-full min-h-0 w-full min-w-0 overflow-hidden"
				onData={data =>
					void writeInput({
						payload: {args: ['-lc', input.command], command: 'sh', cwd: input.cwd, data, sessionId: input.sessionId}
					})
				}
				onResize={size =>
					void resize({
						payload: {
							args: ['-lc', input.command],
							cols: size.cols,
							command: 'sh',
							cwd: input.cwd,
							rows: size.rows,
							sessionId: input.sessionId
						}
					})
				}
				status={
					input.runId !== undefined && terminalState.value.runId < input.runId
						? {state: 'starting'}
						: terminalState.value.status
				}
				write={terminal => {
					for (const event of terminalEvents.value) {
						if (event.type === 'reset') terminal.reset()
						else void terminal.write(event.data)
					}
				}}
			/>
		</div>
	)
}
