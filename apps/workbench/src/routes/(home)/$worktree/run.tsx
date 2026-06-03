import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Schema} from 'effect'

import {Navigate, createFileRoute} from '@tanstack/react-router'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom, terminalViewAtom} from '#lib/state.ts'
import {Fallback} from '@deslop/components/fallbacks'
import {Terminal} from '@deslop/components/render/terminal'

export const Route = createFileRoute('/(home)/$worktree/run')({
	component: RunPage,
	validateSearch: Schema.toStandardSchemaV1(
		Schema.Struct({
			command: Schema.optional(Schema.String),
			cwd: Schema.optional(Schema.String),
			env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
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
			cwd={search.cwd ?? activeHome.value.activeWorktree.root}
			env={search.env}
			runId={search.runId}
			sessionId={search.sessionId}
		/>
	)
}

function RunTerminal(input: {
	readonly command?: string
	readonly cwd: string
	readonly env?: Readonly<Record<string, string>>
	readonly runId?: number
	readonly sessionId: string
}) {
	const resize = useAtomSet(RpcClient.mutation('terminal.resize'))
	const write = useAtomSet(RpcClient.mutation('terminal.write'))
	const session =
		input.command === undefined
			? {cwd: input.cwd, sessionId: input.sessionId}
			: {args: ['-lc', input.command], command: 'sh', cwd: input.cwd, env: input.env, sessionId: input.sessionId}
	const terminal = useAtomSuspense(terminalViewAtom(session))

	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<Terminal
				key={input.sessionId}
				className="h-full min-h-0 w-full min-w-0 overflow-hidden"
				data={terminal.value.data}
				frame={terminal.value.frame}
				onData={data => {
					write({payload: {...session, data}})
				}}
				onResize={size => {
					resize({payload: {cols: size.cols, rows: size.rows, ...session}})
				}}
				state={
					input.runId !== undefined && terminal.value.state.runId < input.runId
						? 'starting'
						: terminal.value.state.state
				}
			/>
		</div>
	)
}
