import {
	Array,
	Context,
	Effect,
	Equal,
	FileSystem,
	Layer,
	Option,
	Path,
	Predicate,
	Redacted,
	Result,
	Schedule,
	Schema,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import {
	GitConflictError,
	GitError,
	GitFileChange,
	GitHubError,
	PullRequest,
	SourceRepository,
	SourceRepositoryError
} from './schema.ts'

export declare namespace Git {
	export type Config = {readonly path: string; readonly remote: URL; readonly token: Redacted.Redacted}
}

export declare namespace GitHub {
	export type Config = {readonly path: string; readonly token: Redacted.Redacted}
}

export declare namespace SourceRepositories {
	export type Config = {readonly directory: string}
}

type CommandFailure = {readonly exitCode: number; readonly stderr: string; readonly stdout: string}

const GitHubPullRequest = Schema.Struct({
	base: Schema.Struct({ref: Schema.String}),
	draft: Schema.Boolean,
	head: Schema.Struct({ref: Schema.String, repo: Schema.NullOr(Schema.Struct({full_name: Schema.String}))}),
	html_url: Schema.URLFromString,
	merged_at: Schema.NullOr(Schema.String),
	number: Schema.Finite,
	state: Schema.Literals(['open', 'closed'] as const),
	title: Schema.String
})

function commandError(program: string, args: readonly string[], failure: CommandFailure) {
	return `${program} ${Array.join(' ')(args)} exited with ${failure.exitCode}: ${failure.stderr || failure.stdout}`
}

const makeCommand = Effect.fnUntraced(function* () {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

	return Effect.fnUntraced(function* (
		program: string,
		args: readonly string[],
		options: {
			readonly cwd: string
			readonly env?: Readonly<Record<string, string>>
			readonly expected?: readonly number[]
		}
	) {
		const child = yield* pipe(
			spawner.spawn(
				ChildProcess.make(program, args, {
					cwd: options.cwd,
					env: options.env,
					extendEnv: true,
					stderr: 'pipe',
					stdout: 'pipe'
				})
			),
			Effect.mapError(cause => ({exitCode: -1, stderr: cause.message, stdout: ''}) satisfies CommandFailure)
		)
		const output = yield* pipe(
			Effect.all(
				{
					exitCode: child.exitCode,
					stderr: pipe(child.stderr, Stream.decodeText, Stream.mkString),
					stdout: pipe(child.stdout, Stream.decodeText, Stream.mkString)
				},
				{concurrency: 'unbounded'}
			),
			Effect.mapError(cause => ({exitCode: -1, stderr: cause.message, stdout: ''}) satisfies CommandFailure)
		)
		const exitCode = Number(output.exitCode)
		if (!(options.expected ?? [0]).includes(exitCode)) {
			return yield* Effect.fail({exitCode, stderr: output.stderr, stdout: output.stdout} satisfies CommandFailure)
		}
		return output.stdout
	})
})

function statusFromCode(code: string) {
	if (code === 'A' || code === '??') return 'added' as const
	if (code === 'D') return 'deleted' as const
	if (code.startsWith('R')) return 'renamed' as const
	return 'modified' as const
}

function parseNameStatus(output: string) {
	const fields = String.split('\u0000')(output)
	const changes: (typeof GitFileChange.Type)[] = []
	let index = 0
	while (index < fields.length) {
		const code = fields[index]
		if (Predicate.isUndefined(code) || code === '') break
		const path = fields[index + 1]
		if (Predicate.isUndefined(path)) break
		if (code.startsWith('R')) {
			const renamedPath = fields[index + 2]
			if (Predicate.isUndefined(renamedPath)) break
			changes.push({path: renamedPath, previousPath: path, status: 'renamed'})
			index += 3
		} else {
			changes.push({path, status: statusFromCode(code)})
			index += 2
		}
	}
	return changes
}

function excludedPath(path: string) {
	const parts = String.split('/')(path)
	const name = parts[parts.length - 1] ?? ''
	return (
		name === 'pnpm-lock.yaml' ||
		String.endsWith('.gen.ts')(name) ||
		parts.some((part, index) => part === 'components' && ['ui', 'svgs'].includes(parts[index + 1] ?? ''))
	)
}

export function filterDiff(input: {
	readonly files: readonly (typeof GitFileChange.Type)[]
	readonly includeStatuses?: readonly (typeof GitFileChange.Type.status)[]
}) {
	return pipe(
		input.files,
		Array.filter(file => !excludedPath(file.path)),
		Array.filter(file => Predicate.isUndefined(input.includeStatuses) || input.includeStatuses.includes(file.status))
	)
}

export class Git extends Context.Service<Git>()('@deslop/git/service/Git', {
	make: Effect.fnUntraced(function* (config: Git.Config) {
		const fs = yield* FileSystem.FileSystem
		const run = yield* makeCommand()

		const git = Effect.fnUntraced(function* (args: readonly string[], expected?: readonly number[]) {
			return yield* pipe(
				run('git', args, {cwd: config.path, expected}),
				Effect.mapError(failure => GitError.make({cause: failure, message: commandError('git', args, failure)}))
			)
		})
		const snapshot = Effect.fnUntraced(function* () {
			const [branch, porcelain] = yield* Effect.all([
				pipe(
					git(['symbolic-ref', '--quiet', '--short', 'HEAD'], [0, 1]),
					Effect.map(String.trim),
					Effect.map(value => (value === '' ? undefined : value))
				),
				git(['status', '--porcelain'])
			])
			return {branch, dirty: porcelain !== ''}
		})
		const status = yield* SubscriptionRef.make(yield* snapshot())
		const invalidate = Effect.gen(function* () {
			const value = yield* snapshot()
			if (!Equal.equals(value, yield* SubscriptionRef.get(status))) yield* SubscriptionRef.set(status, value)
		})
		yield* pipe(
			fs.watch(config.path),
			Stream.runForEach(() => pipe(invalidate, Effect.ignore)),
			Effect.ignore,
			Effect.repeat(Schedule.spaced('1 second')),
			Effect.forkScoped
		)

		const patchFor = Effect.fnUntraced(function* (base: string | undefined, file: typeof GitFileChange.Type) {
			const args = Predicate.isUndefined(base)
				? ['diff', '--binary', 'HEAD', '--', file.path]
				: ['diff', '--binary', base, '--', file.path]
			const patch = yield* git(args, [0, 1])
			if (patch !== '') return patch
			if (file.status !== 'added') return
			const untracked = yield* git(['diff', '--binary', '--no-index', '--', '/dev/null', file.path], [0, 1])
			return untracked === '' ? undefined : untracked
		})

		return {
			commit: Effect.fn('Git.commit')(function* (input: {readonly message: string}) {
				yield* git(['add', '--all'])
				yield* git(['commit', '--message', input.message])
				const hash = pipe(yield* git(['rev-parse', 'HEAD']), String.trim)
				yield* invalidate
				return hash
			}),
			diff: Effect.fn('Git.diff')(function* (input: {readonly base?: string}) {
				const base = Predicate.isUndefined(input.base)
					? undefined
					: pipe(yield* git(['merge-base', 'HEAD', input.base]), String.trim)
				const nameStatus = yield* git(
					Predicate.isUndefined(base) ? ['diff', '--name-status', '-z', 'HEAD'] : ['diff', '--name-status', '-z', base]
				)
				const tracked = parseNameStatus(nameStatus)
				const untracked = pipe(
					yield* git(['ls-files', '--others', '--exclude-standard', '-z']),
					String.split('\u0000'),
					Array.filter(String.isNonEmpty),
					Array.map(path => GitFileChange.make({path, status: 'added'}))
				)
				return yield* Effect.forEach(
					pipe(tracked, Array.appendAll(untracked)),
					Effect.fnUntraced(function* (file) {
						const patch = yield* patchFor(base, file)
						return GitFileChange.make({...file, patch})
					}),
					{concurrency: 8}
				)
			}),
			merge: Effect.fn('Git.merge')(function* (input: {readonly branch: string}) {
				const result = yield* Effect.result(git(['merge', '--no-edit', input.branch]))
				if (Result.isSuccess(result)) {
					yield* invalidate
					return
				}
				const paths = pipe(
					yield* git(['diff', '--name-only', '--diff-filter=U']),
					String.split(/\r?\n/u),
					Array.filter(String.isNonEmpty)
				)
				if (!Array.isReadonlyArrayEmpty(paths)) return yield* GitConflictError.make({paths})
				return yield* result.failure
			}),
			push: Effect.gen(function* () {
				const args = [
					'-c',
					'credential.helper=',
					'-c',
					'credential.helper=!gh auth git-credential',
					'push',
					'--set-upstream',
					config.remote.toString(),
					'HEAD'
				]
				yield* pipe(
					run('git', args, {cwd: config.path, env: {GH_PROMPT_DISABLED: '1', GH_TOKEN: Redacted.value(config.token)}}),
					Effect.mapError(failure => GitError.make({cause: failure, message: commandError('git', args, failure)}))
				)
				yield* invalidate
			}).pipe(Effect.withSpan('Git.push')),
			status
		}
	})
}) {
	public static layer = (config: Git.Config) => Layer.effect(this, this.make(config))
}

function decodePullRequest(value: typeof GitHubPullRequest.Type) {
	return PullRequest.make({
		base: value.base.ref,
		draft: value.draft,
		head: value.head.ref,
		number: value.number,
		state: Predicate.isNotNull(value.merged_at) ? 'merged' : value.state,
		title: value.title,
		url: value.html_url
	})
}

function preservePullRequestMetadata(body: string, existing: string) {
	const parent = /^Parent: #[0-9]+$/mu.exec(existing)?.[0]
	const references = /### References\s*\n[\s\S]*?(?=\n## |\n### (?!References)|$)/mu.exec(existing)?.[0]
	let merged = body
	if (Predicate.isNotUndefined(references) && String.includes('## UI')(merged)) {
		const apiIndex = merged.indexOf('\n\n## API')
		merged =
			apiIndex < 0
				? `${merged}\n\n${references}`
				: `${String.slice(0, apiIndex)(merged)}\n\n${references}${String.slice(apiIndex)(merged)}`
	}
	return Predicate.isUndefined(parent) ? merged : `${parent}\n\n${merged}`
}

export class GitHub extends Context.Service<GitHub>()('@deslop/git/service/GitHub', {
	make: Effect.fnUntraced(function* (config: GitHub.Config) {
		const run = yield* makeCommand()
		const gh = Effect.fnUntraced(function* (args: readonly string[]) {
			return yield* pipe(
				run('gh', args, {cwd: config.path, env: {GH_PROMPT_DISABLED: '1', GH_TOKEN: Redacted.value(config.token)}}),
				Effect.mapError(failure => GitHubError.make({cause: failure, message: commandError('gh', args, failure)}))
			)
		})
		const repositoryOwner = String.trim(
			yield* gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
		)
		const list = Effect.fnUntraced(function* () {
			const output = yield* gh([
				'api',
				'--paginate',
				'--slurp',
				'--method',
				'GET',
				'-f',
				'state=all',
				'-f',
				'per_page=100',
				'repos/{owner}/{repo}/pulls'
			])
			return yield* pipe(
				Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Schema.Array(GitHubPullRequest))))(output),
				Effect.map(Array.flatten),
				Effect.map(
					Array.filter(value => Predicate.isNull(value.head.repo) || value.head.repo.full_name === repositoryOwner)
				),
				Effect.map(Array.map(decodePullRequest)),
				Effect.mapError(cause => GitHubError.make({cause, message: 'GitHub returned invalid pull request data'}))
			)
		})
		const pullRequests = yield* SubscriptionRef.make(yield* list())
		const invalidate = Effect.gen(function* () {
			const value = yield* list()
			if (!Equal.equals(value, yield* SubscriptionRef.get(pullRequests))) {
				yield* SubscriptionRef.set(pullRequests, value)
			}
		})
		yield* pipe(invalidate, Effect.ignore, Effect.repeat(Schedule.spaced('1 minute')), Effect.forkScoped)

		return {
			publishDraft: Effect.fn('GitHub.publishDraft')(function* (input: {
				readonly base: string
				readonly body: string
				readonly branch: string
				readonly title: string
			}) {
				const existing = Array.findFirst(yield* SubscriptionRef.get(pullRequests), value => value.head === input.branch)
				const url = yield* Option.match(existing, {
					onNone: () =>
						pipe(
							gh([
								'pr',
								'create',
								'--draft',
								'--head',
								input.branch,
								'--base',
								input.base,
								'--title',
								input.title,
								'--body',
								input.body
							]),
							Effect.map(String.trim)
						),
					onSome: existingPullRequest =>
						Effect.gen(function* () {
							const existingBody = yield* gh([
								'pr',
								'view',
								`${existingPullRequest.number}`,
								'--json',
								'body',
								'--jq',
								'.body'
							])
							yield* gh([
								'pr',
								'edit',
								`${existingPullRequest.number}`,
								'--title',
								input.title,
								'--body',
								preservePullRequestMetadata(input.body, existingBody)
							])
							return existingPullRequest.url.toString()
						})
				})
				yield* invalidate
				const refreshed = Array.findFirst(
					yield* SubscriptionRef.get(pullRequests),
					value => value.url.toString() === url || value.head === input.branch
				)
				return yield* Option.match(refreshed, {
					onNone: () => GitHubError.make({message: 'draft pull request was not returned by GitHub'}),
					onSome: Effect.succeed
				})
			}),
			pullRequests
		}
	})
}) {
	public static layer = (config: GitHub.Config) => Layer.effect(this, this.make(config))
}

function repositoryName(url: URL) {
	return pipe(
		url.pathname,
		String.replace(/\/$/u, ''),
		String.split('/'),
		Array.last,
		Option.getOrElse(() => ''),
		String.replace(/\.git$/u, '')
	)
}

export class SourceRepositories extends Context.Service<SourceRepositories>()(
	'@deslop/git/service/SourceRepositories',
	{
		make: Effect.fnUntraced(function* (config: SourceRepositories.Config) {
			const fs = yield* FileSystem.FileSystem
			const path = yield* Path.Path
			const run = yield* makeCommand()
			yield* fs.makeDirectory(config.directory, {recursive: true})

			const scan = Effect.fnUntraced(function* () {
				const entries = yield* fs.readDirectory(config.directory)
				return yield* Effect.forEach(
					entries,
					Effect.fnUntraced(function* (name) {
						const repositoryPath = path.join(config.directory, name)
						const remote = yield* pipe(
							run('git', ['remote', 'get-url', 'origin'], {cwd: repositoryPath}),
							Effect.map(String.trim),
							Effect.map(URL.parse),
							Effect.map(Option.fromNullishOr),
							Effect.orElseSucceed(Option.none)
						)
						return Option.map(remote, url => SourceRepository.make({name, path: repositoryPath, url}))
					}),
					{concurrency: 8}
				).pipe(Effect.map(Array.getSomes))
			})
			const repositories = yield* SubscriptionRef.make(yield* scan())
			function find(name: string) {
				return pipe(
					SubscriptionRef.get(repositories),
					Effect.flatMap(current =>
						Option.match(
							Array.findFirst(current, repository => repository.name === name),
							{
								onNone: () => SourceRepositoryError.make({message: `unknown source repository ${name}`}),
								onSome: Effect.succeed
							}
						)
					)
				)
			}

			return {
				add: Effect.fn('SourceRepositories.add')(function* (input: {readonly url: URL}) {
					const name = repositoryName(input.url)
					if (name === '') return yield* SourceRepositoryError.make({message: 'source repository URL has no name'})
					const destination = path.join(config.directory, name)
					yield* pipe(
						run('git', ['clone', '--filter=blob:none', input.url.toString(), destination], {cwd: config.directory}),
						Effect.mapError(failure =>
							SourceRepositoryError.make({cause: failure, message: commandError('git', ['clone'], failure)})
						)
					)
					yield* pipe(
						scan(),
						Effect.flatMap(value => SubscriptionRef.set(repositories, value))
					)
					return yield* find(name)
				}),
				repositories,
				synchronize: Effect.fn('SourceRepositories.synchronize')(function* (input: {readonly name: string}) {
					const repository = yield* find(input.name)
					yield* pipe(
						run('git', ['fetch', '--prune'], {cwd: repository.path}),
						Effect.mapError(failure =>
							SourceRepositoryError.make({cause: failure, message: commandError('git', ['fetch'], failure)})
						)
					)
					const defaultBranch = yield* pipe(
						run('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {cwd: repository.path}),
						Effect.map(String.trim),
						Effect.mapError(failure =>
							SourceRepositoryError.make({
								cause: failure,
								message: commandError('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], failure)
							})
						)
					)
					yield* pipe(
						run('git', ['checkout', '--detach', '--force', defaultBranch], {cwd: repository.path}),
						Effect.mapError(failure =>
							SourceRepositoryError.make({
								cause: failure,
								message: commandError('git', ['checkout', '--detach', '--force', defaultBranch], failure)
							})
						)
					)
					yield* pipe(
						scan(),
						Effect.flatMap(value => SubscriptionRef.set(repositories, value))
					)
					return yield* find(input.name)
				})
			}
		})
	}
) {
	public static layer = (config: SourceRepositories.Config) => Layer.effect(this, this.make(config))
}
