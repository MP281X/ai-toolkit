import {setTimeout as delay} from 'node:timers/promises'

import {assert, describe, it} from '@effect/vitest'

import {Effect, Layer, Result} from 'effect'

import {evaluateCodeMode} from './code-mode.ts'

import {RepositoryName} from '#services/repositories/schema.ts'

describe('code-mode validation', () => {
	it.effect('executes a host-controlled Effect program', () =>
		Effect.gen(function* () {
			const result = yield* evaluateCodeMode({
				client: {},
				context: {agent: 'agent', repository: RepositoryName.make('repository')},
				layer: Layer.empty,
				source: `effect.Effect.gen(function* () {
					return yield* effect.Effect.map(effect.Effect.succeed(41), value => value + 1)
				})`
			})
			assert.strictEqual(result, 42)
		})
	)

	it.effect('bridges the filtered RPC client through the worker', () =>
		Effect.gen(function* () {
			const result = yield* evaluateCodeMode({
				client: {'agent.issue.history': () => Effect.succeed([])},
				context: {agent: 'agent', repository: RepositoryName.make('repository')},
				layer: Layer.empty,
				source: `effect.Effect.gen(function* () {
					return yield* client["agent.issue.history"]({ repository: context.repository })
				})`
			})
			assert.deepEqual(result, [])
		})
	)

	it.effect('interrupts host RPC work when the worker deadline expires', () =>
		Effect.gen(function* () {
			let completed = false
			const result = yield* Effect.result(
				evaluateCodeMode({
					client: {
						'agent.issue.history': () =>
							Effect.sleep(500).pipe(
								Effect.tap(() =>
									Effect.sync(() => {
										completed = true
									})
								),
								Effect.as([])
							)
					},
					context: {agent: 'agent', repository: RepositoryName.make('repository')},
					deadlineMilliseconds: 100,
					layer: Layer.empty,
					source: `effect.Effect.gen(function* () {
						return yield* client["agent.issue.history"]({ repository: context.repository })
					})`
				})
			)
			yield* Effect.promise(() => delay(600))
			assert.isTrue(Result.isFailure(result))
			assert.isFalse(completed)
		})
	)

	it.effect('denies filesystem access reached through host constructors', () =>
		Effect.gen(function* () {
			const result = yield* Effect.result(
				evaluateCodeMode({
					client: {},
					context: {agent: 'agent', repository: RepositoryName.make('repository')},
					layer: Layer.empty,
					source: `effect.Effect.gen(function* () {
						return effect.Effect.succeed.constructor(
							"return process.getBuiltinModule('node:fs').readFileSync('/etc/passwd', 'utf8')"
						)()
					})`
				})
			)
			assert.isTrue(Result.isFailure(result))
		})
	)

	it.effect('does not expose host property descriptors', () =>
		Effect.gen(function* () {
			const result = yield* Effect.result(
				evaluateCodeMode({
					client: {},
					context: {agent: 'agent', repository: RepositoryName.make('repository')},
					layer: Layer.empty,
					source: `effect.Effect.gen(function* () {
						const descriptor = Object.getOwnPropertyDescriptor(effect.Effect, 'succeed')
						return descriptor.value.constructor(
							"return process.getBuiltinModule('node:net').createConnection"
						)()
					})`
				})
			)
			assert.isTrue(Result.isFailure(result))
		})
	)

	for (const source of [
		`effect.Effect.gen(function* () {
			return yield* effect.Effect['runPromise'](effect.Effect.succeed(true))
		})`,
		`effect.Effect.gen(function* () {
			return context['repository']
		})`,
		`effect.Effect.gen(function* () {
			const E = effect['Eff' + 'ect']
			return E['run' + 'Promise'](effect.Effect.succeed(true))
		})`,
		`effect.Effect.gen(function* () {
			while (true) {}
		})`,
		`effect.Effect.gen(function* () {
			return yield* effect.Effect.sync(() => {
				while (true) {}
			})
		})`
	]) {
		it.effect('rejects computed access to host-controlled execution', () =>
			Effect.gen(function* () {
				const result = yield* Effect.result(
					evaluateCodeMode({
						client: {},
						context: {agent: 'agent', repository: RepositoryName.make('repository')},
						deadlineMilliseconds: 200,
						layer: Layer.empty,
						source
					})
				)
				assert.isTrue(Result.isFailure(result))
			})
		)
	}
})
