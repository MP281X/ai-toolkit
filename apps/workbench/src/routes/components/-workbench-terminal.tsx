import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Effect, Fiber, Queue, pipe} from 'effect'

import {useEffect, useRef, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {terminalAttachQueueAtom, terminalSessionStatus, type TerminalSessionInput} from '#lib/state.ts'
import {Terminal, type TerminalHandle} from '@deslop/components/render/terminal'

export function WorkbenchTerminal(input: {readonly className?: string; readonly session: TerminalSessionInput}) {
	const resize = useAtomSet(RpcClient.mutation('terminal.resize'))
	const write = useAtomSet(RpcClient.mutation('terminal.write'))
	const updates = useAtomSuspense(terminalAttachQueueAtom(input.session))
	const terminalRef = useRef<TerminalHandle>(null)
	const [status, setStatus] = useState(() => terminalSessionStatus(input.session))

	useEffect(() => {
		setStatus(terminalSessionStatus(input.session))
		const fiber = Effect.runFork(
			pipe(
				Queue.take(updates.value),
				Effect.flatMap(update =>
					Effect.sync(() => {
						if (update.type === 'status') {
							setStatus(update.status)
							return
						}
						if (update.type === 'snapshot') terminalRef.current?.reset()
						terminalRef.current?.write(update.data)
					})
				),
				Effect.forever
			)
		)

		return () => {
			Effect.runSync(Fiber.interrupt(fiber))
		}
	}, [input.session, updates.value])

	return (
		<Terminal
			ref={terminalRef}
			className={input.className}
			onData={data => {
				write({payload: {...input.session, data}})
			}}
			onResize={size => {
				resize({payload: {...input.session, cols: size.cols, rows: size.rows}})
			}}
			state={status.state}
		/>
	)
}
