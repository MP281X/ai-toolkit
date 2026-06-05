import {Array, Effect, Predicate, PubSub, Ref, Stream, String, pipe} from 'effect'

import type {Prompt, Response, Tool} from 'effect/unstable/ai'

export const makeResumableStream = Effect.fnUntraced(function* <A>() {
	const history = yield* Ref.make<readonly A[]>([])
	const pubsub = yield* PubSub.unbounded<A>()

	return {
		append: Effect.fnUntraced(function* (part: A) {
			yield* Ref.update(history, parts => [...parts, part])
			yield* PubSub.publish(pubsub, part)
		}),
		history: Ref.get(history),
		stream: Stream.concat(Stream.fromIterableEffect(Ref.get(history)), Stream.fromPubSub(pubsub))
	}
})

export function compactResponseParts<Tools extends Record<string, Tool.Any>>(
	input: readonly Response.StreamPart<Tools>[]
) {
	return Array.reduce(input, Array.empty<Response.StreamPart<Tools>>(), (parts, part) => {
		if (part.type === 'reasoning-start' || part.type === 'reasoning-end') return parts
		if (part.type === 'text-start' || part.type === 'text-end') return parts
		if (part.type === 'tool-params-start' || part.type === 'tool-params-end') return parts
		if (part.type === 'tool-params-delta') return parts
		if (part.type === 'text-delta' || part.type === 'reasoning-delta') {
			if (String.isEmpty(part.delta)) return parts
			if (part.delta === '[REDACTED]') return parts
		}
		if (!Array.isArrayNonEmpty(parts)) return Array.append(parts, part)

		const [previousParts, lastPart] = Array.unappend(parts)
		if (part.type === 'text-delta' && lastPart.type === 'text-delta') {
			return [...previousParts, {...lastPart, delta: `${lastPart.delta}${part.delta}`}]
		}
		if (part.type === 'reasoning-delta' && lastPart.type === 'reasoning-delta') {
			return [...previousParts, {...lastPart, delta: `${lastPart.delta}${part.delta}`}]
		}

		return Array.append(parts, part)
	})
}

export function serializePromptMessagesToMarkdown(input: readonly Prompt.Message[]) {
	return pipe(
		input,
		Array.map(message => {
			if (message.role === 'system') return String.trim(`## system\n\n${message.content}`)

			return pipe(
				message.content,
				Array.map(part => {
					switch (part.type) {
						case 'text': {
							return part.text
						}
						case 'reasoning': {
							return `> Reasoning\n>\n${pipe(
								part.text,
								String.split('\n'),
								Array.map(line => `> ${line}`),
								Array.join('\n')
							)}`
						}
						case 'file': {
							return part.data instanceof URL
								? `File URL: ${part.data.href} (${part.mediaType})`
								: `File: ${part.fileName ?? 'attachment'} (${part.mediaType})`
						}
						case 'tool-call': {
							return `Tool call: ${part.name}\n\n\`\`\`json\n${JSON.stringify(part.params, undefined, 2)}\n\`\`\``
						}
						case 'tool-result': {
							return `Tool result: ${part.name}${part.isFailure ? ' (failed)' : ''}\n\n\`\`\`json\n${JSON.stringify(part.result, undefined, 2)}\n\`\`\``
						}
						case 'tool-approval-request': {
							return `Tool approval request: ${part.approvalId}\n\nTool call: ${part.toolCallId}`
						}
						case 'tool-approval-response': {
							return `Tool approval response: ${part.approvalId}\n\nApproved: ${part.approved}${
								part.reason === undefined ? '' : `\n\nReason: ${part.reason}`
							}`
						}
					}
				}),
				Array.join('\n\n'),
				content => `## ${message.role}\n\n${content}`,
				String.trim
			)
		}),
		Array.join('\n\n---\n\n'),
		String.trim
	)
}

export function serializeResponsePartsToMarkdown<Tools extends Record<string, Tool.Any>>(
	input: readonly Response.StreamPart<Tools>[]
) {
	return pipe(
		input,
		compactResponseParts,
		Array.map(part => {
			switch (part.type) {
				case 'text-delta':
				case 'reasoning-delta': {
					return part.delta
				}
				case 'tool-call': {
					return `Tool call: ${part.name}\n\n\`\`\`json\n${JSON.stringify(part.params, undefined, 2)}\n\`\`\``
				}
				case 'tool-result': {
					return `Tool result: ${part.name}${part.isFailure ? ' (failed)' : ''}\n\n\`\`\`json\n${JSON.stringify(part.result, undefined, 2)}\n\`\`\``
				}
				case 'response-metadata': {
					return part.modelId !== undefined && String.isNonEmpty(part.modelId) ? `Model: ${part.modelId}` : undefined
				}
				case 'finish': {
					return `Finish: ${part.reason}`
				}
				case 'error': {
					return `Error: ${String.String(part.error)}`
				}
				case 'file':
				case 'reasoning-end':
				case 'reasoning-start':
				case 'source':
				case 'text-end':
				case 'text-start':
				case 'tool-approval-request':
				case 'tool-params-delta':
				case 'tool-params-end':
				case 'tool-params-start': {
				}
			}
		}),
		Array.filter(Predicate.isNotUndefined),
		Array.join('\n\n---\n\n'),
		String.trim
	)
}
