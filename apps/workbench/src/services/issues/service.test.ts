import {NodeServices} from '@effect/platform-node'
import {assert, describe, it} from '@effect/vitest'

import {Effect, FileSystem, Path, SubscriptionRef} from 'effect'

import {AgentId} from './schema.ts'
import {Issues} from './service.ts'

describe('Issues', () => {
	it.effect('creates identity without creating Git mechanics and appends distinct plan iterations', () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const path = yield* Path.Path
			const root = yield* fs.makeTempDirectoryScoped()
			const issues = yield* Issues.make({
				directory: path.join(root, 'issues'),
				historyDirectory: path.join(root, 'history')
			})
			const branch = yield* issues.create({
				agentId: AgentId.make('planning-session'),
				plan: '# Ticket-first Workbench\n\nInitial plan.'
			})

			assert.match(branch, /^ticket-first-workbench-[a-z0-9]{4}$/u)
			assert.strictEqual(yield* fs.exists(path.join(root, 'issues', branch, 'implementation.json')), false)
			assert.strictEqual(yield* issues.save({branch, plan: '# Ticket-first Workbench\n\nInitial plan.'}), false)
			assert.strictEqual(yield* issues.save({branch, plan: '# Ticket-first Workbench\n\nUpdated plan.'}), true)

			const entries = yield* SubscriptionRef.get(issues.entries)
			assert.deepStrictEqual(entries[0]?.issue.planIterations, [
				'# Ticket-first Workbench\n\nInitial plan.',
				'# Ticket-first Workbench\n\nUpdated plan.'
			])
		}).pipe(Effect.provide(NodeServices.layer))
	)

	it.effect('hashes complete bodies and advances implementation only after acceptance', () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const path = yield* Path.Path
			const root = yield* fs.makeTempDirectoryScoped()
			const issues = yield* Issues.make({
				directory: path.join(root, 'issues'),
				historyDirectory: path.join(root, 'history')
			})
			const branch = yield* issues.create({agentId: AgentId.make('planner'), plan: '# Plan\n\nOne'})
			const first = yield* issues.prepareImplementation(branch)
			assert.strictEqual(first.previousHash, undefined)
			assert.match(first.diff, /\+# Plan/u)
			yield* issues.acceptImplementation({agentId: AgentId.make('implementer'), branch, planHash: first.currentHash})
			yield* issues.save({branch, plan: '# Plan\n\nTwo'})
			const second = yield* issues.prepareImplementation(branch)
			assert.strictEqual(second.previousHash, first.currentHash)
			assert.match(second.diff, /-One/u)
			assert.match(second.diff, /\+Two/u)
			yield* issues.archive(branch)
			assert.deepStrictEqual(yield* issues.history(), [{branch, planIterations: ['# Plan\n\nOne', '# Plan\n\nTwo']}])
			assert.deepStrictEqual(yield* SubscriptionRef.get(issues.entries), [])
		}).pipe(Effect.provide(NodeServices.layer))
	)

	it.effect('serializes concurrent plan iterations without losing either body', () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const path = yield* Path.Path
			const root = yield* fs.makeTempDirectoryScoped()
			const issues = yield* Issues.make({
				directory: path.join(root, 'issues'),
				historyDirectory: path.join(root, 'history')
			})
			const branch = yield* issues.create({agentId: AgentId.make('planner'), plan: '# Plan\n\nInitial'})
			yield* Effect.all(
				[
					issues.save({branch, plan: '# Plan\n\nFirst concurrent update'}),
					issues.save({branch, plan: '# Plan\n\nSecond concurrent update'})
				],
				{concurrency: 'unbounded'}
			)
			const entries = yield* SubscriptionRef.get(issues.entries)
			assert.sameMembers(
				[...(entries[0]?.issue.planIterations ?? [])],
				['# Plan\n\nInitial', '# Plan\n\nFirst concurrent update', '# Plan\n\nSecond concurrent update']
			)
		}).pipe(Effect.provide(NodeServices.layer))
	)
})
