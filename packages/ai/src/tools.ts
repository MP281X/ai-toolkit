import {Array, Effect, FileSystem, Number, Path, Predicate, Result, Schema, Stream, String, pipe} from 'effect'

import {Tool, Toolkit} from 'effect/unstable/ai'
import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

export type ToolFailure = typeof ToolFailure.Type
export const ToolFailure = Schema.Defect()

class ToolExecutionError extends Schema.TaggedError<ToolExecutionError>()('ToolExecutionError', {
	message: Schema.String
}) {}

export const Read = Tool.make('read', {
	dependencies: [FileSystem.FileSystem, Path.Path],
	description: 'Read a text file. Use offset and limit to read large files in sections.',
	failure: ToolFailure,
	parameters: Schema.Struct({
		limit: Schema.optional(Schema.Finite.annotate({description: 'Maximum number of lines to return'})),
		offset: Schema.optional(Schema.Finite.annotate({description: 'First line to return, starting at 1'})),
		path: Schema.String.annotate({description: 'File path, relative to the configured working directory or absolute'})
	}),
	success: Schema.String
})

export const Write = Tool.make('write', {
	dependencies: [FileSystem.FileSystem, Path.Path],
	description: 'Write a complete text file, creating its parent directories and replacing existing content.',
	failure: ToolFailure,
	parameters: Schema.Struct({
		content: Schema.String.annotate({description: 'Complete file content'}),
		path: Schema.String.annotate({description: 'File path, relative to the configured working directory or absolute'})
	}),
	success: Schema.String
})

export type Replacement = typeof Replacement.Type
export const Replacement = Schema.Struct({
	newText: Schema.String.annotate({description: 'Replacement text'}),
	oldText: Schema.String.annotate({description: 'Exact text that must occur once'})
})

export const Edit = Tool.make('edit', {
	dependencies: [FileSystem.FileSystem, Path.Path],
	description: 'Edit one text file with exact, unique text replacements.',
	failure: ToolFailure,
	parameters: Schema.Struct({
		edits: Schema.Array(Replacement).annotate({description: 'Exact replacements applied in order'}),
		path: Schema.String.annotate({description: 'File path, relative to the configured working directory or absolute'})
	}),
	success: Schema.String
})

export const Bash = Tool.make('bash', {
	dependencies: [ChildProcessSpawner.ChildProcessSpawner],
	description: 'Execute a shell command in the configured working directory and return combined output.',
	failure: ToolFailure,
	parameters: Schema.Struct({
		command: Schema.String.annotate({description: 'Shell command to execute'}),
		timeout: Schema.optional(Schema.Finite.annotate({description: 'Optional timeout in seconds'}))
	}),
	success: Schema.String
})

export const Grep = Tool.make('grep', {
	dependencies: [FileSystem.FileSystem, Path.Path],
	description: 'Search text files and return matching paths, line numbers, and lines.',
	failure: ToolFailure,
	parameters: Schema.Struct({
		glob: Schema.optional(Schema.String.annotate({description: 'File glob, such as **/*.ts'})),
		ignoreCase: Schema.optional(Schema.Boolean.annotate({description: 'Use case-insensitive matching'})),
		limit: Schema.optional(Schema.Finite.annotate({description: 'Maximum number of matches'})),
		literal: Schema.optional(Schema.Boolean.annotate({description: 'Treat pattern as literal text'})),
		path: Schema.optional(Schema.String.annotate({description: 'File or directory to search'})),
		pattern: Schema.String.annotate({description: 'Regular expression or literal search text'})
	}),
	success: Schema.String
})

export const Find = Tool.make('find', {
	dependencies: [FileSystem.FileSystem, Path.Path],
	description: 'Find files using a glob and return paths relative to the search directory.',
	failure: ToolFailure,
	parameters: Schema.Struct({
		limit: Schema.optional(Schema.Finite.annotate({description: 'Maximum number of paths'})),
		path: Schema.optional(Schema.String.annotate({description: 'Directory to search'})),
		pattern: Schema.String.annotate({description: 'File glob, such as **/*.ts'})
	}),
	success: Schema.String
})

export const Ls = Tool.make('ls', {
	dependencies: [FileSystem.FileSystem, Path.Path],
	description: 'List a directory alphabetically, adding a slash to directory names.',
	failure: ToolFailure,
	parameters: Schema.Struct({
		limit: Schema.optional(Schema.Finite.annotate({description: 'Maximum number of entries'})),
		path: Schema.optional(Schema.String.annotate({description: 'Directory to list'}))
	}),
	success: Schema.String
})

export const PiToolkit = Toolkit.make(Read, Write, Edit, Bash, Grep, Find, Ls)

function boundedNatural(fallback: number, value?: number) {
	if (Predicate.isUndefined(value)) return fallback
	return Number.max(0, Number.round(value, 0))
}

function truncateOutput(value: string, maximum = 50_000) {
	if (String.length(value) <= maximum) return value
	return `[truncated ${String.length(value) - maximum} characters]\n${String.slice(String.length(value) - maximum)(value)}`
}

export function handlers(cwd: string) {
	return PiToolkit.of({
		bash: ({command, timeout}) =>
			Effect.gen(function* () {
				const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
				const execute = Effect.scoped(
					Effect.gen(function* () {
						const process = yield* spawner.spawn(ChildProcess.make('sh', ['-lc', command], {cwd}))
						const [output, exitCode] = yield* Effect.all(
							[pipe(process.all, Stream.decodeText(), Stream.mkString), process.exitCode],
							{concurrency: 'unbounded'}
						)
						if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
							return yield* ToolExecutionError.make({
								message: `command exited with ${exitCode}:\n${truncateOutput(output)}`
							})
						}
						return truncateOutput(output)
					})
				)
				return yield* Predicate.isUndefined(timeout) ? execute : Effect.timeout(execute, `${timeout} seconds`)
			}),
		edit: ({edits, path: inputPath}) =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem
				const path = yield* Path.Path
				const target = path.resolve(cwd, inputPath)
				let content = yield* fs.readFileString(target)
				for (const replacement of edits) {
					const occurrences = String.split(replacement.oldText)(content)
					if (Array.length(occurrences) !== 2) {
						return yield* ToolExecutionError.make({
							message: `oldText must occur exactly once, found ${Array.length(occurrences) - 1}`
						})
					}
					content = `${occurrences[0]}${replacement.newText}${occurrences[1]}`
				}
				yield* fs.writeFileString(target, content)
				return `Edited ${inputPath}`
			}),
		find: ({limit, path: inputPath, pattern}) =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem
				const path = yield* Path.Path
				const root = path.resolve(cwd, inputPath ?? '.')
				const matches = yield* fs.glob(pattern, {root})
				return pipe(
					matches,
					Array.map(match => path.relative(root, path.resolve(root, match))),
					Array.sort(String.Order),
					Array.take(boundedNatural(1_000, limit)),
					Array.join('\n')
				)
			}),
		grep: ({glob, ignoreCase, limit, literal, path: inputPath, pattern}) =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem
				const path = yield* Path.Path
				const target = path.resolve(cwd, inputPath ?? '.')
				const info = yield* fs.stat(target)
				const files =
					info.type === 'File'
						? [target]
						: pipe(
								yield* fs.glob(glob ?? '**/*', {root: target}),
								Array.map(file => path.resolve(target, file))
							)
				const matcher =
					literal === true
						? (line: string) =>
								ignoreCase === true
									? String.includes(String.toLowerCase(pattern))(String.toLowerCase(line))
									: String.includes(pattern)(line)
						: (line: string) => new RegExp(pattern, ignoreCase === true ? 'i' : undefined).test(line)
				const maximum = boundedNatural(100, limit)
				const groups = yield* Effect.forEach(
					files,
					file =>
						pipe(
							fs.readFileString(file),
							Effect.map(content =>
								pipe(
									String.split('\n')(content),
									Array.filterMap((line, index) =>
										matcher(line)
											? Result.succeed(`${path.relative(target, file)}:${index + 1}:${line}`)
											: Result.failVoid
									)
								)
							),
							Effect.orElseSucceed(() => Array.empty<string>())
						),
					{concurrency: 8}
				)
				return pipe(groups, Array.flatten, Array.take(maximum), Array.join('\n'))
			}),
		ls: ({limit, path: inputPath}) =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem
				const path = yield* Path.Path
				const target = path.resolve(cwd, inputPath ?? '.')
				const names = pipe(
					yield* fs.readDirectory(target),
					Array.sort(String.Order),
					Array.take(boundedNatural(500, limit))
				)
				const entries = yield* Effect.forEach(names, name =>
					pipe(
						fs.stat(path.join(target, name)),
						Effect.map(info => (info.type === 'Directory' ? `${name}/` : name))
					)
				)
				return Array.join('\n')(entries)
			}),
		read: ({limit, offset, path: inputPath}) =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem
				const path = yield* Path.Path
				const content = yield* fs.readFileString(path.resolve(cwd, inputPath))
				return pipe(
					String.split('\n')(content),
					Array.drop(Number.max(0, boundedNatural(1, offset) - 1)),
					Array.take(boundedNatural(2_000, limit)),
					Array.join('\n'),
					truncateOutput
				)
			}),
		write: ({content, path: inputPath}) =>
			Effect.gen(function* () {
				const fs = yield* FileSystem.FileSystem
				const path = yield* Path.Path
				const target = path.resolve(cwd, inputPath)
				yield* fs.makeDirectory(path.dirname(target), {recursive: true})
				yield* fs.writeFileString(target, content)
				return `Wrote ${inputPath}`
			})
	})
}
