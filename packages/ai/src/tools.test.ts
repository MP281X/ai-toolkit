import {NodeServices} from '@effect/platform-node'
import {expect, it} from '@effect/vitest'

import {Effect, Exit, FileSystem, Layer, Option, Schema, Stream, pipe} from 'effect'

import {
	Bash,
	Edit,
	Find,
	Grep,
	Ls,
	PiToolkit,
	Read,
	Replacement,
	ToolFailure,
	Write,
	handlers,
	type Replacement as ReplacementValue,
	type ToolFailure as ToolFailureValue
} from './tools.ts'

it.layer(NodeServices.layer)('Pi tools', test => {
	test.effect('execute the normalized filesystem and process tools', () =>
		Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem
			const cwd = yield* fs.makeTempDirectoryScoped({prefix: 'deslop-ai-'})
			const replacement: ReplacementValue = {newText: 'second', oldText: 'first'}
			const failure: ToolFailureValue = 'failure'
			const failureSchema: Schema.Schema<ToolFailureValue> = ToolFailure
			const handlerContext = yield* Layer.build(PiToolkit.toLayer(handlers(cwd)))
			const toolkit = yield* pipe(PiToolkit, Effect.provide(handlerContext))

			expect(Schema.is(failureSchema)(failure)).toBe(true)
			expect(Replacement.make(replacement)).toEqual(replacement)
			expect([Read.name, Write.name, Edit.name, Bash.name, Grep.name, Find.name, Ls.name]).toEqual([
				'read',
				'write',
				'edit',
				'bash',
				'grep',
				'find',
				'ls'
			])

			yield* pipe(
				toolkit.handle('write', {content: 'first\nneedle', path: 'notes/a.txt'}),
				Effect.flatMap(Stream.runDrain),
				Effect.exit
			)
			yield* pipe(
				toolkit.handle('edit', {edits: [replacement], path: 'notes/a.txt'}),
				Effect.flatMap(Stream.runDrain),
				Effect.exit
			)

			const read = yield* pipe(
				toolkit.handle('read', {path: 'notes/a.txt'}),
				Effect.flatMap(Stream.runLast),
				Effect.map(Option.map(result => result.result)),
				Effect.exit
			)
			const grep = yield* pipe(
				toolkit.handle('grep', {path: '.', pattern: 'needle'}),
				Effect.flatMap(Stream.runLast),
				Effect.map(Option.map(result => result.result)),
				Effect.exit
			)
			const find = yield* pipe(
				toolkit.handle('find', {path: '.', pattern: '**/*.txt'}),
				Effect.flatMap(Stream.runLast),
				Effect.map(Option.map(result => result.result)),
				Effect.exit
			)
			const ls = yield* pipe(
				toolkit.handle('ls', {path: '.'}),
				Effect.flatMap(Stream.runLast),
				Effect.map(Option.map(result => result.result)),
				Effect.exit
			)
			const bash = yield* pipe(
				toolkit.handle('bash', {command: 'pwd'}),
				Effect.flatMap(Stream.runLast),
				Effect.map(Option.map(result => result.result)),
				Effect.exit
			)

			expect(pipe(read, Exit.getSuccess, Option.flatten, Option.getOrThrow)).toBe('second\nneedle')
			expect(pipe(grep, Exit.getSuccess, Option.flatten, Option.getOrThrow)).toContain('notes/a.txt:2:needle')
			expect(pipe(find, Exit.getSuccess, Option.flatten, Option.getOrThrow)).toBe('notes/a.txt')
			expect(pipe(ls, Exit.getSuccess, Option.flatten, Option.getOrThrow)).toBe('notes/')
			expect(pipe(bash, Exit.getSuccess, Option.flatten, Option.getOrThrow)).toContain(cwd)
		})
	)
})
