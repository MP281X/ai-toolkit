import {Array, Duration, Effect, FileSystem, Order, PubSub, pipe, Stream, SubscriptionRef} from 'effect'

import {GitRepository} from '@ai-toolkit/git/schema'
import {Git} from '@ai-toolkit/git/service'

import {ProjectEntry, ProjectsSnapshot, ReviewSnapshot, RpcContracts} from '#rpcs/contracts.ts'

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const git = yield* Git
		const fs = yield* FileSystem.FileSystem
		const scanRoot = process.env['HOME'] ?? process.cwd()
		const snapshots = yield* PubSub.unbounded<ProjectsSnapshot>()
		const state = yield* SubscriptionRef.make(new ProjectsSnapshot({projects: [], scanRoot}))
		const stringOrder = Order.make((left: string, right: string) => {
			if (left > right) {
				return 1
			}

			if (left < right) {
				return -1
			}

			return 0
		})

		const loadSnapshot = Effect.fnUntraced(function* () {
			const repositories = yield* git.listRepositoriesFrom({cwd: scanRoot})
			const loadedProjects = yield* Effect.forEach(
				repositories,
				repository =>
					pipe(
						Effect.gen(function* () {
							const discoveredWorktrees = yield* git.listWorktrees({cwd: repository['root']})
							const projectRoot = discoveredWorktrees[0]?.root ?? repository['root']
							const worktrees = pipe(
								discoveredWorktrees,
								Array.sortWith(
									worktree => `${worktree.root === projectRoot ? '0' : '1'}:${worktree.branch ?? ''}:${worktree.root}`,
									stringOrder
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
			const projects = []

			for (const project of loadedProjects) {
				if (!project) {
					continue
				}

				projects.push(project)
			}

			return new ProjectsSnapshot({
				projects: pipe(
					projects,
					Array.sortWith(project => project['repository']['root'], stringOrder)
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
