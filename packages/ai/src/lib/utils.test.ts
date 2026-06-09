import {Effect, Fiber, Stream} from 'effect'

import {Prompt, Response} from 'effect/unstable/ai'
import {describe, expect, it} from 'vite-plus/test'

import {
	compactResponseParts,
	makeResumableStream,
	serializePromptMessagesToMarkdown,
	serializeResponsePartsToMarkdown
} from './utils.ts'

describe('@deslop/ai utils', () => {
	it('replays history and continues with live stream parts', async () => {
		const values = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const resumable = yield* makeResumableStream<number>()
					yield* resumable.append(1)
					yield* resumable.append(2)

					const stream = yield* Effect.forkScoped(Stream.runCollect(Stream.take(resumable.stream, 3)))
					yield* Effect.sleep('10 millis')
					yield* resumable.append(3)

					return yield* Fiber.join(stream)
				})
			)
		)

		expect(values).toEqual([1, 2, 3])
	})

	it('compacts adjacent text and reasoning deltas while dropping stream markers', () => {
		const compacted = compactResponseParts([
			Response.makePart('text-start', {id: 'text'}),
			Response.makePart('text-delta', {delta: 'hello', id: 'text'}),
			Response.makePart('text-delta', {delta: ' world', id: 'text'}),
			Response.makePart('text-end', {id: 'text'}),
			Response.makePart('reasoning-start', {id: 'reasoning'}),
			Response.makePart('reasoning-delta', {delta: 'thinking', id: 'reasoning'}),
			Response.makePart('reasoning-delta', {delta: '', id: 'reasoning'}),
			Response.makePart('reasoning-delta', {delta: ' done', id: 'reasoning'}),
			Response.makePart('reasoning-end', {id: 'reasoning'})
		])

		expect(compacted).toEqual([
			expect.objectContaining({delta: 'hello world', type: 'text-delta'}),
			expect.objectContaining({delta: 'thinking done', type: 'reasoning-delta'})
		])
	})

	it('serializes prompt messages with stable role sections and tool protocol blocks', () => {
		const markdown = serializePromptMessagesToMarkdown([
			Prompt.makeMessage('system', {content: 'system instructions'}),
			Prompt.makeMessage('user', {content: [Prompt.makePart('text', {text: 'please run this'})]}),
			Prompt.makeMessage('assistant', {
				content: [
					Prompt.makePart('tool-call', {
						id: 'call-1',
						name: 'shell',
						params: {command: 'pwd'},
						providerExecuted: false
					}),
					Prompt.makePart('tool-result', {id: 'call-1', isFailure: false, name: 'shell', result: {output: '/repo'}})
				]
			})
		])

		expect(markdown).toMatchInlineSnapshot(`
			"## system

			system instructions

			---

			## user

			please run this

			---

			## assistant

			Tool call: shell

			\`\`\`json
			{
			  "command": "pwd"
			}
			\`\`\`

			Tool result: shell

			\`\`\`json
			{
			  "output": "/repo"
			}
			\`\`\`"
		`)
	})

	it('serializes response parts through the compacted Effect AI protocol', () => {
		const markdown = serializeResponsePartsToMarkdown([
			Response.makePart('text-delta', {delta: 'done', id: 'text'}),
			Response.makePart('tool-call', {id: 'call-1', name: 'write', params: {path: 'a.ts'}, providerExecuted: false}),
			Response.makePart('tool-result', {
				encodedResult: {ok: true},
				id: 'call-1',
				isFailure: false,
				name: 'write',
				preliminary: false,
				providerExecuted: false,
				result: {ok: true}
			}),
			Response.makePart('finish', {
				reason: 'stop',
				response: undefined,
				usage: new Response.Usage({
					inputTokens: {cacheRead: undefined, cacheWrite: undefined, total: undefined, uncached: undefined},
					outputTokens: {reasoning: undefined, text: undefined, total: undefined}
				})
			})
		])

		expect(markdown).toMatchInlineSnapshot(`
			"done

			---

			Tool call: write

			\`\`\`json
			{
			  "path": "a.ts"
			}
			\`\`\`

			---

			Tool result: write

			\`\`\`json
			{
			  "ok": true
			}
			\`\`\`

			---

			Finish: stop"
		`)
	})
})
