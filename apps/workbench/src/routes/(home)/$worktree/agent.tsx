import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Option, Schema, pipe} from 'effect'

import {Navigate, createFileRoute} from '@tanstack/react-router'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom, agentsAtom, terminalEventsAtom, terminalStateAtom} from '#lib/state.ts'
import {Terminal} from '@deslop/components/render/terminal'

export const Route = createFileRoute('/(home)/$worktree/agent')({
	component: AgentPage,
	validateSearch: Schema.toStandardSchemaV1(Schema.Struct({agentId: Schema.String}))
})

function agentSessionId(uuid: string) {
	return `agent:${uuid}`
}

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
			sessionId={agentSessionId(search.agentId)}
		/>
	)
}

function AgentTerminal(input: {
	readonly args: readonly string[]
	readonly command: string
	readonly cwd: string
	readonly sessionId: string
}) {
	const writeInput = useAtomSet(RpcClient.mutation('terminal.input'), {mode: 'promise'})
	const resize = useAtomSet(RpcClient.mutation('terminal.resize'), {mode: 'promise'})
	const terminalEvents = useAtomSuspense(terminalEventsAtom(input))
	const terminalState = useAtomSuspense(terminalStateAtom(input))

	return (
		<div className="bg-background h-full min-h-0 min-w-0">
			<Terminal
				key={input.sessionId}
				className="h-full min-h-0 w-full min-w-0 overflow-hidden"
				onData={data =>
					void writeInput({
						payload: {args: input.args, command: input.command, cwd: input.cwd, data, sessionId: input.sessionId}
					})
				}
				onResize={size =>
					void resize({
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
				status={terminalState.value.status}
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
