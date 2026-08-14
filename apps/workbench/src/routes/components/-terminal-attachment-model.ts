import {Array, Number, Option, Order, String, pipe} from 'effect'

import type {TerminalFrame} from '@deslop/terminal/schema'

type TerminalAttachmentOperation = {type: 'reset'} | {data: string; type: 'output'}

export function terminalAttachmentSizeEqual(left: {cols: number; rows: number}, right: {cols: number; rows: number}) {
	return left.cols === right.cols && left.rows === right.rows
}

function outputEnd(data: string, start: number, maxLength: number) {
	const candidate = Number.min(start + maxLength, data.length)
	if (candidate >= data.length) return candidate
	const previous = pipe(
		data,
		String.charCodeAt(candidate - 1),
		Option.getOrElse(() => -1)
	)
	const next = pipe(
		data,
		String.charCodeAt(candidate),
		Option.getOrElse(() => -1)
	)
	const safeEnd =
		previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? candidate - 1 : candidate
	return safeEnd === start ? Number.min(start + maxLength, data.length) : safeEnd
}

function appendOutput(operations: TerminalAttachmentOperation[], data: string, maxOutputLength: number, start = 0) {
	if (start >= data.length) return operations

	const previous = Array.last(operations)
	if (Option.isSome(previous) && previous.value.type === 'output') {
		const available = maxOutputLength - previous.value.data.length
		if (available > 0) {
			const end = outputEnd(data, start, available)
			return appendOutput(
				[
					...Array.dropRight(operations, 1),
					{data: `${previous.value.data}${String.slice(start, end)(data)}`, type: 'output' as const}
				],
				data,
				maxOutputLength,
				end
			)
		}
	}

	const end = outputEnd(data, start, maxOutputLength)
	return appendOutput(
		Array.append(operations, {
			data: String.slice(start, end)(data),
			type: 'output'
		} satisfies TerminalAttachmentOperation),
		data,
		maxOutputLength,
		end
	)
}

export function terminalAttachmentOperations(input: {
	frames: TerminalFrame[]
	lastSequence: number
	maxOutputLength?: number
}) {
	const maxOutputLength = Number.max(1, input.maxOutputLength ?? 65_536)
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

				return {lastSequence: frame.sequence, operations: appendOutput(current.operations, frame.data, maxOutputLength)}
			}
		)
	)
}
