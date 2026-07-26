import {Array, Option, Order, pipe} from 'effect'

import type {TerminalFrame} from '@deslop/terminal/schema'
type TerminalAttachmentOperation = {readonly type: 'reset'} | {readonly data: string; readonly type: 'output'}
export function terminalAttachmentSizeEqual(input: {
	readonly left: {readonly cols: number; readonly rows: number}
	readonly right: {readonly cols: number; readonly rows: number}
}) {
	return input.left.cols === input.right.cols && input.left.rows === input.right.rows
}
function outputEnd(input: {readonly data: string; readonly start: number; readonly maxLength: number}) {
	const candidate = Math.min(input.start + input.maxLength, input.data.length)
	if (candidate >= input.data.length) return candidate
	const previous = input.data.charCodeAt(candidate - 1)
	const next = input.data.charCodeAt(candidate)
	const safeEnd =
		previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? candidate - 1 : candidate
	return safeEnd === input.start ? Math.min(input.start + input.maxLength, input.data.length) : safeEnd
}
function appendOutput(input: {
	readonly operations: TerminalAttachmentOperation[]
	readonly data: string
	readonly maxOutputLength: number
	readonly start?: number
}) {
	if ((input.start ?? 0) >= input.data.length) return input.operations
	const previous = Array.last(input.operations)
	if (Option.isSome(previous) && previous.value.type === 'output') {
		const available = input.maxOutputLength - previous.value.data.length
		if (available > 0) {
			const end = outputEnd({data: input.data, maxLength: available, start: input.start ?? 0})
			return appendOutput({
				data: input.data,
				maxOutputLength: input.maxOutputLength,
				operations: [
					...Array.dropRight(input.operations, 1),
					{data: `${previous.value.data}${input.data.slice(input.start ?? 0, end)}`, type: 'output' as const}
				],
				start: end
			})
		}
	}
	const end = outputEnd({data: input.data, maxLength: input.maxOutputLength, start: input.start ?? 0})
	return appendOutput({
		data: input.data,
		maxOutputLength: input.maxOutputLength,
		operations: Array.append(input.operations, {
			data: input.data.slice(input.start ?? 0, end),
			type: 'output'
		} satisfies TerminalAttachmentOperation),
		start: end
	})
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
			{lastSequence: input.lastSequence, operations: Array.empty<TerminalAttachmentOperation>()},
			(current, frame) => {
				if (frame.type === 'reset') {
					return {
						lastSequence: frame.sequence,
						operations: Array.append(current.operations, {type: 'reset'} satisfies TerminalAttachmentOperation)
					}
				}
				return {
					lastSequence: frame.sequence,
					operations: appendOutput({data: frame.data, maxOutputLength, operations: current.operations})
				}
			}
		)
	)
}
