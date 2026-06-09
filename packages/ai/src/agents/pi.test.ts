import {Effect, Stream, SubscriptionRef, pipe} from 'effect'

import {Prompt} from 'effect/unstable/ai'
import {describe, expect, it} from 'vite-plus/test'

import {Agent} from '../service.ts'

const layer = Agent.layer({
	agent: 'pi',
	cwd: process.cwd(),
	systemPrompt: Prompt.makeMessage('system', {
		content:
			'You are a concise regression-test assistant. Answer exactly what was asked and avoid tool calls unless required.'
	}),
	tools: 'none'
})

const request = {
	messages: [Prompt.makeMessage('user', {content: [Prompt.makePart('text', {text: 'Reply with only: deslop-pi-ok'})]})],
	model: 'gpt-5.5',
	provider: 'openai-codex',
	thinkingLevel: 'low'
} as const

describe.skip('@deslop/ai Pi agent debug integration', () => {
	it('streams a prompt through the Agent service', async () => {
		const parts = await Effect.runPromise(
			pipe(
				Agent,
				Effect.flatMap(agent => Stream.runCollect(agent.streamText(request))),
				Effect.provide(layer),
				Effect.scoped
			)
		)

		expect(parts.some(part => part.type === 'text-delta')).toBe(true)
		expect(parts.at(-1)?.type).toBe('finish')
	})

	it('records the last submitted prompt history', async () => {
		const history = await Effect.runPromise(
			pipe(
				Agent,
				Effect.flatMap(agent => pipe(Stream.runCollect(agent.streamText(request)), Effect.andThen(agent.history))),
				Effect.provide(layer),
				Effect.scoped
			)
		)

		expect(history).toEqual(request.messages)
	})

	it('aborts the running Pi turn when the stream is closed early', async () => {
		const status = await Effect.runPromise(
			pipe(
				Agent,
				Effect.flatMap(agent =>
					pipe(
						agent.streamText({
							...request,
							messages: [
								Prompt.makeMessage('user', {
									content: [
										Prompt.makePart('text', {
											text: 'Start a long explanation, but this stream will be closed after the first part.'
										})
									]
								})
							]
						}),
						Stream.take(1),
						Stream.runCollect,
						Effect.andThen(SubscriptionRef.get(agent.status))
					)
				),
				Effect.provide(layer),
				Effect.scoped
			)
		)

		expect(status.state).toBe('idle')
	})
})
