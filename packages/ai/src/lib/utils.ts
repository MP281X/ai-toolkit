import {Array, Effect, Predicate, PubSub, pipe, Ref, Stream, String} from 'effect'

import type {Prompt, Tool} from 'effect/unstable/ai'
import {Response} from 'effect/unstable/ai'

export const makeResumableStream = Effect.fnUntraced(function* <A>() {
	const history = yield* Ref.make<readonly A[]>([])
	const pubsub = yield* PubSub.unbounded<A>()

	return {
		append: Effect.fnUntraced(function* (part: A) {
			yield* Ref.update(history, parts => [...parts, part])
			yield* PubSub.publish(pubsub, part)
		}),
		stream: Stream.concat(Stream.fromIterableEffect(Ref.get(history)), Stream.fromPubSub(pubsub))
	}
})

export function partsStreamSanitizer<A extends Response.StreamPart<Record<string, Tool.Any>>, E, R>(
	parts: Stream.Stream<A, E, R>
) {
	return pipe(
		parts,
		Stream.map(part => {
			switch (part.type) {
				case 'reasoning-start':
				case 'reasoning-end':
				case 'text-start':
				case 'text-end':
				case 'tool-params-start':
				case 'tool-params-end':
				case 'tool-params-delta':
					return
				case 'text-delta':
				case 'reasoning-delta': {
					if (String.isEmpty(part.delta)) return
					if (part.delta === '[REDACTED]') return
					return part
				}
				case 'response-metadata':
					return Response.makePart('response-metadata', {
						id: part.id,
						modelId: part.modelId,
						timestamp: part.timestamp,
						request: undefined,
						metadata: part.metadata
					})
				case 'finish':
					return Response.makePart('finish', {
						reason: part.reason,
						usage: part.usage,
						response: undefined,
						metadata: part.metadata
					})
				default:
					return part
			}
		}),
		Stream.filter(Predicate.isNotUndefined)
	)
}

export function compactAiParts<T extends Record<string, Tool.Any>>(input: readonly Response.StreamPart<T>[]) {
	return Array.reduce(input, Array.empty<Response.StreamPart<T>>(), (parts, part) => {
		if (part.type === 'reasoning-start' || part.type === 'reasoning-end') return parts
		if (part.type === 'text-start' || part.type === 'text-end') return parts
		if (part.type === 'tool-params-start' || part.type === 'tool-params-end') return parts
		if (part.type === 'tool-params-delta') return parts
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

export function serializeAiPartToMarkdown<T extends Record<string, Tool.Any>>(
	input: readonly (Prompt.Message | Response.StreamPart<T>)[]
) {
	let files = Array.empty<File>()
	const markdown = pipe(
		input,
		Array.map(item => {
			let markdown = ''

			if (Predicate.hasProperty('type')(item)) {
				switch (item.type) {
					case 'text-delta':
					case 'reasoning-delta':
						markdown = item.delta
						break
					case 'tool-call':
						markdown = `Tool call: ${item.name}\n\n\`\`\`json\n${JSON.stringify(item.params, undefined, 2)}\n\`\`\``
						break
					case 'tool-result':
						markdown = `Tool result: ${item.name}${item.isFailure ? ' (failed)' : ''}\n\n\`\`\`json\n${JSON.stringify(item.result, undefined, 2)}\n\`\`\``
						break
					case 'tool-approval-request':
						markdown = `Tool approval request: ${item.approvalId}\n\nTool call: ${item.toolCallId}`
						break
					case 'file':
						if (item.data instanceof URL) {
							markdown = `File URL: ${item.data.href} (${item.mediaType})`
							break
						}

						files = [
							...files,
							new File(
								[Predicate.isString(item.data) ? new TextEncoder().encode(item.data) : Uint8Array.from(item.data)],
								`attachment.${pipe(item.mediaType, String.split('/'))[1] ?? 'bin'}`,
								{type: item.mediaType}
							)
						]

						markdown = `File: ${files[files.length - 1]?.name ?? 'attachment'} (${item.mediaType})`
						break
					case 'source':
						markdown =
							item.sourceType === 'url'
								? `Source: [${item.title}](${item.url})`
								: `Source: ${item.title} (${item.mediaType})`
						break
					case 'error':
						markdown = `Error: ${item.error}`
						break
				}

				return String.trim(markdown)
			}

			if (item.role === 'system') return String.trim(`## system\n\n${item.content}`)

			return pipe(
				item.content,
				Array.map(part => {
					switch (part.type) {
						case 'text':
							return part.text
						case 'reasoning':
							return `> Reasoning\n>\n${pipe(
								part.text,
								String.split('\n'),
								Array.map(line => `> ${line}`),
								Array.join('\n')
							)}`
						case 'file':
							if (part.data instanceof URL) return `File URL: ${part.data.href} (${part.mediaType})`

							files = [
								...files,
								new File(
									[Predicate.isString(part.data) ? new TextEncoder().encode(part.data) : Uint8Array.from(part.data)],
									part.fileName ?? `attachment.${pipe(part.mediaType, String.split('/'))[1] ?? 'bin'}`,
									{type: part.mediaType}
								)
							]

							return `File: ${part.fileName ?? 'attachment'} (${part.mediaType})`
						case 'tool-call':
							return `Tool call: ${part.name}\n\n\`\`\`json\n${JSON.stringify(part.params, undefined, 2)}\n\`\`\``
						case 'tool-result':
							return `Tool result: ${part.name}${part.isFailure ? ' (failed)' : ''}\n\n\`\`\`json\n${JSON.stringify(part.result, undefined, 2)}\n\`\`\``
						case 'tool-approval-request':
							return `Tool approval request: ${part.approvalId}\n\nTool call: ${part.toolCallId}`
						case 'tool-approval-response':
							return `Tool approval response: ${part.approvalId}\n\nApproved: ${part.approved}${part.reason ? `\n\nReason: ${part.reason}` : ''}`
					}
				}),
				Array.join('\n\n'),
				content => `## ${item.role}\n\n${content}`,
				String.trim
			)
		}),
		Array.join('\n\n---\n\n'),
		String.trim
	)

	return {files, markdown}
}
