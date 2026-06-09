import {execFileSync} from 'node:child_process'
import {chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {performance} from 'node:perf_hooks'

import {NodeServices} from '@effect/platform-node'

import {Array, ConfigProvider, Effect, Order} from 'effect'

import type {ChildProcessSpawner} from 'effect/unstable/process'
import {describe, expect, it} from 'vite-plus/test'

import {GitCommand, GitCommitAction, GitReview, GitWorkspace, cleanupGitProject} from './service.ts'

function withTempRoot<T>(test: (root: string) => Promise<T> | T) {
	return Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* () {
				const root = yield* Effect.acquireRelease(
					Effect.promise(() => mkdtemp(join(tmpdir(), 'deslop-git-'))),
					directory => Effect.promise(() => rm(directory, {force: true, recursive: true}))
				)

				return yield* Effect.promise(() => Promise.resolve(test(root)))
			})
		)
	)
}

function git(cwd: string, args: readonly string[]) {
	return execFileSync('git', [...args], {cwd, encoding: 'utf8'})
}

function initRepo(root: string) {
	mkdirSync(root, {recursive: true})
	git(root, ['init', '--initial-branch=main'])
	git(root, ['config', 'user.email', 'test@example.com'])
	git(root, ['config', 'user.name', 'Test User'])
	writeFileSync(join(root, 'README.md'), 'initial\n')
	git(root, ['add', 'README.md'])
	git(root, ['commit', '-m', 'initial'])
	return root
}

function initRemoteRepo(root: string) {
	const remote = join(root, 'remote.git')
	const repo = join(root, 'repo')
	git(root, ['init', '--bare', remote])
	git(root, ['clone', remote, repo])
	git(repo, ['switch', '-c', 'main'])
	git(repo, ['config', 'user.email', 'test@example.com'])
	git(repo, ['config', 'user.name', 'Test User'])
	writeFileSync(join(repo, 'README.md'), 'initial\n')
	git(repo, ['add', 'README.md'])
	git(repo, ['commit', '-m', 'initial'])
	git(repo, ['push', '-u', 'origin', 'main'])
	git(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main'])
	return {remote, repo}
}

function fakeGh(root: string) {
	const bin = join(root, 'bin')
	const log = join(root, 'gh.log')
	mkdirSync(bin, {recursive: true})
	writeFileSync(
		join(bin, 'gh'),
		`#!/bin/sh
printf '%s\\n' "$*" >> "${log}"
if [ "$1 $2" = "pr view" ]; then
	exit 1
fi
if [ "$1 $2" = "pr create" ]; then
	printf '%s\\n' 'https://github.com/test/repo/pull/1'
	exit 0
fi
printf '%s\\n' '{}'
`
	)
	chmodSync(join(bin, 'gh'), 0o755)

	return {bin, log}
}

function fakeGhReview(root: string) {
	const bin = join(root, 'bin')
	const log = join(root, 'gh.log')
	mkdirSync(bin, {recursive: true})
	writeFileSync(
		join(bin, 'gh'),
		`#!/bin/sh
printf '%s\\n' "$*" >> "${log}"
if [ "$1 $2" = "pr view" ]; then
	printf '%s\\n' '7'
	exit 0
fi
if [ "$1 $2" = "repo view" ]; then
	printf '%s\\n' '{"owner":{"login":"test-owner"},"name":"test-repo"}'
	exit 0
fi
if [ "$1 $2" = "api graphql" ]; then
	case "$*" in
		*resolveReviewThread*)
			printf '%s\\n' '{"data":{"resolveReviewThread":{"thread":{"id":"thread-1"}}}}'
			;;
		*)
			printf '%s\\n' '{"data":{"repository":{"pullRequest":{"reviewThreads":{"nodes":[{"id":"thread-1","isResolved":false,"diffSide":"RIGHT","comments":{"nodes":[{"body":"fix this","line":12,"originalLine":null,"path":"src/file.ts","url":"https://github.test/thread"}]}}]}}}}}'
			;;
	esac
	exit 0
fi
exit 1
`
	)
	chmodSync(join(bin, 'gh'), 0o755)

	return {bin, log}
}

function fakeGit(root: string) {
	const bin = join(root, 'bin')
	const log = join(root, 'git.log')
	mkdirSync(bin, {recursive: true})
	writeFileSync(
		join(bin, 'git'),
		`#!/bin/sh
printf '%s %s\\n' "$PWD" "$*" >> "${log}"
if [ "$1 $2" = "rev-list --parents" ]; then
	printf '%s\\n' 'commit parent'
	exit 0
fi
if [ "$1 $2" = "status --porcelain" ]; then
	exit 0
fi
if [ "$1" = "log" ]; then
	printf '\\0DESLOP-COMMIT\\0commit\\0parent\\n'
	index=1
	while [ "$index" -le 80 ]; do
		printf 'file-%s.txt\\n' "$index"
		index=$((index + 1))
	done
	exit 0
fi
if [ "$1" = "ls-files" ]; then
	exit 0
fi
if [ "$1" = "diff" ] || [ "$1" = "diff-tree" ]; then
	if [ "$1" = "diff-tree" ]; then
		printf '%s\\n' 'commit'
	fi
	index=1
	while [ "$index" -le 80 ]; do
		printf 'diff --git a/file-%s.txt b/file-%s.txt\\n--- a/file-%s.txt\\n+++ b/file-%s.txt\\n@@ -1 +1 @@\\n-old\\n+new\\n' "$index" "$index" "$index" "$index"
		index=$((index + 1))
	done
	exit 0
fi
if [ "$1" = "show" ]; then
	printf '%s\\n' 'commit file content'
	exit 0
fi
exit 1
`
	)
	chmodSync(join(bin, 'git'), 0o755)

	return {bin, log}
}

function fakeCleanupGit(root: string) {
	const bin = join(root, 'bin')
	const log = join(root, 'cleanup-git.log')
	mkdirSync(bin, {recursive: true})
	writeFileSync(
		join(bin, 'git'),
		`#!/bin/sh
printf '%s %s\\n' "$PWD" "$*" >> "${log}"
if [ "$1 $2 $3" = "worktree list --porcelain" ]; then
	printf 'worktree %s\\0HEAD commit\\0branch refs/heads/main\\0' "$PWD"
	exit 0
fi
if [ "$1 $2" = "symbolic-ref --short" ]; then
	printf '%s\\n' 'origin/main'
	exit 0
fi
if [ "$1" = "fetch" ]; then
	exit 0
fi
if [ "$1" = "for-each-ref" ]; then
	index=1
	while [ "$index" -le 80 ]; do
		printf 'branch-%s\\0origin/branch-%s\\0\\0\\0\\n' "$index" "$index"
		index=$((index + 1))
	done
	printf 'gone\\0origin/gone\\0[gone]\\0%s/gone-worktree\\n' "$PWD"
	printf 'behind\\0origin/behind\\0[behind 1]\\0\\n'
	exit 0
fi
if [ "$1 $2" = "worktree remove" ]; then
	exit 0
fi
if [ "$1 $2" = "branch -D" ]; then
	exit 0
fi
if [ "$1" = "merge-base" ]; then
	exit 0
fi
if [ "$1 $2" = "branch -f" ]; then
	exit 0
fi
exit 1
`
	)
	chmodSync(join(bin, 'git'), 0o755)

	return {bin, log}
}

function sorted(values: readonly string[]) {
	return Array.sortWith(values, value => value, Order.String)
}

function runWorkspace<T, E>(
	home: string,
	effect: Effect.Effect<T, E, GitWorkspace | GitCommand | ChildProcessSpawner.ChildProcessSpawner>
) {
	return Effect.runPromise(
		effect.pipe(
			Effect.provide(GitWorkspace.layer),
			Effect.provide(GitCommand.layer),
			Effect.provide(NodeServices.layer),
			Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({HOME: home}))),
			Effect.scoped
		)
	)
}

function runCleanup<T, E>(effect: Effect.Effect<T, E, GitCommand | ChildProcessSpawner.ChildProcessSpawner>) {
	return Effect.runPromise(
		effect.pipe(Effect.provide(GitCommand.layer), Effect.provide(NodeServices.layer), Effect.scoped)
	)
}

function runReview<T, E>(
	cwd: string,
	effect: Effect.Effect<T, E, GitReview | GitCommand | ChildProcessSpawner.ChildProcessSpawner>
) {
	return Effect.runPromise(
		effect.pipe(
			Effect.provide(GitReview.layer({cwd})),
			Effect.provide(GitCommand.layer),
			Effect.provide(NodeServices.layer),
			Effect.scoped
		)
	)
}

function runCommit<T, E>(
	cwd: string,
	effect: Effect.Effect<T, E, GitCommitAction | GitCommand | ChildProcessSpawner.ChildProcessSpawner>
) {
	return Effect.runPromise(
		effect.pipe(
			Effect.provide(GitCommitAction.layer({cwd})),
			Effect.provide(GitCommand.layer),
			Effect.provide(NodeServices.layer),
			Effect.scoped
		)
	)
}

describe('@deslop/git service', () => {
	it('discovers repositories while excluding dot directories and node_modules', async () => {
		await withTempRoot(async root => {
			const repo = initRepo(join(root, 'repo'))
			initRepo(join(root, '.hidden'))
			initRepo(join(root, 'node_modules/package'))

			const repositories = await runWorkspace(
				root,
				Effect.flatMap(GitWorkspace, service => service.listRepositoriesFrom(root))
			)

			expect(repositories.map(repository => repository.root)).toEqual([repo])
		})
	})

	it('dedupes discovered repositories and lists linked worktrees', async () => {
		await withTempRoot(async root => {
			const repo = initRepo(join(root, 'repo'))
			git(repo, ['branch', 'feature'])
			const linked = join(root, 'linked')
			git(repo, ['worktree', 'add', linked, 'feature'])

			const projects = await runWorkspace(
				root,
				Effect.flatMap(GitWorkspace, service => service.listProjectsFrom(root))
			)

			expect(projects).toHaveLength(1)
			expect(sorted(projects[0]?.worktrees.map(worktree => worktree.root) ?? [])).toEqual(sorted([linked, repo]))
		})
	})

	it('builds changes and commit review diffs from a temporary repository', async () => {
		await withTempRoot(async root => {
			const repo = initRepo(root)
			writeFileSync(join(repo, 'README.md'), 'initial\nhead change\n')
			git(repo, ['add', 'README.md'])
			git(repo, ['commit', '-m', 'change readme'])
			const commit = git(repo, ['rev-parse', 'HEAD']).trim()
			writeFileSync(join(repo, 'README.md'), 'initial\nhead change\nworktree change\n')

			const diffs = await runReview(
				repo,
				Effect.flatMap(GitReview, service => service.reviewDiffs({_tag: 'commit', hash: commit}))
			)
			const changesDiffs = await runReview(
				repo,
				Effect.flatMap(GitReview, service => service.reviewDiffs({_tag: 'changes'}))
			)

			expect(diffs).toHaveLength(1)
			expect(diffs[0]?.segments.map(segment => segment.type)).toEqual(['commit'])
			expect(diffs[0]?.segments[0]?.fingerprint).toBe(diffs[0]?.patch)
			expect(changesDiffs[0]?.segments).toHaveLength(1)
			expect(changesDiffs[0]?.segments[0]?.type).toBe('worktree')
		})
	})

	it('builds local and branch review diffs around pushed and unpushed commits', async () => {
		await withTempRoot(async root => {
			const fixture = initRemoteRepo(root)
			git(fixture.repo, ['switch', '-c', 'feature'])
			writeFileSync(join(fixture.repo, 'branch.txt'), 'branch\n')
			git(fixture.repo, ['add', 'branch.txt'])
			git(fixture.repo, ['commit', '-m', 'branch change'])
			git(fixture.repo, ['push', '-u', 'origin', 'feature'])
			writeFileSync(join(fixture.repo, 'local.txt'), 'local\n')
			git(fixture.repo, ['add', 'local.txt'])
			git(fixture.repo, ['commit', '-m', 'local change'])
			writeFileSync(join(fixture.repo, 'worktree.txt'), 'worktree\n')

			const localDiffs = await runReview(
				fixture.repo,
				Effect.flatMap(GitReview, service => service.reviewDiffs({_tag: 'local'}))
			)
			const branchDiffs = await runReview(
				fixture.repo,
				Effect.flatMap(GitReview, service => service.reviewDiffs({_tag: 'branch'}))
			)

			expect(localDiffs.map(diff => diff.filePath)).toEqual(['local.txt', 'worktree.txt'])
			expect(branchDiffs.map(diff => diff.filePath)).toEqual(['branch.txt', 'local.txt', 'worktree.txt'])
			expect(localDiffs[1]?.segments[0]?.fingerprint).toBe(localDiffs[1]?.patch)
			expect(branchDiffs[0]?.segments[0]?.fingerprint).toBe(branchDiffs[0]?.patch)
		})
	})

	it('returns clean changes review diffs without running diff or untracked discovery', async () => {
		await withTempRoot(async root => {
			const fake = fakeGit(root)
			const originalPath = process.env['PATH']
			process.env['PATH'] = `${fake.bin}:${process.env['PATH'] ?? ''}`

			try {
				const diffs = await runReview(
					root,
					Effect.flatMap(GitReview, service => service.reviewDiffs({_tag: 'changes'}))
				)
				const commands = readFileSync(fake.log, 'utf8').trim().split('\n')

				expect(diffs).toEqual([])
				expect(commands).toHaveLength(1)
				expect(commands[0]).toContain(' status --porcelain')
			} finally {
				process.env['PATH'] = originalPath
			}
		})
	})

	it('loads file content with review diffs', async () => {
		await withTempRoot(async root => {
			const repo = initRepo(root)
			writeFileSync(join(repo, 'README.md'), 'current file content\n')
			const changesDiffs = await runReview(
				repo,
				Effect.flatMap(GitReview, service => service.reviewDiffs({_tag: 'changes'}))
			)

			expect(changesDiffs[0]?.fileContent).toBe('current file content\n')

			const fake = fakeGit(root)
			const originalPath = process.env['PATH']
			process.env['PATH'] = `${fake.bin}:${process.env['PATH'] ?? ''}`

			try {
				const commitDiffs = await runReview(
					root,
					Effect.flatMap(GitReview, service => service.reviewDiffs({_tag: 'commit', hash: 'commit'}))
				)
				const commands = readFileSync(fake.log, 'utf8').trim().split('\n')

				expect(commitDiffs[0]?.fileContent).toBe('commit file content\n')
				expect(commands).toHaveLength(81)
				expect(commands[0]).toContain(' diff-tree ')
				expect(commands[1]).toContain(' show commit:file-1.txt')
				expect(commands.at(-1)).toContain(' show commit:file-80.txt')
			} finally {
				process.env['PATH'] = originalPath
			}
		})
	})

	it('changes changes review fingerprints when a file changes', async () => {
		await withTempRoot(async root => {
			const repo = initRepo(root)
			writeFileSync(join(repo, 'README.md'), 'initial\nfirst change\n')
			const first = await runReview(
				repo,
				Effect.flatMap(GitReview, service => service.reviewDiffs({_tag: 'changes'}))
			)
			writeFileSync(join(repo, 'README.md'), 'initial\nsecond change\n')
			const second = await runReview(
				repo,
				Effect.flatMap(GitReview, service => service.reviewDiffs({_tag: 'changes'}))
			)

			expect(first[0]?.segments[0]?.fingerprint).not.toBe(second[0]?.segments[0]?.fingerprint)
		})
	})

	it('builds commit review diffs with file content for many files', async () => {
		await withTempRoot(async root => {
			const fake = fakeGit(root)
			const originalPath = process.env['PATH']
			process.env['PATH'] = `${fake.bin}:${process.env['PATH'] ?? ''}`
			const started = performance.now()

			try {
				const diffs = await runReview(
					root,
					Effect.flatMap(GitReview, service => service.reviewDiffs({_tag: 'commit', hash: 'commit'}))
				)
				const commands = readFileSync(fake.log, 'utf8').trim().split('\n')

				expect(diffs).toHaveLength(80)
				expect(diffs[0]?.fileContent).toBe('commit file content\n')
				expect(commands).toHaveLength(81)
				expect(commands[0]).toContain(' diff-tree ')
				expect(commands[0]).not.toContain('-U999999')
				expect(performance.now() - started).toBeLessThan(1_000)
			} finally {
				process.env['PATH'] = originalPath
			}
		})
	})

	it('builds local review diffs from the configured upstream', async () => {
		await withTempRoot(async root => {
			const fixture = initRemoteRepo(root)
			const upstream = join(root, 'upstream.git')
			git(root, ['init', '--bare', upstream])
			git(fixture.repo, ['remote', 'add', 'upstream', upstream])
			git(fixture.repo, ['switch', '-c', 'feature'])
			writeFileSync(join(fixture.repo, 'upstream.txt'), 'upstream\n')
			git(fixture.repo, ['add', 'upstream.txt'])
			git(fixture.repo, ['commit', '-m', 'upstream change'])
			git(fixture.repo, ['push', '-u', 'upstream', 'feature'])
			writeFileSync(join(fixture.repo, 'local.txt'), 'local\n')
			git(fixture.repo, ['add', 'local.txt'])
			git(fixture.repo, ['commit', '-m', 'local change'])

			const localDiffs = await runReview(
				fixture.repo,
				Effect.flatMap(GitReview, service => service.reviewDiffs({_tag: 'local'}))
			)

			expect(localDiffs.map(diff => diff.filePath)).toEqual(['local.txt'])
		})
	})

	it('builds selected merge commit review diffs against the first parent', async () => {
		await withTempRoot(async root => {
			const repo = initRepo(root)
			git(repo, ['switch', '-c', 'side'])
			writeFileSync(join(repo, 'side.txt'), 'side\n')
			git(repo, ['add', 'side.txt'])
			git(repo, ['commit', '-m', 'side change'])
			git(repo, ['switch', 'main'])
			writeFileSync(join(repo, 'main.txt'), 'main\n')
			git(repo, ['add', 'main.txt'])
			git(repo, ['commit', '-m', 'main change'])
			git(repo, ['merge', '--no-ff', 'side', '-m', 'merge side'])
			const merge = git(repo, ['rev-parse', 'HEAD']).trim()

			const diffs = await runReview(
				repo,
				Effect.flatMap(GitReview, service => service.reviewDiffs({_tag: 'commit', hash: merge}))
			)

			expect(diffs.map(diff => diff.filePath)).toEqual(['side.txt'])
		})
	})

	it('keeps discovery within a broad wall-clock budget on synthetic repositories', async () => {
		await withTempRoot(async root => {
			for (let index = 0; index < 120; index += 1) {
				initRepo(join(root, `repo-${index}`))
			}

			const started = performance.now()
			const repositories = await runWorkspace(
				root,
				Effect.flatMap(GitWorkspace, service => service.listRepositoriesFrom(root))
			)
			const elapsed = performance.now() - started

			expect(repositories).toHaveLength(120)
			expect(elapsed).toBeLessThan(10_000)
		})
	})

	it('cleanup deletes gone upstream branches and linked worktrees', async () => {
		await withTempRoot(async root => {
			const fixture = initRemoteRepo(root)
			git(fixture.repo, ['switch', '-c', 'stale'])
			writeFileSync(join(fixture.repo, 'stale.txt'), 'stale\n')
			git(fixture.repo, ['add', 'stale.txt'])
			git(fixture.repo, ['commit', '-m', 'stale'])
			git(fixture.repo, ['push', '-u', 'origin', 'stale'])
			git(fixture.repo, ['switch', 'main'])
			const staleWorktree = join(root, 'stale-worktree')
			git(fixture.repo, ['worktree', 'add', staleWorktree, 'stale'])
			writeFileSync(join(staleWorktree, 'dirty.txt'), 'dirty\n')
			writeFileSync(join(staleWorktree, 'unpushed.txt'), 'unpushed\n')
			git(staleWorktree, ['add', 'unpushed.txt'])
			git(staleWorktree, ['commit', '-m', 'unpushed stale'])
			git(fixture.repo, ['push', 'origin', '--delete', 'stale'])

			const failures = await runCleanup(cleanupGitProject(fixture.repo))

			expect(failures).toEqual([])
			expect(git(fixture.repo, ['branch', '--list', 'stale']).trim()).toBe('')
			expect(existsSync(staleWorktree)).toBe(false)
		})
	})

	it('cleanup reports gone upstream root worktree refusal and continues', async () => {
		await withTempRoot(async root => {
			const fixture = initRemoteRepo(root)
			git(fixture.repo, ['switch', '-c', 'stale-root'])
			writeFileSync(join(fixture.repo, 'stale-root.txt'), 'stale root\n')
			git(fixture.repo, ['add', 'stale-root.txt'])
			git(fixture.repo, ['commit', '-m', 'stale root'])
			git(fixture.repo, ['push', '-u', 'origin', 'stale-root'])
			git(fixture.repo, ['switch', 'main'])
			git(fixture.repo, ['switch', '-c', 'stale-linked'])
			writeFileSync(join(fixture.repo, 'stale-linked.txt'), 'stale linked\n')
			git(fixture.repo, ['add', 'stale-linked.txt'])
			git(fixture.repo, ['commit', '-m', 'stale linked'])
			git(fixture.repo, ['push', '-u', 'origin', 'stale-linked'])
			const staleLinkedWorktree = join(root, 'stale-linked-worktree')
			git(fixture.repo, ['switch', 'stale-root'])
			git(fixture.repo, ['worktree', 'add', staleLinkedWorktree, 'stale-linked'])
			git(fixture.repo, ['push', 'origin', '--delete', 'stale-root'])
			git(fixture.repo, ['push', 'origin', '--delete', 'stale-linked'])

			const failures = await runCleanup(cleanupGitProject(fixture.repo))

			expect(failures.map(failure => failure.message).join('\n')).toContain('delete stale-root')
			expect(git(fixture.repo, ['branch', '--list', 'stale-root']).trim()).toContain('stale-root')
			expect(git(fixture.repo, ['branch', '--list', 'stale-linked']).trim()).toBe('')
			expect(existsSync(staleLinkedWorktree)).toBe(false)
		})
	})

	it('cleanup deletes merged local-only branches and preserves unmerged and dirty local-only branches', async () => {
		await withTempRoot(async root => {
			const fixture = initRemoteRepo(root)
			git(fixture.repo, ['branch', 'merged-local'])
			git(fixture.repo, ['switch', '-c', 'unmerged-local'])
			writeFileSync(join(fixture.repo, 'unmerged.txt'), 'unmerged\n')
			git(fixture.repo, ['add', 'unmerged.txt'])
			git(fixture.repo, ['commit', '-m', 'unmerged local'])
			git(fixture.repo, ['switch', '-c', 'dirty-local', 'main'])
			git(fixture.repo, ['switch', 'main'])
			const dirtyLocalWorktree = join(root, 'dirty-local-worktree')
			git(fixture.repo, ['worktree', 'add', dirtyLocalWorktree, 'dirty-local'])
			writeFileSync(join(dirtyLocalWorktree, 'dirty.txt'), 'dirty\n')

			const failures = await runCleanup(cleanupGitProject(fixture.repo))

			expect(failures.map(failure => failure.message)).toContain('dirty-local: skipped dirty local-only branch')
			expect(git(fixture.repo, ['branch', '--list', 'merged-local']).trim()).toBe('')
			expect(git(fixture.repo, ['branch', '--list', 'dirty-local']).trim()).toContain('dirty-local')
			expect(existsSync(dirtyLocalWorktree)).toBe(true)
			expect(git(fixture.repo, ['branch', '--list', 'unmerged-local']).trim()).toContain('unmerged-local')
		})
	})

	it('cleanup preserves the default branch when its upstream is unset', async () => {
		await withTempRoot(async root => {
			const fixture = initRemoteRepo(root)
			git(fixture.repo, ['branch', '--unset-upstream', 'main'])
			git(fixture.repo, ['branch', 'merged-local'])

			const failures = await runCleanup(cleanupGitProject(fixture.repo))

			expect(failures).toEqual([])
			expect(git(fixture.repo, ['branch', '--list', 'main']).trim()).toContain('main')
			expect(git(fixture.repo, ['branch', '--list', 'merged-local']).trim()).toBe('')
		})
	})

	it('cleanup fast-forwards clean branches and reports detached branch rebases', async () => {
		await withTempRoot(async root => {
			const fixture = initRemoteRepo(root)
			const other = join(root, 'other')
			git(root, ['clone', fixture.remote, other])
			git(other, ['config', 'user.email', 'test@example.com'])
			git(other, ['config', 'user.name', 'Test User'])
			writeFileSync(join(other, 'README.md'), 'initial\nremote\n')
			git(other, ['commit', '-am', 'remote main'])
			git(other, ['push'])
			git(fixture.repo, ['switch', '-c', 'diverged'])
			writeFileSync(join(fixture.repo, 'local.txt'), 'local\n')
			git(fixture.repo, ['add', 'local.txt'])
			git(fixture.repo, ['commit', '-m', 'local diverged'])
			git(fixture.repo, ['branch', '--set-upstream-to=origin/main', 'diverged'])
			const divergedHead = git(fixture.repo, ['rev-parse', 'diverged']).trim()
			git(fixture.repo, ['switch', 'main'])

			const failures = await runCleanup(cleanupGitProject(fixture.repo))

			expect(git(fixture.repo, ['rev-parse', 'main']).trim()).toBe(
				git(fixture.repo, ['rev-parse', 'origin/main']).trim()
			)
			expect(git(fixture.repo, ['rev-parse', 'diverged']).trim()).toBe(divergedHead)
			expect(failures.map(failure => failure.message)).toContain(
				'diverged: skipped rebase for branch without linked worktree'
			)
		})
	})

	it('cleanup skips dirty branches with existing upstreams', async () => {
		await withTempRoot(async root => {
			const fixture = initRemoteRepo(root)
			const other = join(root, 'other')
			git(root, ['clone', fixture.remote, other])
			git(other, ['config', 'user.email', 'test@example.com'])
			git(other, ['config', 'user.name', 'Test User'])
			git(fixture.repo, ['switch', '-c', 'feature'])
			writeFileSync(join(fixture.repo, 'feature.txt'), 'local dirty\n')
			git(fixture.repo, ['add', 'feature.txt'])
			git(fixture.repo, ['commit', '-m', 'feature'])
			git(fixture.repo, ['push', '-u', 'origin', 'feature'])
			git(other, ['fetch', 'origin'])
			git(other, ['switch', 'feature'])
			writeFileSync(join(other, 'remote.txt'), 'remote\n')
			git(other, ['add', 'remote.txt'])
			git(other, ['commit', '-m', 'remote feature'])
			git(other, ['push'])
			writeFileSync(join(fixture.repo, 'feature.txt'), 'local dirty\nuncommitted\n')

			const failures = await runCleanup(cleanupGitProject(fixture.repo))

			expect(readFileSync(join(fixture.repo, 'feature.txt'), 'utf8')).toBe('local dirty\nuncommitted\n')
			expect(failures.map(failure => failure.message)).toContain('feature: skipped dirty worktree')
		})
	})

	it('cleanup rebases clean checked-out branches with local and upstream commits', async () => {
		await withTempRoot(async root => {
			const fixture = initRemoteRepo(root)
			const other = join(root, 'other')
			git(root, ['clone', fixture.remote, other])
			git(other, ['config', 'user.email', 'test@example.com'])
			git(other, ['config', 'user.name', 'Test User'])
			git(fixture.repo, ['switch', '-c', 'feature'])
			writeFileSync(join(fixture.repo, 'local.txt'), 'local\n')
			git(fixture.repo, ['add', 'local.txt'])
			git(fixture.repo, ['commit', '-m', 'local feature'])
			git(fixture.repo, ['push', '-u', 'origin', 'feature'])
			git(other, ['fetch', 'origin'])
			git(other, ['switch', 'feature'])
			writeFileSync(join(other, 'remote.txt'), 'remote\n')
			git(other, ['add', 'remote.txt'])
			git(other, ['commit', '-m', 'remote feature'])
			git(other, ['push'])
			writeFileSync(join(fixture.repo, 'local-only.txt'), 'local only\n')
			git(fixture.repo, ['add', 'local-only.txt'])
			git(fixture.repo, ['commit', '-m', 'local only feature'])

			const failures = await runCleanup(cleanupGitProject(fixture.repo))

			expect(failures).toEqual([])
			expect(git(fixture.repo, ['rev-parse', 'HEAD~1']).trim()).toBe(
				git(fixture.repo, ['rev-parse', 'origin/feature']).trim()
			)
			expect(readFileSync(join(fixture.repo, 'local.txt'), 'utf8')).toBe('local\n')
			expect(readFileSync(join(fixture.repo, 'local-only.txt'), 'utf8')).toBe('local only\n')
			expect(readFileSync(join(fixture.repo, 'remote.txt'), 'utf8')).toBe('remote\n')
		})
	})

	it('cleanup refreshes and prunes branches tracking non-origin remotes', async () => {
		await withTempRoot(async root => {
			const fixture = initRemoteRepo(root)
			const other = join(root, 'other')
			git(root, ['clone', fixture.remote, other])
			git(other, ['config', 'user.email', 'test@example.com'])
			git(other, ['config', 'user.name', 'Test User'])
			git(fixture.repo, ['remote', 'add', 'upstream', fixture.remote])
			git(fixture.repo, ['switch', '-c', 'stale'])
			writeFileSync(join(fixture.repo, 'stale.txt'), 'stale\n')
			git(fixture.repo, ['add', 'stale.txt'])
			git(fixture.repo, ['commit', '-m', 'stale'])
			git(fixture.repo, ['push', '-u', 'upstream', 'stale'])
			git(fixture.repo, ['switch', 'main'])
			git(fixture.repo, ['switch', '-c', 'feature'])
			writeFileSync(join(fixture.repo, 'feature.txt'), 'feature\n')
			git(fixture.repo, ['add', 'feature.txt'])
			git(fixture.repo, ['commit', '-m', 'feature'])
			git(fixture.repo, ['push', '-u', 'upstream', 'feature'])
			git(fixture.repo, ['switch', 'main'])
			git(other, ['fetch', 'origin'])
			git(other, ['switch', 'feature'])
			writeFileSync(join(other, 'upstream.txt'), 'upstream\n')
			git(other, ['add', 'upstream.txt'])
			git(other, ['commit', '-m', 'upstream feature'])
			git(other, ['push'])
			git(fixture.repo, ['push', 'upstream', '--delete', 'stale'])

			const failures = await runCleanup(cleanupGitProject(fixture.repo))

			expect(failures).toEqual([])
			expect(git(fixture.repo, ['branch', '--list', 'stale']).trim()).toBe('')
			expect(git(fixture.repo, ['rev-parse', 'feature']).trim()).toBe(
				git(fixture.repo, ['rev-parse', 'upstream/feature']).trim()
			)
		})
	})

	it('cleanup aborts and reports rebase conflicts', async () => {
		await withTempRoot(async root => {
			const fixture = initRemoteRepo(root)
			const other = join(root, 'other')
			git(root, ['clone', fixture.remote, other])
			git(other, ['config', 'user.email', 'test@example.com'])
			git(other, ['config', 'user.name', 'Test User'])
			git(fixture.repo, ['switch', '-c', 'feature'])
			writeFileSync(join(fixture.repo, 'README.md'), 'initial\nlocal\n')
			git(fixture.repo, ['commit', '-am', 'local feature'])
			git(fixture.repo, ['push', '-u', 'origin', 'feature'])
			git(other, ['fetch', 'origin'])
			git(other, ['switch', 'feature'])
			writeFileSync(join(other, 'README.md'), 'initial\nremote\n')
			git(other, ['commit', '-am', 'remote feature'])
			git(other, ['push'])
			writeFileSync(join(fixture.repo, 'README.md'), 'initial\nlocal again\n')
			git(fixture.repo, ['commit', '-am', 'local conflict'])
			const head = git(fixture.repo, ['rev-parse', 'HEAD']).trim()

			const failures = await runCleanup(cleanupGitProject(fixture.repo))

			expect(git(fixture.repo, ['rev-parse', 'HEAD']).trim()).toBe(head)
			expect(git(fixture.repo, ['status', '--porcelain']).trim()).toBe('')
			expect(failures.map(failure => failure.message).join('\n')).toContain('feature: update failed')
		})
	})

	it('keeps cleanup command count independent of branch count for no-op branches', async () => {
		await withTempRoot(async root => {
			const repo = join(root, 'repo')
			const fake = fakeCleanupGit(root)
			const originalPath = process.env['PATH']
			mkdirSync(join(repo, '.git'), {recursive: true})
			process.env['PATH'] = `${fake.bin}:${process.env['PATH'] ?? ''}`
			const started = performance.now()

			try {
				await runCleanup(cleanupGitProject(repo))
				const commands = readFileSync(fake.log, 'utf8').trim().split('\n')

				expect(commands).toHaveLength(8)
				expect(commands.filter(command => command.includes(' fetch --all --prune'))).toHaveLength(1)
				expect(commands.filter(command => command.includes(' for-each-ref '))).toHaveLength(1)
				expect(commands.filter(command => command.includes(' branch-40'))).toHaveLength(0)
				expect(performance.now() - started).toBeLessThan(1_000)
			} finally {
				process.env['PATH'] = originalPath
			}
		})
	})

	it('creates worktrees from local, remote, and new branches', async () => {
		await withTempRoot(async root => {
			const fixture = initRemoteRepo(root)
			const other = join(root, 'other')
			git(root, ['clone', fixture.remote, other])
			git(other, ['switch', '-c', 'remote-only'])
			git(other, ['config', 'user.email', 'test@example.com'])
			git(other, ['config', 'user.name', 'Test User'])
			writeFileSync(join(other, 'remote.txt'), 'remote\n')
			git(other, ['add', 'remote.txt'])
			git(other, ['commit', '-m', 'remote only'])
			git(other, ['push', '-u', 'origin', 'remote-only'])
			git(fixture.repo, ['fetch', 'origin'])
			git(other, ['switch', '-c', 'upstream-only'])
			writeFileSync(join(other, 'upstream.txt'), 'upstream\n')
			git(other, ['add', 'upstream.txt'])
			git(other, ['commit', '-m', 'upstream only'])
			git(other, ['push', '-u', 'origin', 'upstream-only'])
			git(fixture.repo, ['remote', 'add', 'upstream', fixture.remote])
			git(fixture.repo, ['fetch', 'upstream'])
			git(fixture.repo, ['branch', 'local-only'])

			const localWorktree = await runWorkspace(
				root,
				Effect.flatMap(GitWorkspace, service =>
					service.createWorktree({branch: 'local-only', cwd: fixture.repo, source: {_tag: 'local'}})
				)
			)
			const remoteWorktree = await runWorkspace(
				root,
				Effect.flatMap(GitWorkspace, service =>
					service.createWorktree({branch: 'remote-only', cwd: fixture.repo, source: {_tag: 'remote', remote: 'origin'}})
				)
			)
			const upstreamWorktree = await runWorkspace(
				root,
				Effect.flatMap(GitWorkspace, service =>
					service.createWorktree({
						branch: 'upstream-only',
						cwd: fixture.repo,
						source: {_tag: 'remote', remote: 'upstream'}
					})
				)
			)
			const newWorktree = await runWorkspace(
				root,
				Effect.flatMap(GitWorkspace, service =>
					service.createWorktree({branch: 'new-local', cwd: fixture.repo, source: {_tag: 'new'}})
				)
			)

			expect(git(localWorktree, ['branch', '--show-current']).trim()).toBe('local-only')
			expect(git(remoteWorktree, ['branch', '--show-current']).trim()).toBe('remote-only')
			expect(git(remoteWorktree, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).trim()).toBe(
				'origin/remote-only'
			)
			expect(git(upstreamWorktree, ['branch', '--show-current']).trim()).toBe('upstream-only')
			expect(git(upstreamWorktree, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).trim()).toBe(
				'upstream/upstream-only'
			)
			expect(existsSync(newWorktree), newWorktree).toBe(true)
			expect(git(newWorktree, ['branch', '--show-current']).trim()).toBe('new-local')
			expect(git(newWorktree, ['rev-parse', 'HEAD']).trim()).toBe(
				git(fixture.repo, ['rev-parse', 'origin/main']).trim()
			)
		})
	})

	it('commit stages dirty work and creates a local commit', async () => {
		await withTempRoot(async root => {
			const fixture = initRemoteRepo(root)
			git(fixture.repo, ['switch', '-c', 'feature'])
			writeFileSync(join(fixture.repo, 'feature.txt'), 'feature\n')

			await runCommit(
				fixture.repo,
				Effect.flatMap(GitCommitAction, service => service.commit('feature work'))
			)

			expect(git(fixture.repo, ['log', '-1', '--format=%s']).trim()).toBe('feature work')
			expect(git(fixture.repo, ['status', '--porcelain']).trim()).toBe('')
			expect(() => git(fixture.remote, ['rev-parse', 'feature'])).toThrow()
		})
	})

	it('push pushes clean unpushed commits and creates a draft PR', async () => {
		await withTempRoot(async root => {
			const gh = fakeGh(root)
			const originalPath = process.env['PATH']
			const fixture = initRemoteRepo(root)
			process.env['PATH'] = `${gh.bin}:${process.env['PATH'] ?? ''}`
			git(fixture.repo, ['switch', '-c', 'feature'])
			writeFileSync(join(fixture.repo, 'feature.txt'), 'feature\n')
			git(fixture.repo, ['add', 'feature.txt'])
			git(fixture.repo, ['commit', '-m', 'feature work'])
			const head = git(fixture.repo, ['rev-parse', 'HEAD']).trim()

			try {
				await runCommit(
					fixture.repo,
					Effect.flatMap(GitCommitAction, service => service.push())
				)
			} finally {
				process.env['PATH'] = originalPath
			}

			expect(git(fixture.repo, ['rev-parse', 'HEAD']).trim()).toBe(head)
			expect(git(fixture.remote, ['rev-parse', 'feature']).trim()).toBe(head)
			expect(readFileSync(gh.log, 'utf8')).toContain('pr create --draft --fill')
		})
	})

	it('push leaves dirty work untouched while pushing unpushed commits', async () => {
		await withTempRoot(async root => {
			const gh = fakeGh(root)
			const originalPath = process.env['PATH']
			const fixture = initRemoteRepo(root)
			process.env['PATH'] = `${gh.bin}:${process.env['PATH'] ?? ''}`
			git(fixture.repo, ['switch', '-c', 'feature'])
			writeFileSync(join(fixture.repo, 'feature.txt'), 'feature\n')
			git(fixture.repo, ['add', 'feature.txt'])
			git(fixture.repo, ['commit', '-m', 'feature work'])
			const head = git(fixture.repo, ['rev-parse', 'HEAD']).trim()
			writeFileSync(join(fixture.repo, 'dirty.txt'), 'dirty\n')

			try {
				await runCommit(
					fixture.repo,
					Effect.flatMap(GitCommitAction, service => service.push())
				)
			} finally {
				process.env['PATH'] = originalPath
			}

			expect(git(fixture.remote, ['rev-parse', 'feature']).trim()).toBe(head)
			expect(git(fixture.repo, ['status', '--porcelain']).trim()).toBe('?? dirty.txt')
		})
	})

	it('loads and resolves GitHub review threads through fake gh', async () => {
		await withTempRoot(async root => {
			const gh = fakeGhReview(root)
			const originalPath = process.env['PATH']
			process.env['PATH'] = `${gh.bin}:${process.env['PATH'] ?? ''}`

			try {
				const threads = await runReview(
					root,
					Effect.flatMap(GitReview, service => service.reviewThreads)
				)
				await runReview(
					root,
					Effect.flatMap(GitReview, service => service.resolveReviewThread('thread-1'))
				)

				expect(threads).toHaveLength(1)
				expect(threads[0]?.filePath).toBe('src/file.ts')
				expect(threads[0]?.lineNumber).toBe(12)
				expect(threads[0]?.side).toBe('additions')
				expect(readFileSync(gh.log, 'utf8')).toContain('threadId=thread-1')
			} finally {
				process.env['PATH'] = originalPath
			}
		})
	})
})
