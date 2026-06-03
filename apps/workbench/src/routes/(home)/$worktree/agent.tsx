import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Option, Schema, pipe} from 'effect'

import {Navigate, createFileRoute} from '@tanstack/react-router'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom, agentsAtom, terminalViewAtom} from '#lib/state.ts'
import {Terminal} from '@deslop/components/render/terminal'

export const Route = createFileRoute('/(home)/$worktree/agent')({
	component: AgentPage,
	validateSearch: Schema.toStandardSchemaV1(Schema.Struct({agentId: Schema.String}))
})

function AgentPage() {
	const params = Route.useParams()
	const search = Route.useSearch()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	const cwd = activeHome.value.activeWorktree?.root ?? ''
	const sessions = useAtomSuspense(agentsAtom(cwd))
	if (!activeHome.value.activeWorktree) return <Navigate to="/" replace />
	const session = pipe(
		sessions.value,
		Array.findFirst(candidate => candidate.uuid === search.agentId),
		Option.getOrUndefined
	)
	if (!session) return <Navigate to="/" replace />

	return (
		<AgentTerminal
			args={session.args}
			command={session.command}
			cwd={activeHome.value.activeWorktree.root}
			sessionId={search.agentId}
		/>
	)
}

function AgentTerminal(input: {
	readonly args: readonly string[]
	readonly command: string
	readonly cwd: string
	readonly sessionId: string
}) {
	const resize = useAtomSet(RpcClient.mutation('terminal.resize'))
	const write = useAtomSet(RpcClient.mutation('terminal.write'))
	const terminal = useAtomSuspense(terminalViewAtom(input))

	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<Terminal
				key={input.sessionId}
				className="h-full min-h-0 w-full min-w-0 overflow-hidden"
				data={terminal.value.data}
				frame={terminal.value.frame}
				onData={data =>
					write({payload: {args: input.args, command: input.command, cwd: input.cwd, data, sessionId: input.sessionId}})
				}
				onResize={size =>
					resize({
						payload: {
							args: input.args,
							cols: size.cols,
							command: input.command,
							cwd: input.cwd,
							rows: size.rows,
							sessionId: input.sessionId
						}
					})
				}
				state={terminal.value.state.state}
			/>
		</div>
	)
}
