import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Duration, Effect, Schema, Stream, pipe} from 'effect'

import {Navigate, createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
import {Terminal} from '@deslop/components/render/terminal'
import type {TerminalEvent} from '@deslop/terminal/schema'

export const Route = createFileRoute('/(home)/$worktree/agent')({
	component: AgentPage,
	validateSearch: Schema.toStandardSchemaV1(
		Schema.Struct({args: Schema.Array(Schema.String), command: Schema.String, sessionId: Schema.String})
	)
})

const terminalEventsAtom = Atom.family(
	(input: {
		readonly args: readonly string[]
		readonly command: string
		readonly cwd: string
		readonly sessionId: string
	}) =>
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client =>
					client('terminal.events', {
						args: input.args,
						command: input.command,
						cwd: input.cwd,
						sessionId: input.sessionId
					})
				),
				Stream.unwrap,
				Stream.groupedWithin(100, Duration.millis(16))
			),
			{initialValue: Array.empty<TerminalEvent>()}
		)
)

function AgentPage() {
	const params = Route.useParams()
	const search = Route.useSearch()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return <Navigate to="/" replace />

	return (
		<AgentTerminal
			args={search.args}
			command={search.command}
			cwd={activeHome.value.activeWorktree.root}
			sessionId={search.sessionId}
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

	return (
		<div className="bg-background h-full min-h-0 min-w-0 p-2">
			<Terminal
				key={input.sessionId}
				className="h-full min-h-0 w-full min-w-0 overflow-hidden bg-transparent"
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
