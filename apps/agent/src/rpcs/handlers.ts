import {
	Array,
	Cause,
	Duration,
	Effect,
	FiberHandle,
	FileSystem,
	Option,
	Order,
	Path,
	Predicate,
	PubSub,
	pipe,
	RcMap,
	Stream,
	String,
	SubscriptionRef
} from 'effect'

import {models} from '@ai-toolkit/ai/catalog'
import {Agent} from '@ai-toolkit/ai/service'
import {makeResumableStream} from '@ai-toolkit/ai/utils'
import {GitRepository} from '@ai-toolkit/git/schema'
import {Git} from '@ai-toolkit/git/service'
import {Prompt, Response} from 'effect/unstable/ai'

import type {AgentEvent} from '#rpcs/contracts.ts'
import {AgentEntry, BranchesSnapshot, ProjectEntry, RpcContracts} from '#rpcs/contracts.ts'

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const git = yield* Git
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const snapshots = yield* PubSub.unbounded<readonly ProjectEntry[]>()
		const state = yield* SubscriptionRef.make(Array.empty<ProjectEntry>())
		const refresh = Effect.fnUntraced(function* () {
			const loadedProjects = yield* pipe(
				git.listRepositoriesFrom({cwd: process.env['HOME'] ?? process.cwd()}),
				Effect.flatMap(
					Effect.forEach(
						repository =>
							pipe(
								git.listWorktrees({cwd: repository['root']}),
								Effect.map(
									discoveredWorktrees =>
										new ProjectEntry({
											repository: new GitRepository({
												gitDirectory: repository['gitDirectory'],
												root: discoveredWorktrees[0]?.root ?? repository['root']
											}),
											worktrees: Array.sortWith(
												discoveredWorktrees,
												worktree =>
													`${worktree.root === (discoveredWorktrees[0]?.root ?? repository['root']) ? '0' : '1'}:${worktree.branch ?? ''}:${worktree.root}`,
												Order.String
											)
										})
								),
								Effect.orElseSucceed(() => undefined)
							),
						{concurrency: 'unbounded'}
					)
				)
			)
			const nextSnapshot = pipe(
				loadedProjects,
				Array.filter(Predicate.isNotUndefined),
				Array.sortWith(project => project['repository']['root'], Order.String)
			)

			yield* SubscriptionRef.set(state, nextSnapshot)
			yield* PubSub.publish(snapshots, nextSnapshot)
		})
		const ignoredFileSearchDirectories = new Set(['.git', 'node_modules', 'dist', '.turbo', '.next', 'coverage'])
		const collectSearchFiles: (
			cwd: string,
			roots: readonly string[],
			files: readonly string[]
		) => Effect.Effect<readonly string[]> = Effect.fnUntraced(function* (cwd, roots, files) {
			return yield* Array.match(roots, {
				onEmpty: () => Effect.succeed(files),
				onNonEmpty: roots => {
					if (Array.length(files) >= 1_000) return Effect.succeed(files)

					const currentRoot = pipe(roots, Array.last, Option.getOrThrow)

					return pipe(
						fs.readDirectory(currentRoot),
						Effect.orElseSucceed(() => Array.empty<string>()),
						Effect.flatMap(entries =>
							pipe(
								entries,
								Array.filter(entry => !(String.startsWith('.')(entry) && entry !== '.github')),
								Effect.forEach(entry => {
									const entryPath = path.join(currentRoot, entry)

									return pipe(
										fs.stat(entryPath),
										Effect.orElseSucceed(() => undefined),
										Effect.map(info => ({entry, entryPath, info}))
									)
								}),
								Effect.flatMap(entries => {
									const state = Array.reduce(entries, {files, roots: Array.dropRight(roots, 1)}, (state, entry) => {
										if (entry.info?.type === 'Directory') {
											return ignoredFileSearchDirectories.has(entry.entry)
												? state
												: {files: state.files, roots: Array.append(state.roots, entry.entryPath)}
										}

										return entry.info?.type === 'File'
											? {files: Array.append(state.files, path.relative(cwd, entry.entryPath)), roots: state.roots}
											: state
									})

									return collectSearchFiles(cwd, state.roots, state.files)
								})
							)
						)
					)
				}
			})
		})
		const agentSessionConfigs = new Map<
			string,
			{layer: AgentEntry['layer']; projectRoot: string; worktreeRoot: string}
		>()
		const agentSessions = new Map<
			string,
			{
				agent: Agent['Service']
				entry: AgentEntry
				handle: FiberHandle.FiberHandle<void, never>
				stream: {
					append: (part: AgentEvent) => import('effect').Effect.Effect<void>
					stream: import('effect').Stream.Stream<AgentEvent>
				}
			}
		>()
		const agentsState = yield* SubscriptionRef.make(Array.empty<AgentEntry>())
		const publishAgents = Effect.fnUntraced(function* () {
			yield* SubscriptionRef.set(
				agentsState,
				pipe(
					Array.fromIterable(agentSessions.values()),
					Array.map(session => session.entry),
					Array.filter(agent => !agent.archived && Predicate.isNotUndefined(agent.firstPromptPreview))
				)
			)
		})
		const systemPrompt = Prompt.makeMessage('system', {content: 'You are a coding agent running inside AI Toolkit.'})
		const agentSessionMap = yield* RcMap.make({
			idleTimeToLive: Duration.minutes(10),
			lookup: (agentId: string) =>
				Effect.acquireRelease(
					Effect.gen(function* () {
						const config = yield* pipe(Effect.fromNullishOr(agentSessionConfigs.get(agentId)), Effect.orDie)
						const agent = yield* pipe(
							Effect.provide(
								Effect.service(Agent),
								{
									codex: Agent.layerCodex({systemPrompt}),
									effect: Agent.layerEffect({systemPrompt})
								}[config.layer]
							),
							Effect.orDie
						)
						const entry = new AgentEntry({
							agentId,
							archived: false,
							layer: config.layer,
							projectRoot: config.projectRoot,
							status: yield* SubscriptionRef.get(agent.status),
							worktreeRoot: config.worktreeRoot
						})
						const handle = yield* FiberHandle.make<void, never>()
						const stream = yield* makeResumableStream<AgentEvent>()
						const session = {agent, entry, handle, stream}

						agentSessions.set(agentId, session)
						yield* publishAgents()

						yield* Effect.forkScoped(
							pipe(
								SubscriptionRef.changes(agent.status),
								Stream.tap(status => {
									session.entry = new AgentEntry({...session.entry, status})
									return publishAgents()
								}),
								Stream.runDrain
							)
						)

						return session
					}),
					session =>
						Effect.gen(function* () {
							agentSessions.delete(session.entry.agentId)
							agentSessionConfigs.delete(session.entry.agentId)
							yield* publishAgents()
						})
				)
		})

		yield* refresh()

		yield* Effect.forkScoped(
			pipe(
				fs.watch(process.env['HOME'] ?? process.cwd()),
				Stream.debounce(Duration.millis(250)),
				Stream.tap(() => refresh()),
				Stream.runDrain
			)
		)

		return RpcContracts.of({
			'projects.watch': () =>
				Stream.unwrap(
					pipe(
						SubscriptionRef.get(state),
						Effect.map(projects => pipe(Stream.make(projects), Stream.concat(Stream.fromPubSub(snapshots))))
					)
				),
			'projects.branches': payload =>
				pipe(
					git.branches(payload),
					Effect.map(result => new BranchesSnapshot(result)),
					Effect.catchTag('GitError', () => Effect.succeed(new BranchesSnapshot({branches: [], defaultBranch: 'main'})))
				),
			'review.watch': payload => git.watchReviewDiffs(payload),
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
			'files.search': payload =>
				pipe(
					collectSearchFiles(payload.cwd, [payload.cwd], []),
					Effect.map(Array.sort(Order.String)),
					Effect.map(Array.take(500))
				),
			'agents.watch': () =>
				Stream.unwrap(
					Effect.gen(function* () {
						const agents = yield* SubscriptionRef.get(agentsState)

						return pipe(Stream.make(agents), Stream.concat(pipe(SubscriptionRef.changes(agentsState), Stream.drop(1))))
					})
				),
			'agents.create': Effect.fnUntraced(function* (payload) {
				const agentId = `agent-${crypto.randomUUID()}`
				agentSessionConfigs.set(agentId, {
					layer: payload.layer,
					projectRoot: payload.projectRoot,
					worktreeRoot: payload.worktreeRoot
				})
				const session = yield* RcMap.get(agentSessionMap, agentId)

				return session.entry
			}),
			'agent.prompt': Effect.fnUntraced(function* (payload) {
				const session = yield* RcMap.get(agentSessionMap, payload.agentId)
				session.entry = new AgentEntry({
					...session.entry,
					firstPromptPreview: session.entry.firstPromptPreview ?? String.slice(0, 120)(payload.prompt)
				})
				yield* publishAgents()
				yield* session.stream.append({prompt: payload.prompt, runId: payload.runId, type: 'user-message'})
				if (
					!Array.some(
						models,
						model =>
							model.model === payload.model &&
							model.provider === payload.provider &&
							Array.contains(model.agents, session.entry.layer)
					)
				) {
					yield* session.stream.append({
						part: Response.makePart('error', {
							error: `${session.entry.layer} does not support ${payload.provider}/${payload.model}`
						}),
						runId: payload.runId,
						type: 'agent-part'
					})
					yield* publishAgents()
					return
				}
				yield* FiberHandle.run(
					session.handle,
					pipe(
						session.agent.streamText({
							messages: [Prompt.makeMessage('user', {content: [Prompt.makePart('text', {text: payload.prompt})]})],
							model: payload.model,
							provider: payload.provider
						}),
						Stream.catchCause(cause => Stream.make(Response.makePart('error', {error: Cause.pretty(cause)}))),
						Stream.map(part => ({part, runId: payload.runId, type: 'agent-part'}) satisfies AgentEvent),
						Stream.tap(session.stream.append),
						Stream.runDrain,
						Effect.catchCause(cause =>
							Effect.gen(function* () {
								yield* session.stream.append({
									part: Response.makePart('error', {error: Cause.pretty(cause)}),
									runId: payload.runId,
									type: 'agent-part'
								})
								yield* publishAgents()
							})
						)
					)
				)
			}),
			'agent.stop': Effect.fnUntraced(function* (payload) {
				const session = yield* RcMap.get(agentSessionMap, payload.agentId)

				yield* FiberHandle.clear(session.handle)
			}),
			'agent.archive': Effect.fnUntraced(function* (payload) {
				const session = yield* RcMap.get(agentSessionMap, payload.agentId)
				session.entry = new AgentEntry({...session.entry, archived: true})
				yield* publishAgents()
				yield* RcMap.invalidate(agentSessionMap, payload.agentId)
			}),
			'agent.events': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(agentSessionMap, payload.agentId),
						Effect.map(session => session.stream.stream)
					)
				),
			'projects.createWorktree': payload =>
				pipe(
					Effect.gen(function* () {
						const worktreeRoot = yield* git.createWorktree(payload)
						yield* refresh()
						return worktreeRoot
					}),
					Effect.catchTag('GitError', () => Effect.succeed(payload.cwd))
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
