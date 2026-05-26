import {Array, Cause, Context, Duration, Effect, FiberHandle, Layer, RcMap, Stream, SubscriptionRef, pipe} from 'effect'

import {Prompt, Response} from 'effect/unstable/ai'

import {RpcContracts} from '#rpcs/contracts.ts'
import type {ModelId, ProviderId} from '@ai-toolkit/ai/catalog'
import type {AgentEvent} from '@ai-toolkit/ai/schema'
import {AgentKey} from '@ai-toolkit/ai/schema'
import {Agent} from '@ai-toolkit/ai/service'
import {makeResumableStream} from '@ai-toolkit/ai/utils'
import {GitWorkspace, GitWorktree} from '@ai-toolkit/git/service'
import {Terminal} from '@ai-toolkit/terminal/service'

const TerminalSessions = RcMap.make({
	idleTimeToLive: Duration.infinity,
	lookup: Effect.fnUntraced(function* (cwd: string) {
		const context = yield* Layer.buildWithScope(Terminal.layer({cwd}), yield* Effect.scope)

		return Context.get(context, Terminal)
	})
})

const GitWorktreeSessions = RcMap.make({
	idleTimeToLive: Duration.minutes(5),
	lookup: Effect.fnUntraced(function* (cwd: string) {
		const context = yield* Layer.buildWithScope(GitWorktree.layer({cwd}), yield* Effect.scope)

		return Context.get(context, GitWorktree)
	})
})

const systemPrompt = Prompt.makeMessage('system', {content: 'You are a coding agent running inside AI Toolkit.'})
const AgentSessions = RcMap.make({
	idleTimeToLive: Duration.minutes(10),
	lookup: Effect.fnUntraced(function* (key: AgentKey) {
		const context = yield* pipe(
			Layer.buildWithScope(Agent.layer({agent: key.agent, cwd: key.cwd, systemPrompt}), yield* Effect.scope),
			Effect.catchTag('ConfigError', Effect.die)
		)
		const agent = Context.get(context, Agent)
		const handle = yield* FiberHandle.make<void, never>()
		const stream = yield* makeResumableStream<AgentEvent>()
		const prompt = Effect.fnUntraced(function* (input: {
			readonly model: ModelId
			readonly prompt: string
			readonly provider: ProviderId
		}) {
			yield* stream.append({prompt: input.prompt, type: 'user-message'})

			yield* FiberHandle.run(
				handle,
				pipe(
					agent.streamText({
						messages: [Prompt.makeMessage('user', {content: [Prompt.makePart('text', {text: input.prompt})]})],
						model: input.model,
						provider: input.provider
					}),
					Stream.catchCause(cause => Stream.make(Response.makePart('error', {error: Cause.pretty(cause)}))),
					Stream.map(part => ({part, type: 'agent-part'}) satisfies AgentEvent),
					Stream.tap(stream.append),
					Stream.runDrain
				)
			)
		})

		return {events: stream.stream, prompt, status: agent.status, stop: FiberHandle.clear(handle)} as const
	})
})
const agentSessionStore = Effect.gen(function* () {
	const sessions = yield* AgentSessions
	const keys = yield* SubscriptionRef.make(Array.empty<AgentKey>())

	return {
		create: Effect.fnUntraced(function* (input: {readonly agent: AgentKey['agent']; readonly cwd: string}) {
			const key = new AgentKey({agent: input.agent, cwd: input.cwd, id: `agent-${crypto.randomUUID()}`})

			yield* pipe(RcMap.get(sessions, key), Effect.asVoid)
			yield* SubscriptionRef.update(keys, Array.append(key))

			return key
		}),
		delete: Effect.fnUntraced(function* (key: AgentKey) {
			yield* SubscriptionRef.update(keys, agents => Array.filter(agents, agent => agent.id !== key.id))
			yield* RcMap.invalidate(sessions, key)
		}),
		get: (key: AgentKey) => RcMap.get(sessions, key),
		watch: Stream.unwrap(
			Effect.gen(function* () {
				const agents = yield* SubscriptionRef.get(keys)

				return Stream.concat(Stream.drop(1)(SubscriptionRef.changes(keys)))(Stream.make(agents))
			})
		)
	} as const
})

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const git = yield* GitWorkspace
		const terminals = yield* TerminalSessions
		const gitWorktrees = yield* GitWorktreeSessions
		const agents = yield* agentSessionStore

		return RpcContracts.of({
			'agent.delete': Effect.fnUntraced(function* (payload) {
				yield* agents.delete(payload.key)
			}),
			'agent.events': payload =>
				Stream.unwrap(
					pipe(
						agents.get(payload.key),
						Effect.map(session => session.events)
					)
				),
			'agent.prompt': Effect.fnUntraced(function* (payload) {
				yield* pipe(
					agents.get(payload.key),
					Effect.flatMap(session => session.prompt(payload))
				)
			}),
			'agent.status': payload =>
				Stream.unwrap(
					Effect.gen(function* () {
						const session = yield* agents.get(payload.key)
						const status = yield* SubscriptionRef.get(session.status)

						return Stream.concat(Stream.drop(1)(SubscriptionRef.changes(session.status)))(Stream.make(status))
					})
				),
			'agent.stop': Effect.fnUntraced(function* (payload) {
				yield* pipe(
					agents.get(payload.key),
					Effect.flatMap(session => session.stop)
				)
			}),
			'agents.create': payload => agents.create(payload),
			'agents.watch': () => agents.watch,
			'projects.branches': payload => git.branches(payload.cwd),
			'projects.createWorktree': payload => git.createWorktree(payload),
			'projects.deleteWorktree': payload => git.deleteWorktree(payload),
			'projects.watch': () =>
				Stream.unwrap(
					pipe(
						SubscriptionRef.get(git.projects),
						Effect.map(projects =>
							Stream.concat(Stream.drop(1)(SubscriptionRef.changes(git.projects)))(Stream.make(projects))
						)
					)
				),
			'review.commitAndPush': payload =>
				pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.commitAndPush({base: payload.base, message: payload.message}))
				),
			'review.createWipCommit': payload =>
				pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.createWipCommit(payload.message))
				),
			'review.discardFile': payload =>
				pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.discardFile(payload.filePath))
				),
			'review.metadata': payload =>
				pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.metadata({base: payload.base}))
				),
			'review.stageFile': payload =>
				pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.stageFile(payload.filePath))
				),
			'review.unstageFile': payload =>
				pipe(
					RcMap.get(gitWorktrees, payload.cwd),
					Effect.flatMap(worktree => worktree.unstageFile(payload.filePath))
				),
			'review.watch': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitWorktrees, payload.cwd),
						Effect.map(worktree => worktree.watchReviewDiffs(payload.scope))
					)
				),
			'review.watchRange': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitWorktrees, payload.cwd),
						Effect.map(worktree => worktree.watchReviewRangeDiffs({from: payload.from, to: payload.to}))
					)
				),
			'terminal.events': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(terminals, payload.cwd),
						Effect.map(terminal => terminal.events)
					)
				),
			'terminal.input': payload =>
				pipe(
					RcMap.get(terminals, payload.cwd),
					Effect.flatMap(terminal => terminal.write(payload.data)),
					Effect.asVoid
				),
			'terminal.resize': payload =>
				pipe(
					RcMap.get(terminals, payload.cwd),
					Effect.flatMap(terminal => terminal.resize({cols: payload.cols, rows: payload.rows}))
				)
		})
	})
)
