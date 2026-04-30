import {Array, Duration, Effect, FileSystem, Order, Predicate, PubSub, pipe, Stream, SubscriptionRef} from 'effect'

import {GitRepository} from '@ai-toolkit/git/schema'
import {Git} from '@ai-toolkit/git/service'

import {BranchesSnapshot, ProjectEntry, ProjectsSnapshot, ReviewSnapshot, RpcContracts} from '#rpcs/contracts.ts'

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const git = yield* Git
		const fs = yield* FileSystem.FileSystem
		const scanRoot = process.env['HOME'] ?? process.cwd()
		const snapshots = yield* PubSub.unbounded<ProjectsSnapshot>()
		const state = yield* SubscriptionRef.make(new ProjectsSnapshot({fetchFailed: false, projects: [], scanRoot}))
		let fetchedAt: number | undefined
		let fetchFailed = false
		const loadSnapshot = Effect.fnUntraced(function* () {
			const loadedProjects = yield* Effect.forEach(
				yield* git.listRepositoriesFrom({cwd: scanRoot}),
				repository =>
					pipe(
						Effect.gen(function* () {
							const discoveredWorktrees = yield* git.listWorktrees({cwd: repository['root']})
							const projectRoot = discoveredWorktrees[0]?.root ?? repository['root']
							const worktrees = pipe(
								discoveredWorktrees,
								Array.sortWith(
									worktree => `${worktree.root === projectRoot ? '0' : '1'}:${worktree.branch ?? ''}:${worktree.root}`,
									Order.String
								)
							)

							return new ProjectEntry({
								repository: new GitRepository({gitDirectory: repository['gitDirectory'], root: projectRoot}),
								worktrees
							})
						}),
						Effect.orElseSucceed(() => undefined)
					),
				{concurrency: 'unbounded'}
			)

			return new ProjectsSnapshot({
				fetchFailed,
				fetchedAt,
				projects: pipe(
					loadedProjects,
					Array.filter(Predicate.isNotUndefined),
					Array.sortWith(project => project['repository']['root'], Order.String)
				),
				scanRoot
			})
		})

		const refresh = Effect.fnUntraced(function* () {
			const nextSnapshot = yield* loadSnapshot()

			yield* SubscriptionRef.set(state, nextSnapshot)
			yield* PubSub.publish(snapshots, nextSnapshot)
		})

		yield* refresh()

		yield* Effect.forkScoped(
			pipe(
				fs.watch(scanRoot),
				Stream.debounce(Duration.millis(250)),
				Stream.tap(() => refresh()),
				Stream.runDrain
			)
		)

		return RpcContracts.of({
			'projects.watch': () =>
				Stream.unwrap(
					Effect.gen(function* () {
						return pipe(Stream.make(yield* SubscriptionRef.get(state)), Stream.concat(Stream.fromPubSub(snapshots)))
					})
				),
			'projects.branches': payload =>
				pipe(
					git.branches(payload),
					Effect.map(result => new BranchesSnapshot(result)),
					Effect.catchTag('GitError', () => Effect.succeed(new BranchesSnapshot({branches: [], defaultBranch: 'main'})))
				),
			'projects.refresh': Effect.fnUntraced(function* () {
				const snapshot = yield* SubscriptionRef.get(state)
				fetchFailed = false
				yield* Effect.forEach(
					snapshot.projects,
					project =>
						pipe(
							git.fetch({cwd: project.repository.root}),
							Effect.catchTag('GitError', () =>
								Effect.sync(() => {
									fetchFailed = true
								})
							)
						),
					{concurrency: 'unbounded'}
				)
				fetchedAt = Date.now()
				yield* refresh()
			}),
			'review.watch': payload =>
				Stream.unwrap(
					Effect.gen(function* () {
						const loadReview = pipe(
							git.reviewDiffs(payload),
							Effect.catchTag('GitError', () => Effect.succeed(Array.empty()))
						)
						const state = yield* Effect.andThen(loadReview, diffs =>
							SubscriptionRef.make(new ReviewSnapshot({cwd: payload.cwd, scope: payload.scope, diffs}))
						)

						yield* Effect.forkScoped(
							pipe(
								fs.watch(payload.cwd),
								Stream.debounce(Duration.millis(50)),
								Stream.tap(() =>
									Effect.flatMap(loadReview, diffs =>
										SubscriptionRef.set(state, new ReviewSnapshot({cwd: payload.cwd, scope: payload.scope, diffs}))
									)
								),
								Stream.runDrain
							)
						)

						return pipe(
							Stream.make(yield* SubscriptionRef.get(state)),
							Stream.concat(pipe(SubscriptionRef.changes(state), Stream.drop(1)))
						)
					})
				),
			'review.stageFile': payload =>
				pipe(
					git.stageFile(payload),
					Effect.catchTag('GitError', () => Effect.void)
				),
			'review.unstageFile': payload =>
				pipe(
					git.unstageFile(payload),
					Effect.catchTag('GitError', () => Effect.void)
				),
			'review.discardFile': payload =>
				pipe(
					git.discardFile(payload),
					Effect.catchTag('GitError', () => Effect.void)
				),
			'projects.createWorktree': payload =>
				pipe(
					Effect.gen(function* () {
						yield* git.createWorktree(payload)
						yield* refresh()
					}),
					Effect.catchTag('GitError', () => Effect.void)
				),
			'projects.deleteWorktree': payload =>
				pipe(
					Effect.gen(function* () {
						yield* git.deleteWorktree(payload)
						yield* refresh()
					}),
					Effect.catchTag('GitError', () => Effect.void)
				)
		})
	})
)
