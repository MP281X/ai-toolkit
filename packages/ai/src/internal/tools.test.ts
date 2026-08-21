import {NodeServices} from '@effect/platform-node'
import {expect, it} from '@effect/vitest'

import {
	Array,
	Effect,
	FileSystem,
	HashMap,
	HashSet,
	Layer,
	Option,
	Path,
	Ref,
	Result,
	Stream,
	String,
	pipe
} from 'effect'

import {PiToolkit} from '#schema'

import {handlers} from './tools.ts'

function info(type: FileSystem.File.Type, size = 0): FileSystem.File.Info {
	return {
		atime: Option.none(),
		birthtime: Option.none(),
		blksize: Option.none(),
		blocks: Option.none(),
		dev: 0,
		gid: Option.none(),
		ino: Option.none(),
		mode: 0,
		mtime: Option.none(),
		nlink: Option.none(),
		rdev: Option.none(),
		size: FileSystem.Size(size),
		type,
		uid: Option.none()
	}
}

const makeFileSystem = Effect.fnUntraced(function* () {
	const files = yield* Ref.make(HashMap.empty<string, string>())
	return FileSystem.makeNoop({
		glob: (pattern, options) =>
			pipe(
				Ref.get(files),
				Effect.map(HashMap.keys),
				Effect.map(Array.fromIterable),
				Effect.map(
					Array.filterMap(file => {
						const root = options?.root ?? '.'
						const prefix = `${root}/`
						if (!String.startsWith(prefix)(file)) return Result.failVoid
						if (pattern === '**/*.txt' && !String.endsWith('.txt')(file)) return Result.failVoid
						return Result.succeed(String.slice(String.length(prefix))(file))
					})
				)
			),
		makeDirectory: () => Effect.void,
		readDirectory: directory =>
			pipe(
				Ref.get(files),
				Effect.map(HashMap.keys),
				Effect.map(Array.fromIterable),
				Effect.map(
					Array.filterMap(file => {
						const prefix = `${directory}/`
						if (!String.startsWith(prefix)(file)) return Result.failVoid
						return pipe(
							String.slice(String.length(prefix))(file),
							String.split('/'),
							Array.head,
							Result.fromOption(() => undefined)
						)
					})
				),
				Effect.map(HashSet.fromIterable),
				Effect.map(Array.fromIterable)
			),
		readFileString: path => pipe(Ref.get(files), Effect.map(HashMap.get(path)), Effect.map(Option.getOrThrow)),
		stat: path =>
			pipe(
				Ref.get(files),
				Effect.map(entries =>
					pipe(
						HashMap.get(entries, path),
						Option.match({onNone: () => info('Directory'), onSome: content => info('File', String.length(content))})
					)
				)
			),
		writeFileString: (path, content) => Ref.update(files, HashMap.set(path, content))
	})
})

it.layer(NodeServices.layer)('Pi tools', test => {
	test.effect(
		'execute the normalized filesystem and process tools',
		Effect.fnUntraced(function* () {
			const path = yield* Path.Path
			const cwd = path.resolve('.')
			const fileSystem = yield* makeFileSystem()
			const replacement = {newText: 'second', oldText: 'first'}
			const handlerContext = yield* Layer.build(
				PiToolkit.toLayer(pipe(handlers(cwd), Effect.provideService(FileSystem.FileSystem, fileSystem)))
			)
			const toolkit = yield* pipe(PiToolkit, Effect.provide(handlerContext))

			yield* pipe(
				toolkit.handle('write', {content: 'first\nneedle', path: 'notes/a.txt'}),
				Effect.flatMap(Stream.runDrain),
				Effect.orDie
			)
			yield* pipe(
				toolkit.handle('edit', {edits: [replacement], path: 'notes/a.txt'}),
				Effect.flatMap(Stream.runDrain),
				Effect.orDie
			)

			const read = yield* pipe(
				toolkit.handle('read', {path: 'notes/a.txt'}),
				Effect.flatMap(Stream.runLast),
				Effect.map(Option.map(result => result.result)),
				Effect.orDie
			)
			const grep = yield* pipe(
				toolkit.handle('grep', {path: '.', pattern: 'needle'}),
				Effect.flatMap(Stream.runLast),
				Effect.map(Option.map(result => result.result)),
				Effect.orDie
			)
			const find = yield* pipe(
				toolkit.handle('find', {path: '.', pattern: '**/*.txt'}),
				Effect.flatMap(Stream.runLast),
				Effect.map(Option.map(result => result.result)),
				Effect.orDie
			)
			const ls = yield* pipe(
				toolkit.handle('ls', {path: '.'}),
				Effect.flatMap(Stream.runLast),
				Effect.map(Option.map(result => result.result)),
				Effect.orDie
			)
			const bash = yield* pipe(
				toolkit.handle('bash', {command: 'pwd'}),
				Effect.flatMap(Stream.runLast),
				Effect.map(Option.map(result => result.result)),
				Effect.orDie
			)

			expect(pipe(read, Option.getOrThrow)).toBe('second\nneedle')
			expect(pipe(grep, Option.getOrThrow)).toContain('notes/a.txt:2:needle')
			expect(pipe(find, Option.getOrThrow)).toBe('notes/a.txt')
			expect(pipe(ls, Option.getOrThrow)).toBe('notes/')
			expect(pipe(bash, Option.getOrThrow)).toContain(cwd)
		})
	)
})
