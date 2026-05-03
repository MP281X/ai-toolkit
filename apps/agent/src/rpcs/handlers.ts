import type * as EffectTypes from 'effect'
import {
	Array,
	Cause,
	Duration,
	Effect,
	FiberHandle,
	FileSystem,
	Order,
	Path,
	Predicate,
	PubSub,
	pipe,
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

type AgentSession = {
	agent: Agent['Service']
	entry: AgentEntry
	handle: FiberHandle.FiberHandle<void, never>
	stream: {
		append: (part: AgentEvent) => EffectTypes.Effect.Effect<void>
		stream: EffectTypes.Stream.Stream<AgentEvent>
	}
}

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const git = yield* Git
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const scanRoot = process.env['HOME'] ?? process.cwd()
		const snapshots = yield* PubSub.unbounded<readonly ProjectEntry[]>()
		const state = yield* SubscriptionRef.make(Array.empty<ProjectEntry>())
		const refresh = Effect.fnUntraced(function* () {
			const loadedProjects = yield* Effect.forEach(
				yield* git.listRepositoriesFrom({cwd: scanRoot}),
				repository =>
					pipe(
						Effect.gen(function* () {
							const discoveredWorktrees = yield* git.listWorktrees({cwd: repository['root']})
							const projectRoot = discoveredWorktrees[0]?.root ?? repository['root']

							return new ProjectEntry({
								repository: new GitRepository({gitDirectory: repository['gitDirectory'], root: projectRoot}),
								worktrees: pipe(
									discoveredWorktrees,
									Array.sortWith(
										worktree =>
											`${worktree.root === projectRoot ? '0' : '1'}:${worktree.branch ?? ''}:${worktree.root}`,
										Order.String
									)
								)
							})
						}),
						Effect.orElseSucceed(() => undefined)
					),
				{concurrency: 'unbounded'}
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
		const agentSessions = new Map<string, AgentSession>()
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
			'review.watch': payload =>
				Stream.unwrap(
					Effect.gen(function* () {
						const loadReview = pipe(
							git.reviewDiffs(payload),
							Effect.catchTag('GitError', () => Effect.succeed(Array.empty()))
						)
						const state = yield* Effect.andThen(loadReview, SubscriptionRef.make)

						yield* Effect.forkScoped(
							pipe(
								fs.watch(payload.cwd),
								Stream.debounce(Duration.millis(50)),
								Stream.tap(() => Effect.flatMap(loadReview, diffs => SubscriptionRef.set(state, diffs))),
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
			'files.search': Effect.fnUntraced(function* (payload) {
				const roots = [payload.cwd]
				const files = Array.empty<string>()

				while (Array.isArrayNonEmpty(roots) && files.length < 1_000) {
					const currentRoot = roots.pop()
					if (!currentRoot) continue

					for (const entry of yield* pipe(
						fs.readDirectory(currentRoot),
						Effect.orElseSucceed(() => Array.empty<string>())
					)) {
						if (pipe(entry, String.startsWith('.')) && entry !== '.github') continue

						const entryPath = path.join(currentRoot, entry)
						const info = yield* pipe(
							fs.stat(entryPath),
							Effect.orElseSucceed(() => undefined)
						)

						if (info?.type === 'Directory') {
							if (!ignoredFileSearchDirectories.has(entry)) roots.push(entryPath)
							continue
						}

						if (info?.type === 'File') files.push(path.relative(payload.cwd, entryPath))
					}
				}

				return pipe(files, Array.sort(Order.String), Array.take(500))
			}),
			'agents.watch': () =>
				Stream.unwrap(
					Effect.gen(function* () {
						return pipe(
							Stream.make(yield* SubscriptionRef.get(agentsState)),
							Stream.concat(pipe(SubscriptionRef.changes(agentsState), Stream.drop(1)))
						)
					})
				),
			'agents.create': Effect.fnUntraced(function* (payload) {
				const agent = yield* pipe(
					Effect.gen(function* () {
						return yield* Agent
					}),
					Effect.provide(
						{
							codex: Agent.layerCodex({systemPrompt}),
							effect: Agent.layerEffect({systemPrompt}),
							opencode: Agent.layerOpencode({systemPrompt})
						}[payload.layer]
					),
					Effect.orDie
				)
				const entry = new AgentEntry({
					agentId: `agent-${crypto.randomUUID()}`,
					archived: false,
					layer: payload.layer,
					projectRoot: payload.projectRoot,
					status: yield* SubscriptionRef.get(agent.status),
					worktreeRoot: payload.worktreeRoot
				})
				const handle = yield* FiberHandle.make<void, never>()
				const stream = yield* makeResumableStream<AgentEvent>()
				const session = {agent, entry, handle, stream}

				agentSessions.set(entry.agentId, session)

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

				return entry
			}),
			'agent.prompt': Effect.fnUntraced(function* (payload) {
				const session = yield* pipe(Effect.fromNullishOr(agentSessions.get(payload.agentId)), Effect.orDie)
				session.entry = new AgentEntry({
					...session.entry,
					firstPromptPreview: session.entry.firstPromptPreview ?? pipe(payload.prompt, String.slice(0, 120))
				})
				yield* publishAgents()
				yield* session.stream.append({prompt: payload.prompt, runId: payload.runId, type: 'user-message'})
				if (
					!pipe(
						models,
						Array.some(
							model =>
								model.model === payload.model &&
								model.provider === payload.provider &&
								pipe(model.agents, Array.contains(session.entry.layer))
						)
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
				const session = yield* pipe(Effect.fromNullishOr(agentSessions.get(payload.agentId)), Effect.orDie)

				yield* FiberHandle.clear(session.handle)
			}),
			'agent.archive': Effect.fnUntraced(function* (payload) {
				const session = yield* pipe(Effect.fromNullishOr(agentSessions.get(payload.agentId)), Effect.orDie)
				session.entry = new AgentEntry({...session.entry, archived: true})
				yield* publishAgents()
			}),
			'agent.events': payload =>
				Stream.unwrap(
					pipe(
						Effect.fromNullishOr(agentSessions.get(payload.agentId)),
						Effect.orDie,
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
