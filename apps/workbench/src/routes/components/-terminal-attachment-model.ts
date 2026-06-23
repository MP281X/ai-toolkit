import {Array, Option, Order, pipe} from 'effect'

import type {TerminalFrame} from '@deslop/terminal/schema'

type TerminalAttachmentOperation = {readonly type: 'reset'} | {readonly data: string; readonly type: 'output'}

export function terminalAttachmentSizeEqual(
	left: {readonly cols: number; readonly rows: number},
	right: {readonly cols: number; readonly rows: number}
) {
	return left.cols === right.cols && left.rows === right.rows
}

export function terminalAttachmentOperations(input: {
	readonly frames: readonly TerminalFrame[]
	readonly lastSequence: number
}) {
	return pipe(
		input.frames,
		Array.filter(frame => frame.sequence > input.lastSequence),
		Array.sortWith(frame => frame.sequence, Order.Number),
		Array.reduce(
			{lastSequence: input.lastSequence, operations: Array.empty<TerminalAttachmentOperation>()},
			(current, frame) => {
				if (frame.type === 'reset') {
					return {
						lastSequence: frame.sequence,
						operations: Array.append(current.operations, {type: 'reset'} satisfies TerminalAttachmentOperation)
					}
				}

				const previous = Array.last(current.operations)
				if (Option.isSome(previous) && previous.value.type === 'output') {
					return {
						lastSequence: frame.sequence,
						operations: [
							...Array.dropRight(current.operations, 1),
							{data: `${previous.value.data}${frame.data}`, type: 'output' as const}
						]
					}
				}
				return {
					lastSequence: frame.sequence,
					operations: Array.append(current.operations, {
						data: frame.data,
						type: 'output'
					} satisfies TerminalAttachmentOperation)
				}
			}
		)
	)
}
