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
import {Terminal} from '@ai-toolkit/terminal/service'
import {Prompt, Response} from 'effect/unstable/ai'

import type {AgentEvent} from '#rpcs/contracts.ts'
import {AgentEntry, BranchesSnapshot, ProjectEntry, RpcContracts} from '#rpcs/contracts.ts'

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const git = yield* Git
		const terminal = yield* Terminal
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const snapshots = yield* PubSub.unbounded<readonly ProjectEntry[]>()
		const state = yield* SubscriptionRef.make(Array.empty<ProjectEntry>())
		const refresh = Effect.fnUntraced(function* () {
			const nextSnapshot = pipe(
				yield* pipe(
					git.listRepositoriesFrom({cwd: process.env['HOME'] ?? process.cwd()}),
					Effect.flatMap(
						Effect.forEach(
							repository => {
								return pipe(
									git.listWorktrees({cwd: repository['root']}),
									Effect.map(discoveredWorktrees => {
										return new ProjectEntry({
											repository: new GitRepository({
												gitDirectory: repository['gitDirectory'],
												root: discoveredWorktrees[0]?.root ?? repository['root']
											}),
											worktrees: Array.sortWith(
												discoveredWorktrees,
												worktree => {
													return `${worktree.root === (discoveredWorktrees[0]?.root ?? repository['root']) ? '0' : '1'}:${worktree.branch ?? ''}:${worktree.root}`
												},
												Order.String
											)
										})
									}),
									Effect.orElseSucceed(() => undefined)
								)
							},
							{concurrency: 'unbounded'}
						)
					)
				),
				Array.filter(Predicate.isNotUndefined),
				Array.sortWith(project => project['repository']['root'], Order.String)
			)

			yield* SubscriptionRef.set(state, nextSnapshot)
			yield* PubSub.publish(snapshots, nextSnapshot)
		})
		const collectSearchFiles: (
			cwd: string,
			roots: readonly string[],
			files: readonly string[]
		) => Effect.Effect<readonly string[], never, never> = Effect.fnUntraced(function* (cwd, roots, files) {
			return yield* Array.match(roots, {
				onEmpty: () => Effect.succeed(files),
				onNonEmpty: roots => {
					if (Array.length(files) >= 1_000) return Effect.succeed(files)

					const currentRoot = pipe(roots, Array.last, Option.getOrThrow)

					return pipe(
						fs.readDirectory(currentRoot),
						Effect.orElseSucceed(() => Array.empty<string>()),
						Effect.flatMap(entries => {
							return pipe(
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
											return new Set(['.git', 'node_modules', 'dist', '.turbo', '.next', 'coverage']).has(entry.entry)
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
						})
					)
				}
			})
		})
		const agentSessionConfigs = new Map<
			string,
			{
				readonly layer: AgentEntry['layer']
				readonly projectRoot: string
				readonly worktreeRoot: string
			}
		>()
		const agentSessions = new Map<
			string,
			{
				readonly agent: Agent['Service']
				readonly entry: AgentEntry
				readonly handle: FiberHandle.FiberHandle<void, never>
				readonly stream: {
					readonly append: (part: AgentEvent) => Effect.Effect<void, never, never>
					readonly stream: Stream.Stream<AgentEvent>
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
		const setSessionEntry = Effect.fnUntraced(function* (
			session: NonNullable<ReturnType<typeof agentSessions.get>>,
			entry: AgentEntry
		) {
			yield* Effect.sync(() => {
				void agentSessions.set(session.entry.agentId, {
					agent: session.agent,
					entry,
					handle: session.handle,
					stream: session.stream
				} as const satisfies NonNullable<ReturnType<typeof agentSessions.get>>)
			})
			yield* publishAgents()
		})
		const systemPrompt = Prompt.makeMessage('system', {content: 'You are a coding agent running inside AI Toolkit.'})
		const agentSessionMap = yield* RcMap.make({
			idleTimeToLive: Duration.minutes(10),
			lookup: (agentId: string) => {
				return Effect.acquireRelease(
					Effect.gen(function* () {
						const config = yield* pipe(Effect.fromNullishOr(agentSessionConfigs.get(agentId)), Effect.orDie)
						const agent = yield* pipe(
							Effect.service(Agent),
							Effect.provide(
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
						const session = {agent, entry, handle, stream} as const satisfies NonNullable<
							ReturnType<typeof agentSessions.get>
						>

						yield* Effect.sync(() => {
							void agentSessions.set(agentId, session)
						})
						yield* publishAgents()

						yield* Effect.forkScoped(
							pipe(
								SubscriptionRef.changes(agent.status),
								Stream.tap(status => {
									return setSessionEntry(
										session,
										new AgentEntry({...(agentSessions.get(session.entry.agentId)?.entry ?? session.entry), status})
									)
								}),
								Stream.runDrain
							)
						)

						return session
					}),
					session => {
						return Effect.gen(function* () {
							yield* Effect.sync(() => {
								agentSessions.delete(session.entry.agentId)
								agentSessionConfigs.delete(session.entry.agentId)
							})
							yield* publishAgents()
						})
					}
				)
			}
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
			'projects.watch': () => {
				return Stream.unwrap(
					pipe(
						SubscriptionRef.get(state),
						Effect.map(projects => Stream.concat(Stream.fromPubSub(snapshots))(Stream.make(projects)))
					)
				)
			},
			'projects.branches': payload => {
				return pipe(
					git.branches(payload),
					Effect.map(result => new BranchesSnapshot(result)),
					Effect.catchTag('GitError', () => Effect.succeed(new BranchesSnapshot({branches: [], defaultBranch: 'main'})))
				)
			},
			'review.watch': payload => git.watchReviewDiffs(payload),
			'review.stageFile': payload => {
				return pipe(
					git.stageFile(payload),
					Effect.catchTag('GitError', () => Effect.void)
				)
			},
			'review.unstageFile': payload => {
				return pipe(
					git.unstageFile(payload),
					Effect.catchTag('GitError', () => Effect.void)
				)
			},
			'review.discardFile': payload => {
				return pipe(
					git.discardFile(payload),
					Effect.catchTag('GitError', () => Effect.void)
				)
			},
			'files.search': payload => {
				return pipe(
					collectSearchFiles(payload.cwd, [payload.cwd], []),
					Effect.map(Array.sort(Order.String)),
					Effect.map(Array.take(500))
				)
			},
			'agents.watch': () => {
				return Stream.unwrap(
					Effect.gen(function* () {
						const agents = yield* SubscriptionRef.get(agentsState)

						return Stream.concat(Stream.drop(1)(SubscriptionRef.changes(agentsState)))(Stream.make(agents))
					})
				)
			},
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
				yield* setSessionEntry(
					session,
					new AgentEntry({
						...(agentSessions.get(session.entry.agentId)?.entry ?? session.entry),
						firstPromptPreview:
							(agentSessions.get(session.entry.agentId)?.entry ?? session.entry).firstPromptPreview ??
							String.slice(0, 120)(payload.prompt)
					})
				)
				yield* session.stream.append({prompt: payload.prompt, runId: payload.runId, type: 'user-message'})
				if (
					!Array.some(models, model => {
						return (
							model.model === payload.model &&
							model.provider === payload.provider &&
							Array.contains(model.agents, (agentSessions.get(session.entry.agentId)?.entry ?? session.entry).layer)
						)
					})
				) {
					yield* session.stream.append({
						part: Response.makePart('error', {
							error: `${(agentSessions.get(session.entry.agentId)?.entry ?? session.entry).layer} does not support ${payload.provider}/${payload.model}`
						}),
						runId: payload.runId,
						type: 'agent-part'
					})
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
						Effect.catchCause(cause => {
							return Effect.gen(function* () {
								yield* session.stream.append({
									part: Response.makePart('error', {error: Cause.pretty(cause)}),
									runId: payload.runId,
									type: 'agent-part'
								})
								yield* publishAgents()
							})
						})
					)
				)
			}),
			'agent.stop': Effect.fnUntraced(function* (payload) {
				const session = yield* RcMap.get(agentSessionMap, payload.agentId)

				yield* FiberHandle.clear(session.handle)
			}),
			'agent.archive': Effect.fnUntraced(function* (payload) {
				const session = yield* RcMap.get(agentSessionMap, payload.agentId)
				yield* setSessionEntry(
					session,
					new AgentEntry({...(agentSessions.get(session.entry.agentId)?.entry ?? session.entry), archived: true})
				)
				yield* RcMap.invalidate(agentSessionMap, payload.agentId)
			}),
			'agent.events': payload => {
				return Stream.unwrap(
					pipe(
						RcMap.get(agentSessionMap, payload.agentId),
						Effect.map(session => session.stream.stream)
					)
				)
			},
			'projects.createWorktree': payload => {
				return pipe(
					Effect.gen(function* () {
						const worktreeRoot = yield* git.createWorktree(payload)
						yield* refresh()
						return worktreeRoot
					}),
					Effect.catchTag('GitError', () => Effect.succeed(payload.cwd))
				)
			},
			'projects.deleteWorktree': payload => {
				return pipe(
					Effect.gen(function* () {
						yield* git.deleteWorktree(payload)
						yield* refresh()
					}),
					Effect.catchTag('GitError', () => Effect.void)
				)
			},
			'terminal.events': payload => terminal.events(payload),
			'terminal.input': payload => terminal.write(payload),
			'terminal.resize': payload => terminal.resize(payload)
		})
	})
)
