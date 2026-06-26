import {Array, Option, Order, pipe} from 'effect'

import type {TerminalFrame} from '@deslop/terminal/schema'

type TerminalAttachmentOperation = {readonly type: 'reset'} | {readonly data: string; readonly type: 'output'}

export function terminalAttachmentSizeEqual(
	left: {readonly cols: number; readonly rows: number},
	right: {readonly cols: number; readonly rows: number}
) {
	return left.cols === right.cols && left.rows === right.rows
}

function outputEnd(data: string, start: number, maxLength: number) {
	const candidate = Math.min(start + maxLength, data.length)
	if (candidate >= data.length) return candidate
	const previous = data.charCodeAt(candidate - 1)
	const next = data.charCodeAt(candidate)
	const safeEnd =
		previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? candidate - 1 : candidate
	return safeEnd === start ? Math.min(start + maxLength, data.length) : safeEnd
}

function appendOutput(
	operations: readonly TerminalAttachmentOperation[],
	data: string,
	maxOutputLength: number,
	start = 0
) {
	if (start >= data.length) return operations

	const previous = Array.last(operations)
	if (Option.isSome(previous) && previous.value.type === 'output') {
		const available = maxOutputLength - previous.value.data.length
		if (available > 0) {
			const end = outputEnd(data, start, available)
			return appendOutput(
				[
					...Array.dropRight(operations, 1),
					{data: `${previous.value.data}${data.slice(start, end)}`, type: 'output' as const}
				],
				data,
				maxOutputLength,
				end
			)
		}
	}

	const end = outputEnd(data, start, maxOutputLength)
	return appendOutput(
		Array.append(operations, {data: data.slice(start, end), type: 'output'} satisfies TerminalAttachmentOperation),
		data,
		maxOutputLength,
		end
	)
}

export function terminalAttachmentOperations(input: {
	readonly frames: readonly TerminalFrame[]
	readonly lastSequence: number
	readonly maxOutputLength?: number
}) {
	const maxOutputLength = Math.max(1, input.maxOutputLength ?? 65_536)
	return pipe(
		input.frames,
		Array.filter(frame => frame.sequence > input.lastSequence),
		Array.sortWith(frame => frame.sequence, Order.Number),
		Array.reduce(
			{
				lastSequence: input.lastSequence,
				operations: Array.empty<TerminalAttachmentOperation>() as readonly TerminalAttachmentOperation[]
			},
			(current, frame) => {
				if (frame.type === 'reset') {
					return {
						lastSequence: frame.sequence,
						operations: Array.append(current.operations, {type: 'reset'} satisfies TerminalAttachmentOperation)
					}
				}

				return {lastSequence: frame.sequence, operations: appendOutput(current.operations, frame.data, maxOutputLength)}
			}
		)
	)
}
