import {NodeServices} from '@effect/platform-node'
import {expect, it} from '@effect/vitest'

import {Array, Config, Effect, Layer, Result, Schema, Stream, String, pipe} from 'effect'

import {InMemoryCredentialStore, createModels} from '@earendil-works/pi-ai'
import {openaiCodexProvider} from '@earendil-works/pi-ai/providers/openai-codex'
import {Prompt, type Toolkit} from 'effect/unstable/ai'

import {PiToolkit} from '#schema'
import {Ai, type Pi} from '#service'

import {handlers} from './tools.ts'

it.layer(NodeServices.layer)('Pi', test => {
	test.effect.skip(
		'answers through gpt-5.6-luna low (requires OPENAI_CODEX_OAUTH)',
		Effect.fnUntraced(function* () {
			const credential = yield* Schema.decodeEffect(
				Schema.fromJsonString(
					Schema.Struct({
						access: Schema.String,
						expires: Schema.Finite,
						refresh: Schema.String,
						type: Schema.Literals(['oauth'] as const)
					})
				)
			)(yield* Config.string('OPENAI_CODEX_OAUTH'))
			const credentials = new InMemoryCredentialStore()
			const runtime = yield* Effect.context()
			yield* Effect.promise(() =>
				credentials.modify('openai-codex', () => Effect.runPromiseWith(runtime)(Effect.succeed(credential)))
			)
			const models = createModels({credentials})
			models.setProvider(openaiCodexProvider())
			const config: Pi.Config<Toolkit.Tools<typeof PiToolkit>> = {
				main: {description: 'main', instructions: '', name: 'main', skills: [], tools: []},
				model: {id: 'gpt-5.6-luna', provider: 'openai-codex', reasoning: 'low'},
				models,
				toolkit: PiToolkit
			}
			const program = Effect.gen(function* () {
				const ai = yield* Ai
				const parts = yield* pipe(
					ai.prompt(Prompt.makeMessage('user', {content: [Prompt.makePart('text', {text: 'Reply with exactly OK.'})]})),
					Stream.runCollect
				)
				const output = pipe(
					parts,
					Array.filterMap(part => {
						if (part.type !== 'text-delta') return Result.failVoid
						return Result.succeed(part.delta)
					}),
					Array.join(''),
					String.trim
				)

				expect(output).toBe('OK')
			})

			const serviceContext = yield* Layer.build(
				pipe(Ai.layerPi(config), Layer.provide(PiToolkit.toLayer(handlers('.'))))
			)
			yield* pipe(program, Effect.provide(serviceContext))
		})
	)
})
