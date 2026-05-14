import {describe, expect, test} from 'bun:test'

import {Array, DateTime, Effect, pipe, Schema, Stream} from 'effect'

import {Prompt, Response} from 'effect/unstable/ai'

import {compactAiParts, makeResumableStream, partsStreamSanitizer, serializeAiPartToMarkdown} from './utils.ts'

import {AgentToolKit} from '#tools/contracts.ts'

describe('serializeAiPartToMarkdown', () => {
	test('serializes runtime prompt messages into markdown', () => {
		expect(
			serializeAiPartToMarkdown([
				Prompt.makeMessage('system', {content: 'Use concise answers.'}),
				Prompt.makeMessage('user', {content: [Prompt.makePart('text', {text: 'Hello'})]}),
				Prompt.makeMessage('assistant', {
					content: [Prompt.makePart('reasoning', {text: 'Think first'}), Prompt.makePart('text', {text: 'Hi there'})]
				})
			]).markdown
		).toBe(
			'## system\n\nUse concise answers.\n\n---\n\n## user\n\nHello\n\n---\n\n## assistant\n\n> Reasoning\n>\n> Think first\n\nHi there'
		)
	})

	test('serializes stream parts and extracts file attachments', () => {
		const {files, markdown} = serializeAiPartToMarkdown([
			Response.makePart('text-delta', {delta: 'Hello', id: 'text'}),
			Response.makePart('tool-call', {
				id: 'call',
				name: 'web_search',
				params: {query: 'effect ai'},
				providerExecuted: false
			}),
			Response.makePart('file', {data: new TextEncoder().encode('file-body'), mediaType: 'text/plain'}),
			Response.makePart('error', {error: 'failed'})
		])

		expect(files).toHaveLength(1)
		expect(files[0]?.name).toBe('attachment.plain')
		expect(markdown).toBe(
			'Hello\n\n---\n\nTool call: web_search\n\n```json\n{\n  "query": "effect ai"\n}\n```\n\n---\n\nFile: attachment.plain (text/plain)\n\n---\n\nError: failed'
		)
	})
})

describe('partsStreamSanitizer', () => {
	test('preserves command execution tool results accepted by the agent toolkit', () => {
		const part = Response.makePart('tool-result', {
			encodedResult: {output: 'ok'},
			id: 'command',
			isFailure: false,
			name: 'command_execution',
			preliminary: false,
			providerExecuted: false,
			result: {output: 'ok'}
		})

		expect(Schema.decodeUnknownSync(Response.StreamPart(AgentToolKit))(part)).toEqual(part)
	})

	test('drops structural and empty parts while preserving metadata without request payloads', async () => {
		const timestamp = DateTime.makeUnsafe(0)
		const result = await pipe(
			Stream.fromIterable([
				Response.makePart('text-start', {id: 'text'}),
				Response.makePart('text-delta', {delta: '', id: 'empty'}),
				Response.makePart('text-delta', {delta: '[REDACTED]', id: 'redacted'}),
				Response.makePart('text-delta', {delta: 'visible', id: 'visible'}),
				Response.makePart('response-metadata', {
					id: 'response',
					metadata: {ok: true},
					modelId: 'model',
					request: undefined,
					timestamp
				})
			]),
			partsStreamSanitizer,
			Stream.runCollect,
			Effect.map(Array.fromIterable),
			Effect.runPromise
		)

		expect(result).toEqual([
			Response.makePart('text-delta', {delta: 'visible', id: 'visible'}),
			Response.makePart('response-metadata', {
				id: 'response',
				metadata: {ok: true},
				modelId: 'model',
				request: undefined,
				timestamp
			})
		])
	})
})

describe('compactAiParts', () => {
	test('merges adjacent text and reasoning deltas and removes structural parts', () => {
		expect(
			compactAiParts([
				Response.makePart('text-start', {id: 'text'}),
				Response.makePart('text-delta', {delta: 'Hel', id: 'a'}),
				Response.makePart('text-delta', {delta: 'lo', id: 'b'}),
				Response.makePart('reasoning-delta', {delta: 'Step ', id: 'c'}),
				Response.makePart('reasoning-delta', {delta: 'one', id: 'd'}),
				Response.makePart('text-end', {id: 'text'})
			])
		).toEqual([
			Response.makePart('text-delta', {delta: 'Hello', id: 'a'}),
			Response.makePart('reasoning-delta', {delta: 'Step one', id: 'c'})
		])
	})
})

describe('makeResumableStream', () => {
	test('replays appended history to new subscribers', async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const resumable = yield* makeResumableStream<string>()
				yield* resumable.append('before')

				return yield* pipe(resumable.stream, Stream.take(1), Stream.runCollect, Effect.map(Array.fromIterable))
			})
		)

		expect(result).toEqual(['before'])
	})
})
