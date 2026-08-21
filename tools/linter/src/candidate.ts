import {Array, Effect, FileSystem, HashSet, Option, Path, Schema, Stream, String, pipe} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

type Mode = typeof Mode.Type
const Mode = Schema.Literals(['all', 'branch', 'default', 'uncommitted'])
type SourceExtension = typeof SourceExtension.Type
const SourceExtension = Schema.Literals(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])

class ArgumentError extends Schema.TaggedError<ArgumentError>()('ArgumentError', {message: Schema.String}) {}
class GitError extends Schema.TaggedError<GitError>()('GitError', {message: Schema.String}) {}

const ignoredPaths = [
	'/.git/',
	'/node_modules/',
	'/dist/',
	'/.output/',
	'/tools/create-app/template/',
	'/tools/create-package/template/',
	'/packages/components/src/components/svgs/',
	'/packages/components/src/components/ui/'
]

function isSource(path: string, pathService: Path.Path) {
	return (
		Schema.is(SourceExtension)(pathService.extname(path)) &&
		!Array.some(ignoredPaths, ignored => String.includes(ignored)(path)) &&
		!String.endsWith('.gen.ts')(path)
	)
}

function fields(output: string) {
	return pipe(output, String.split('\0'), Array.filter(String.isNonEmpty))
}

function pathsFromNameStatus(output: string) {
	const values = fields(output)
	function loop(index: number, paths: string[]): string[] {
		return pipe(
			Array.get(values, index),
			Option.match({
				onNone: () => paths,
				onSome: status => {
					const rename = /^[RC]/u.test(status)
					const candidate = Array.get(values, index + (rename ? 2 : 1))
					const next = String.startsWith('D')(status)
						? paths
						: pipe(candidate, Option.match({onNone: () => paths, onSome: path => Array.append(paths, path)}))
					return loop(index + (rename ? 3 : 2), next)
				}
			})
		)
	}
	return loop(0, [])
}

const runGit = Effect.fnUntraced(function* (cwd: string, arguments_: string[]) {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
	const handle = yield* spawner.spawn(ChildProcess.make('git', arguments_, {cwd, stderr: 'pipe', stdout: 'pipe'}))
	const result = yield* Effect.all(
		{
			exitCode: handle.exitCode,
			stderr: Stream.mkString(Stream.decodeText(handle.stderr)),
			stdout: Stream.mkString(Stream.decodeText(handle.stdout))
		},
		{concurrency: 'unbounded'}
	)
	if (result.exitCode !== ChildProcessSpawner.ExitCode(0)) return yield* GitError.make({message: result.stderr})
	return result.stdout
})

export function parseMode(arguments_: string[]) {
	if (arguments_.length === 0) return Effect.succeed<Mode>('default')
	if (arguments_.length !== 1) return Effect.fail(ArgumentError.make({message: 'Use at most one mode flag.'}))
	const value = pipe(arguments_[0] ?? '', String.replace(/^--/u, ''))
	return pipe(
		Schema.decodeUnknownEffect(Mode)(value),
		Effect.mapError(() => ArgumentError.make({message: 'Use --all, --branch, or --uncommitted.'}))
	)
}

export const candidatePaths = Effect.fnUntraced(function* (input: {
	cwd: string
	mode: Mode
	runGit?: (arguments_: string[]) => Effect.Effect<string>
}) {
	const fs = yield* FileSystem.FileSystem
	const path = yield* Path.Path
	const git = input.runGit ?? (arguments_ => runGit(input.cwd, arguments_))
	let paths: string[] = []
	if (input.mode === 'all') {
		paths = yield* fs.glob('**/*', {
			exclude: ['**/.git/**', '**/node_modules/**', '**/dist/**', '**/.output/**'],
			root: input.cwd
		})
	}
	if (input.mode === 'branch' || input.mode === 'default') {
		const remote = pipe(yield* git(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']), String.trim)
		const base = pipe(yield* git(['merge-base', 'HEAD', remote]), String.trim)
		paths = Array.appendAll(paths, pathsFromNameStatus(yield* git(['diff', '--name-status', '-z', `${base}...HEAD`])))
	}
	if (input.mode === 'uncommitted' || input.mode === 'default') {
		paths = Array.appendAll(paths, pathsFromNameStatus(yield* git(['diff', '--name-status', '-z'])))
		paths = Array.appendAll(paths, pathsFromNameStatus(yield* git(['diff', '--cached', '--name-status', '-z'])))
		paths = Array.appendAll(paths, fields(yield* git(['ls-files', '--others', '--exclude-standard', '-z'])))
	}
	return pipe(
		paths,
		Array.map(file => (path.isAbsolute(file) ? file : path.resolve(input.cwd, file))),
		Array.filter(file => isSource(file, path)),
		HashSet.fromIterable,
		Array.fromIterable
	)
})
