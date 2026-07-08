import {join} from 'node:path'

import {NodeFileSystem} from '@effect/platform-node'
import {describe, expect, test} from '@effect/vitest'

import {Effect, FileSystem} from 'effect'

import {loadClaudeUsageTokens} from './claude.ts'
import {loadCodexUsageTokens} from './codex.ts'

function runWithFileSystem<Value, Error>(effect: Effect.Effect<Value, Error, FileSystem.FileSystem>) {
	// oxlint-disable-next-line @deslop/oxlint-rules/no-effect-run-entrypoint -- test boundary
	return Effect.runPromise(Effect.provide(effect, NodeFileSystem.layer))
}

describe('usage token loaders', () => {
	test('loads Codex tokens from bounded session roots without double-counting repeated snapshots', async () => {
		const tokens = await runWithFileSystem(
			Effect.scoped(
				Effect.gen(function* () {
					const fs = yield* FileSystem.FileSystem
					const root = yield* fs.makeTempDirectoryScoped()
					const sessionRoot = join(root, 'sessions', 'session')
					const archivedRoot = join(root, 'archived_sessions', 'session')
					yield* fs.makeDirectory(sessionRoot, {recursive: true})
					yield* fs.makeDirectory(archivedRoot, {recursive: true})
					yield* fs.writeFileString(
						join(sessionRoot, 'one.jsonl'),
						'{"payload":{"info":{"last_token_usage":{"cached_input_tokens":5,"input_tokens":10,"output_tokens":3},"total_token_usage":{"cached_input_tokens":5,"input_tokens":10,"output_tokens":3}}}}\n{"payload":{"info":{"last_token_usage":{"cached_input_tokens":5,"input_tokens":10,"output_tokens":3},"total_token_usage":{"cached_input_tokens":5,"input_tokens":10,"output_tokens":3}}}}\n{"payload":{"info":{"last_token_usage":{"cached_input_tokens":1,"input_tokens":4,"output_tokens":2},"total_token_usage":{"cached_input_tokens":6,"input_tokens":14,"output_tokens":5}}}}'
					)
					yield* fs.writeFileString(
						join(archivedRoot, 'two.jsonl'),
						'{"payload":{"usage":{"cached_input_tokens":2,"input_tokens":7,"output_tokens":1}}}\n{"payload":{"usage":{"cached_input_tokens":2,"input_tokens":7,"output_tokens":1}}}'
					)

					return yield* loadCodexUsageTokens({codexRoot: root})
				})
			)
		)

		expect(tokens).toEqual({cached: 8, input: 21, output: 6})
	})

	test('counts Claude cache creation tokens as cached input', async () => {
		const tokens = await runWithFileSystem(
			Effect.scoped(
				Effect.gen(function* () {
					const fs = yield* FileSystem.FileSystem
					const projectsRoot = yield* fs.makeTempDirectoryScoped()
					yield* fs.writeFileString(
						join(projectsRoot, 'usage.jsonl'),
						'{"message":{"usage":{"cache_creation_input_tokens":13,"cache_read_input_tokens":2,"input_tokens":5,"output_tokens":3}}}'
					)

					return yield* loadClaudeUsageTokens({projectsRoot})
				})
			)
		)

		expect(tokens).toEqual({cached: 15, input: 5, output: 3})
	})
})
