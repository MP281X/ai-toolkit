import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Duration, Effect, Schema, Stream, pipe} from 'effect'

import {Navigate, createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
import {Error as ErrorFallback} from '@deslop/components/fallbacks'
import {Terminal} from '@deslop/components/render/terminal'
import type {TerminalEvent} from '@deslop/terminal/schema'

const RunSearch = Schema.Struct({
	command: Schema.String,
	inactive: Schema.optional(Schema.Boolean),
	sessionId: Schema.String
})

export const Route = createFileRoute('/(home)/$worktree/run')({
	component: RunPage,
	validateSearch: Schema.toStandardSchemaV1(RunSearch)
})

const terminalEventsAtom = Atom.family(
	(input: {readonly command: string; readonly cwd: string; readonly sessionId: string}) =>
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client =>
					client('terminal.events', {
						args: ['-lc', input.command],
						command: 'sh',
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

function RunPage() {
	const params = Route.useParams()
	const search = Route.useSearch()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return <Navigate to="/" replace />

	if (search.inactive === true) {
		return (
			<div className="bg-background h-full min-h-0 min-w-0 p-2">
				<ErrorFallback
					error={new Error('This script has not been started yet. Use the play button to start it.')}
					reset={() => {}}
				/>
			</div>
		)
	}

	return (
		<RunTerminal command={search.command} cwd={activeHome.value.activeWorktree.root} sessionId={search.sessionId} />
	)
}

function RunTerminal(input: {readonly command: string; readonly cwd: string; readonly sessionId: string}) {
	const writeInput = useAtomSet(RpcClient.mutation('terminal.input'), {mode: 'promise'})
	const resize = useAtomSet(RpcClient.mutation('terminal.resize'), {mode: 'promise'})
	const terminalEvents = useAtomSuspense(terminalEventsAtom(input))
	const payload = {args: ['-lc', input.command], command: 'sh', cwd: input.cwd, sessionId: input.sessionId}

	return (
		<div className="bg-background h-full min-h-0 min-w-0 p-2">
			<Terminal
				key={input.sessionId}
				className="h-full min-h-0 w-full min-w-0 overflow-hidden bg-transparent"
				onData={data => void writeInput({payload: {...payload, data}})}
				onResize={size => void resize({payload: {...payload, ...size}})}
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
