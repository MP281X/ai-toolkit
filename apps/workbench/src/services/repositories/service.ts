import {
	Array,
	Context,
	Effect,
	FileSystem,
	Layer,
	Option,
	Path,
	Predicate,
	Result,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import {ChildProcess, ChildProcessSpawner} from 'effect/unstable/process'

import {Repository, RepositoryError, RepositoryName} from './schema.ts'

import type {AgentId, BranchName} from '#services/issues/schema.ts'

type RepositoriesConfig = {readonly directory: string; readonly token: Effect.Effect<string, RepositoryError>}

function repositoryName(url: URL) {
	return pipe(
		url.pathname,
		String.replace(/^\/|\/$/gu, ''),
		String.split('/'),
		Array.last,
		Option.getOrElse(() => ''),
		String.replace(/\.git$/u, '')
	)
}

function validateUrl(url: URL) {
	const parts = pipe(url.pathname, String.replace(/^\/|\/$/gu, ''), String.split('/'), Array.filter(String.isNonEmpty))
	return url.protocol === 'https:' && url.hostname === 'github.com' && parts.length === 2
		? Effect.void
		: RepositoryError.make({message: 'repositories must use a GitHub HTTPS URL'})
}

export class Repositories extends Context.Service<Repositories>()(
	'@deslop/workbench/services/repositories/service/Repositories',
	{
		make: Effect.fnUntraced(function* (config: RepositoriesConfig) {
			const fs = yield* FileSystem.FileSystem
			const path = yield* Path.Path
			const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
			yield* fs.makeDirectory(config.directory, {recursive: true})

			const runWithCode = Effect.fnUntraced(function* (
				program: string,
				args: readonly string[],
				cwd: string,
				authenticated: boolean,
				expected: readonly number[] = [0]
			) {
				const token = authenticated ? yield* config.token : undefined
				const handle = yield* pipe(
					spawner.spawn(
						ChildProcess.make(program, args, {
							cwd,
							env: Predicate.isNotUndefined(token)
								? {GH_PROMPT_DISABLED: '1', GH_TOKEN: token}
								: {GH_PROMPT_DISABLED: '1'},
							extendEnv: true,
							stderr: 'pipe',
							stdout: 'pipe'
						})
					),
					Effect.mapError(cause => RepositoryError.make({cause, message: `failed to start ${program}`}))
				)
				const output = yield* pipe(
					Effect.all(
						{
							code: handle.exitCode,
							stderr: pipe(handle.stderr, Stream.decodeText, Stream.mkString),
							stdout: pipe(handle.stdout, Stream.decodeText, Stream.mkString)
						},
						{concurrency: 'unbounded'}
					),
					Effect.mapError(cause => RepositoryError.make({cause, message: `${program} failed`}))
				)
				if (!expected.includes(Number(output.code))) {
					return yield* RepositoryError.make({
						message: `${program} ${Array.join(' ')(args)} failed: ${output.stderr || output.stdout}`
					})
				}
				return output
			})
			const run = Effect.fnUntraced(function* (
				program: string,
				args: readonly string[],
				cwd: string,
				authenticated: boolean,
				expected: readonly number[] = [0]
			) {
				return (yield* runWithCode(program, args, cwd, authenticated, expected)).stdout
			})
			function git(cwd: string, args: readonly string[], authenticated = false, expected?: readonly number[]) {
				return run('git', args, cwd, authenticated, expected)
			}
			function root(name: string) {
				return path.join(config.directory, name)
			}
			function canonical(name: string) {
				return path.join(root(name), 'repo')
			}

			const readRepository = Effect.fnUntraced(function* (name: string) {
				const repositoryPath = canonical(name)
				const url = yield* pipe(
					git(repositoryPath, ['remote', 'get-url', 'origin']),
					Effect.map(String.trim),
					Effect.flatMap(value =>
						Effect.try({
							catch: cause => RepositoryError.make({cause, message: `invalid remote URL for ${name}`}),
							try: () => new URL(value)
						})
					)
				)
				const defaultBranch = yield* pipe(
					git(repositoryPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
					Effect.map(String.trim),
					Effect.map(String.replace(/^origin\//u, ''))
				)
				return Repository.make({defaultBranch, name: RepositoryName.make(name), path: repositoryPath, url})
			})
			const scan = Effect.fnUntraced(function* () {
				const names = yield* fs.readDirectory(config.directory)
				return yield* pipe(
					names,
					Effect.forEach(
						name =>
							pipe(
								fs.exists(path.join(canonical(name), '.git')),
								Effect.flatMap(exists =>
									exists ? pipe(readRepository(name), Effect.map(Option.some)) : Effect.succeed(Option.none())
								)
							),
						{concurrency: 8}
					),
					Effect.map(Array.getSomes)
				)
			})
			const repositories = yield* SubscriptionRef.make<readonly (typeof Repository.Type)[]>(yield* scan())
			const refresh = pipe(
				scan(),
				Effect.flatMap(value => SubscriptionRef.set(repositories, value))
			)
			const find = Effect.fnUntraced(function* (name: typeof RepositoryName.Type) {
				return yield* pipe(
					yield* SubscriptionRef.get(repositories),
					Array.findFirst(repository => repository.name === name),
					Option.match({
						onNone: () => RepositoryError.make({message: `unknown repository ${name}`}),
						onSome: Effect.succeed
					})
				)
			})
			const credentialArgs = ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential'] as const

			return {
				add: Effect.fn('Repositories.add')(function* (input: {readonly url: URL}) {
					yield* validateUrl(input.url)
					const name = repositoryName(input.url)
					if (name === '') return yield* RepositoryError.make({message: 'repository URL has no name'})
					const repositoryRoot = root(name)
					if (yield* fs.exists(repositoryRoot)) return yield* RepositoryError.make({message: `${name} already exists`})
					yield* fs.makeDirectory(repositoryRoot, {recursive: true})
					yield* pipe(
						git(
							config.directory,
							[...credentialArgs, 'clone', '--no-checkout', input.url.toString(), canonical(name)],
							true
						),
						Effect.andThen(git(canonical(name), [...credentialArgs, 'remote', 'set-head', 'origin', '--auto'], true)),
						Effect.andThen(git(canonical(name), ['checkout', '--detach', 'refs/remotes/origin/HEAD'])),
						Effect.andThen(
							Effect.forEach(
								[
									'.worktrees/planning',
									'.worktrees/implementation',
									'.resources',
									'.data/sessions',
									'.data/issues',
									'.data/history',
									'.data/assets'
								],
								directory => fs.makeDirectory(path.join(repositoryRoot, directory), {recursive: true}),
								{discard: true}
							)
						),
						Effect.tapError(() => fs.remove(repositoryRoot, {recursive: true}))
					)
					yield* refresh
					return yield* find(RepositoryName.make(name))
				}),
				closeRemote: Effect.fn('Repositories.closeRemote')(function* (input: {
					readonly branch: typeof BranchName.Type
					readonly repository: typeof RepositoryName.Type
				}) {
					const repository = yield* find(input.repository)
					const closed = yield* Effect.result(
						runWithCode('gh', ['pr', 'close', input.branch, '--delete-branch'], repository.path, true)
					)
					if (Result.isSuccess(closed)) return
					const openPullRequests = yield* run(
						'gh',
						['pr', 'list', '--state', 'open', '--head', input.branch, '--json', 'number', '--jq', 'length'],
						repository.path,
						true
					)
					const remoteBranch = yield* runWithCode(
						'gh',
						['api', '--silent', `repos/{owner}/{repo}/git/ref/heads/${input.branch}`],
						repository.path,
						true,
						[0, 1]
					)
					const remoteMissing = Number(remoteBranch.code) === 1 && /(?:HTTP 404|Not Found)/iu.test(remoteBranch.stderr)
					if (String.trim(openPullRequests) !== '0' || !remoteMissing) {
						return yield* closed.failure
					}
				}),
				createImplementationWorktree: Effect.fn('Repositories.createImplementationWorktree')(function* (input: {
					readonly branch: typeof BranchName.Type
					readonly repository: typeof RepositoryName.Type
				}) {
					const repository = yield* find(input.repository)
					const worktree = path.join(root(input.repository), '.worktrees', 'implementation', input.branch)
					if (yield* fs.exists(path.join(worktree, '.git'))) return worktree
					if (yield* fs.exists(worktree)) yield* fs.remove(worktree, {recursive: true})
					yield* git(repository.path, ['worktree', 'prune'])
					const branchExists = String.isNonEmpty(
						String.trim(
							yield* git(repository.path, ['show-ref', '--verify', `refs/heads/${input.branch}`], false, [0, 1])
						)
					)
					if (!branchExists) {
						yield* git(repository.path, ['branch', input.branch, `origin/${repository.defaultBranch}`])
					}
					yield* git(repository.path, ['worktree', 'add', worktree, input.branch])
					return worktree
				}),
				createPlanningWorktree: Effect.fn('Repositories.createPlanningWorktree')(function* (input: {
					readonly agentId: typeof AgentId.Type
					readonly repository: typeof RepositoryName.Type
				}) {
					const repository = yield* find(input.repository)
					const worktree = path.join(root(input.repository), '.worktrees', 'planning', input.agentId)
					yield* git(repository.path, ['worktree', 'add', '--detach', worktree, `origin/${repository.defaultBranch}`])
					return worktree
				}),
				find,
				hasUnpushedCommits: Effect.fn('Repositories.hasUnpushedCommits')(function* (input: {
					readonly branch: typeof BranchName.Type
					readonly repository: typeof RepositoryName.Type
				}) {
					const worktree = path.join(root(input.repository), '.worktrees', 'implementation', input.branch)
					const output = yield* git(worktree, ['rev-list', '--count', '@{upstream}..HEAD'], false, [0, 128])
					return output === '' || String.trim(output) !== '0'
				}),
				implementationPath: (repository: typeof RepositoryName.Type, branch: typeof BranchName.Type) =>
					path.join(root(repository), '.worktrees', 'implementation', branch),
				movePlanningWorktree: Effect.fn('Repositories.movePlanningWorktree')(function* (input: {
					readonly from: typeof AgentId.Type
					readonly repository: typeof RepositoryName.Type
					readonly to: typeof AgentId.Type
				}) {
					const repository = yield* find(input.repository)
					const from = path.join(root(input.repository), '.worktrees', 'planning', input.from)
					const to = path.join(root(input.repository), '.worktrees', 'planning', input.to)
					yield* git(repository.path, ['worktree', 'move', from, to])
					return to
				}),
				planningPath: (repository: typeof RepositoryName.Type, agentId: typeof AgentId.Type) =>
					path.join(root(repository), '.worktrees', 'planning', agentId),
				remoteBranchExists: Effect.fn('Repositories.remoteBranchExists')(function* (input: {
					readonly branch: typeof BranchName.Type
					readonly repository: typeof RepositoryName.Type
				}) {
					const repository = yield* find(input.repository)
					const output = yield* git(
						repository.path,
						['show-ref', '--verify', `refs/remotes/origin/${input.branch}`],
						false,
						[0, 1]
					)
					return output !== ''
				}),
				removeIssueMechanics: Effect.fn('Repositories.removeIssueMechanics')(function* (input: {
					readonly branch: typeof BranchName.Type
					readonly planningAgentId: typeof AgentId.Type
					readonly repository: typeof RepositoryName.Type
				}) {
					const repository = yield* find(input.repository)
					const implementation = path.join(root(input.repository), '.worktrees', 'implementation', input.branch)
					const planning = path.join(root(input.repository), '.worktrees', 'planning', input.planningAgentId)
					const remoteRef = `refs/heads/${input.branch}`
					const remote = yield* runWithCode(
						'git',
						[...credentialArgs, 'ls-remote', '--exit-code', '--heads', 'origin', remoteRef],
						repository.path,
						true,
						[0, 2]
					)
					if (Number(remote.code) === 0) {
						yield* git(repository.path, [...credentialArgs, 'push', 'origin', '--delete', input.branch], true)
						const verification = yield* runWithCode(
							'git',
							[...credentialArgs, 'ls-remote', '--exit-code', '--heads', 'origin', remoteRef],
							repository.path,
							true,
							[0, 2]
						)
						if (Number(verification.code) !== 2) {
							return yield* RepositoryError.make({message: `remote branch deletion was not confirmed: ${input.branch}`})
						}
					}
					if (yield* fs.exists(implementation)) {
						yield* git(repository.path, ['worktree', 'remove', '--force', implementation])
					}
					if (yield* fs.exists(planning)) yield* git(repository.path, ['worktree', 'remove', '--force', planning])
					yield* git(repository.path, ['branch', '--delete', '--force', input.branch], false, [0, 1])
				}),
				repositories,
				synchronize: Effect.fn('Repositories.synchronize')(function* (name: typeof RepositoryName.Type) {
					const repository = yield* find(name)
					yield* git(repository.path, [...credentialArgs, 'fetch', '--prune', 'origin'], true)
					yield* git(repository.path, [...credentialArgs, 'remote', 'set-head', 'origin', '--auto'], true)
					const updated = yield* readRepository(name)
					yield* git(repository.path, ['checkout', '--detach', `origin/${updated.defaultBranch}`])
					yield* refresh
					return yield* find(name)
				})
			}
		})
	}
) {
	public static layer = (config: RepositoriesConfig) => Layer.effect(this, this.make(config))
}
