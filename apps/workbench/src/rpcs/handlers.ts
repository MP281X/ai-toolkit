import {randomUUID} from 'node:crypto'

import {
	Array,
	Context,
	Duration,
	Effect,
	HashMap,
	Layer,
	Option,
	RcMap,
	Ref,
	Schema,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import {Prompt} from 'effect/unstable/ai'
import {ChildProcess} from 'effect/unstable/process'

import {PublishPullRequestDraft, RpcContracts, TerminalPayload, type AgentSession} from '#rpcs/contracts.ts'
import {AiError, type AgentCommandProfile} from '@deslop/ai/schema'
import {Agent, AgentCommand} from '@deslop/ai/service'
import {GitError} from '@deslop/git/schema'
import {GitPublish, GitReview, GitWorkspace} from '@deslop/git/service'
import {type PortlessPreparedRun, PortlessRun} from '@deslop/portless/schema'
import {Portless} from '@deslop/portless/service'
import {TerminalError, terminalStatusActive} from '@deslop/terminal/schema'
import {Terminal} from '@deslop/terminal/service'

type TerminalSessionInput = {
	readonly command?: ChildProcess.StandardCommand
	readonly cwd: string
	readonly sessionId?: string
}

const AgentSessionKey = Schema.Struct({cwd: Schema.String, uuid: Schema.String})

function terminalStatusDone(state: AgentSession['state']) {
	return !terminalStatusActive(state.state)
}

function portlessScriptKey(input: {readonly cwd: string; readonly sessionId: string}) {
	return `${input.cwd}:${input.sessionId}`
}

function replacePortlessScripts(
	current: HashMap.HashMap<string, PortlessPreparedRun>,
	cwd: string,
	scripts: readonly PortlessPreparedRun[]
) {
	return pipe(
		scripts,
		Array.reduce(
			HashMap.filter(current, script => script.script.cwd !== cwd),
			(next, script) => HashMap.set(next, portlessScriptKey(script.script), script)
		)
	)
}

function removePortlessScript(
	current: HashMap.HashMap<string, PortlessPreparedRun>,
	input: {readonly cwd: string; readonly sessionId?: string}
) {
	if (input.sessionId === undefined) return {current, script: undefined}

	const key = portlessScriptKey({cwd: input.cwd, sessionId: input.sessionId})
	const script = pipe(current, HashMap.get(key), Option.getOrUndefined)
	return {current: HashMap.remove(current, key), script}
}

function makeAgentSession(input: {
	readonly cwd: string
	readonly preparedCommand: ChildProcess.StandardCommand
	readonly profile: AgentCommandProfile
	readonly sessions: HashMap.HashMap<typeof AgentSessionKey.Type, AgentSession>
	readonly uuid: string
}) {
	const labelCount = pipe(
		Array.fromIterable(HashMap.values(input.sessions)),
		Array.filter(agentSession => agentSession.cwd === input.cwd && agentSession.profileId === input.profile.id),
		Array.length
	)

	return {
		args: [...input.preparedCommand.args],
		command: input.preparedCommand.command,
		cwd: input.cwd,
		icon: input.profile.icon,
		label: `${input.profile.label} ${labelCount + 1}`,
		profileId: input.profile.id,
		state: {state: 'starting' as const, title: ''},
		uuid: input.uuid
	}
}

function terminalSessionInput(session: TerminalPayload | TerminalSessionInput): TerminalSessionInput {
	if ('args' in session || 'env' in session) {
		return {
			command:
				session.command === undefined
					? undefined
					: ChildProcess.make(session.command, session.args ?? [], {env: session.env}),
			cwd: session.cwd,
			sessionId: session.sessionId
		}
	}
	if (typeof session.command === 'string') {
		return {command: ChildProcess.make(session.command), cwd: session.cwd, sessionId: session.sessionId}
	}

	return {command: session.command, cwd: session.cwd, sessionId: session.sessionId}
}

const TerminalSessions = RcMap.make({
	idleTimeToLive: Duration.infinity,
	lookup: Effect.fnUntraced(function* (config: TerminalSessionInput) {
		const context = yield* Layer.buildWithScope(Terminal.layer(config), yield* Effect.scope)

		return Context.get(context, Terminal)
	})
})

const GitReviewSessions = RcMap.make({
	idleTimeToLive: Duration.infinity,
	lookup: Effect.fnUntraced(function* (cwd: string) {
		const context = yield* Layer.buildWithScope(GitReview.layer({cwd}), yield* Effect.scope)

		return Context.get(context, GitReview)
	})
})

const GitPublishSessions = RcMap.make({
	idleTimeToLive: Duration.minutes(5),
	lookup: Effect.fnUntraced(function* (cwd: string) {
		const context = yield* Layer.buildWithScope(GitPublish.layer({cwd}), yield* Effect.scope)

		return Context.get(context, GitPublish)
	})
})

const PublishAgentSessions = RcMap.make({
	idleTimeToLive: Duration.minutes(5),
	lookup: Effect.fnUntraced(function* (cwd: string) {
		const context = yield* Layer.buildWithScope(
			Agent.layer({
				agent: 'pi',
				cwd,
				systemPrompt: Prompt.makeMessage('system', {
					content:
						'You write git commit messages for code review workflows. Return exactly one concise commit subject line. Do not use markdown, bullets, quotes, or explanations.'
				}),
				tools: 'none'
			}),
			yield* Effect.scope
		)

		return Context.get(context, Agent)
	})
})

function draftCommitPrompt(input: {
	readonly diffs: readonly {readonly filePath: string; readonly patch: string; readonly status: string}[]
}) {
	const patches = pipe(
		input.diffs,
		Array.map(diff => `${diff.status} ${diff.filePath}\n${diff.patch.slice(0, 12_000)}`),
		Array.join('\n\n')
	)

	return `Write a git commit subject for these current worktree changes.

Rules:
- Return one line only.
- Use imperative mood.
- Be specific about the main user-visible or code-level change.
- Do not include a trailing period.

Diffs:
${patches.slice(0, 40_000)}`
}

function draftPullRequestPrompt(input: {
	readonly branchCommits: readonly {readonly shortHash: string; readonly subject: string}[]
	readonly diffs: readonly {readonly filePath: string; readonly patch: string; readonly status: string}[]
	readonly existing?: {readonly body?: string; readonly title?: string; readonly url: string}
	readonly localCommits: readonly {readonly shortHash: string; readonly subject: string}[]
}) {
	const commits = pipe(
		Array.appendAll(input.branchCommits, input.localCommits),
		Array.map(commit => `- ${commit.shortHash} ${commit.subject}`),
		Array.join('\n')
	)
	const patches = pipe(
		input.diffs,
		Array.map(diff => `${diff.status} ${diff.filePath}\n${diff.patch.slice(0, 8_000)}`),
		Array.join('\n\n')
	)
	const existing =
		input.existing === undefined
			? 'No existing PR metadata.'
			: `Existing title: ${input.existing.title ?? ''}\nExisting body:\n${input.existing.body ?? ''}`

	return `Draft GitHub pull request metadata for this worktree.

Return only JSON matching this shape:
{"title":"short PR title","body":"markdown PR body"}

Rules:
- Title must be concise and specific.
- Body must be markdown.
- Body must include a short Summary section and a Testing section.
- Do not invent tests; if tests are not evident, say "Not run".
- Prefer concrete changed behavior over file-by-file narration.

${existing}

Commits:
${String.isEmpty(commits) ? 'No commits yet.' : commits}

Diffs:
${patches.slice(0, 40_000)}`
}

export const RpcHandlers = RpcContracts.toLayer(
	Effect.gen(function* () {
		const git = yield* GitWorkspace
		const terminals = yield* TerminalSessions
		const gitReviews = yield* GitReviewSessions
		const gitPublishes = yield* GitPublishSessions
		const publishAgents = yield* PublishAgentSessions
		const agentCommand = yield* AgentCommand
		const portless = yield* Portless
		const portlessScripts = yield* Ref.make(HashMap.empty<string, PortlessPreparedRun>())
		const portlessStatusWatchers = yield* Ref.make(new Set<string>())

		const portlessWorktrees = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: Effect.fnUntraced(function* (cwd: string) {
				const scripts = yield* pipe(
					portless.scripts(cwd),
					Effect.mapError(cause => new TerminalError({cause, message: `failed to discover portless scripts in ${cwd}`}))
				)

				yield* Ref.update(portlessScripts, current => replacePortlessScripts(current, cwd, scripts))

				return pipe(
					scripts,
					Array.map(route => new PortlessRun({origin: route.origin, script: route.script, status: route.status}))
				)
			})
		})

		const terminalSession = Effect.fnUntraced(function* (input: TerminalPayload) {
			if (input.sessionId === undefined || input.command !== undefined) return input

			const script = pipe(
				yield* Ref.get(portlessScripts),
				HashMap.get(portlessScriptKey({cwd: input.cwd, sessionId: input.sessionId})),
				Option.getOrUndefined
			)
			if (script === undefined) return input

			return {
				command: ChildProcess.make(script.preparedCommand.command, script.preparedCommand.args, {
					...script.preparedCommand.options,
					env: script.script.env
				}),
				cwd: script.script.cwd,
				sessionId: script.script.sessionId
			}
		})
		const getTerminal = Effect.fnUntraced(function* (input: TerminalPayload) {
			return yield* pipe(
				terminalSession(input),
				Effect.map(terminalSessionInput),
				Effect.flatMap(session => RcMap.get(terminals, session))
			)
		})
		const releasePortlessRoute = Effect.fnUntraced(function* (input: TerminalPayload) {
			const removed = removePortlessScript(yield* Ref.get(portlessScripts), input)
			if (removed.script === undefined) return
			yield* Ref.set(portlessScripts, removed.current)

			const script = removed.script
			yield* portless.remove({cwd: script.script.cwd, sessionId: script.script.sessionId})
		})
		const watchPortlessRoute = Effect.fnUntraced(function* (
			input: TerminalPayload,
			sessionTerminal: {readonly status: SubscriptionRef.SubscriptionRef<AgentSession['state']>}
		) {
			if (input.sessionId === undefined) return
			const script = pipe(
				yield* Ref.get(portlessScripts),
				HashMap.get(portlessScriptKey({cwd: input.cwd, sessionId: input.sessionId})),
				Option.getOrUndefined
			)
			if (script === undefined) return
			const watcherKey = `${script.script.cwd}:${script.script.sessionId}`
			const watching = yield* Ref.modify(portlessStatusWatchers, current => {
				if (current.has(watcherKey)) return [true, current] as const
				const next = new Set(current)
				next.add(watcherKey)
				return [false, next] as const
			})
			if (watching) return

			yield* pipe(
				Stream.make(yield* SubscriptionRef.get(sessionTerminal.status)),
				Stream.concat(Stream.drop(1)(SubscriptionRef.changes(sessionTerminal.status))),
				Stream.takeUntil(state => terminalStatusDone(state)),
				Stream.runForEach(state =>
					terminalStatusDone(state)
						? pipe(
								portless.remove({cwd: script.script.cwd, sessionId: script.script.sessionId}),
								Effect.andThen(
									Ref.update(portlessScripts, current => removePortlessScript(current, script.script).current)
								),
								Effect.andThen(
									Ref.update(portlessStatusWatchers, current => {
										const next = new Set(current)
										next.delete(watcherKey)
										return next
									})
								)
							)
						: Effect.void
				),
				Effect.forkDetach
			)
		})

		const agents = yield* SubscriptionRef.make<HashMap.HashMap<typeof AgentSessionKey.Type, AgentSession>>(
			HashMap.empty()
		)
		const removeAgent = Effect.fnUntraced(function* (payload: typeof AgentSessionKey.Type) {
			const session = pipe(yield* SubscriptionRef.get(agents), HashMap.get(payload), Option.getOrUndefined)
			yield* SubscriptionRef.update(agents, current => HashMap.remove(current, payload))
			if (session === undefined) return

			const input = terminalSessionInput({
				args: session.args,
				command: session.command,
				cwd: session.cwd,
				sessionId: session.uuid
			})
			yield* pipe(
				RcMap.get(terminals, input),
				Effect.flatMap(terminal => terminal.stop()),
				Effect.ignore
			)
			yield* pipe(RcMap.invalidate(terminals, input), Effect.ignore)
		})

		return RpcContracts.of({
			'agents.create': payload =>
				Effect.gen(function* () {
					const preparedCommand = yield* pipe(
						agentCommand.command({cwd: payload.cwd, profileId: payload.profileId}),
						Effect.mapError(cause => new TerminalError({cause, message: cause.message}))
					)
					const profiles = yield* agentCommand.profiles
					const profile = pipe(
						profiles,
						Array.findFirst(candidate => candidate.id === payload.profileId),
						Option.getOrUndefined
					)
					if (profile === undefined) {
						return yield* new TerminalError({message: `Unknown agent profile: ${payload.profileId}`})
					}
					const agentSession = makeAgentSession({
						cwd: payload.cwd,
						preparedCommand,
						profile,
						sessions: yield* SubscriptionRef.get(agents),
						uuid: randomUUID()
					})

					yield* SubscriptionRef.update(agents, sessions =>
						HashMap.set(sessions, AgentSessionKey.make({cwd: agentSession.cwd, uuid: agentSession.uuid}), agentSession)
					)
					const input = yield* terminalSession(
						TerminalPayload.make({
							args: agentSession.args,
							command: agentSession.command,
							cwd: agentSession.cwd,
							sessionId: agentSession.uuid
						})
					).pipe(Effect.map(terminalSessionInput))
					const sessionTerminal = yield* RcMap.get(terminals, input)
					yield* sessionTerminal.restart()
					const key = AgentSessionKey.make({cwd: agentSession.cwd, uuid: agentSession.uuid})
					yield* pipe(
						Effect.scoped(
							pipe(
								Stream.make(yield* SubscriptionRef.get(sessionTerminal.status)),
								Stream.concat(Stream.drop(1)(SubscriptionRef.changes(sessionTerminal.status))),
								Stream.takeUntil(state => terminalStatusDone(state)),
								Stream.runForEach(state =>
									pipe(
										SubscriptionRef.update(agents, sessions =>
											HashMap.modifyAt(
												sessions,
												key,
												Option.match({onNone: () => Option.none(), onSome: session => Option.some({...session, state})})
											)
										),
										Effect.andThen(
											terminalStatusDone(state)
												? pipe(
														SubscriptionRef.update(agents, sessions => HashMap.remove(sessions, key)),
														Effect.andThen(pipe(RcMap.invalidate(terminals, input), Effect.ignore))
													)
												: Effect.void
										)
									)
								)
							)
						),
						Effect.forkDetach
					)

					return agentSession
				}),
			'agents.profiles': () => agentCommand.profiles,
			'agents.remove': payload => removeAgent(AgentSessionKey.make(payload)),
			'agents.watch': payload =>
				Stream.unwrap(
					pipe(
						SubscriptionRef.get(agents),
						Effect.map(current =>
							pipe(
								Stream.make(current),
								Stream.concat(Stream.drop(1)(SubscriptionRef.changes(agents))),
								Stream.map(sessions =>
									pipe(
										Array.fromIterable(HashMap.values(sessions)),
										Array.filter(session => session.cwd === payload.cwd)
									)
								)
							)
						)
					)
				),
			'projects.branches': payload => git.branches(payload.cwd),
			'projects.cleanup': payload => git.cleanup(payload.cwd),
			'projects.createWorktree': payload => git.createWorktree(payload),
			'projects.deleteWorktree': payload =>
				pipe(
					portless.clear(payload.cwd),
					Effect.andThen(RcMap.invalidate(portlessWorktrees, payload.cwd)),
					Effect.andThen(git.deleteWorktree(payload))
				),
			'projects.watch': () => SubscriptionRef.changes(git.projects),
			'publish.approve': payload =>
				pipe(
					RcMap.get(gitPublishes, payload.cwd),
					Effect.flatMap(publish => publish.approve({message: payload.message}))
				),
			'publish.message.generate': payload =>
				Effect.scoped(
					Effect.gen(function* () {
						const review = yield* RcMap.get(gitReviews, payload.cwd)
						const diffs = yield* review.reviewDiffs({_tag: 'changes'})
						if (Array.isReadonlyArrayEmpty(diffs)) {
							return yield* new GitError({message: 'No current changes to summarize.'})
						}
						const agent = yield* RcMap.get(publishAgents, payload.cwd)
						const text = yield* pipe(
							agent.prompt({
								messages: [
									Prompt.makeMessage('user', {content: [Prompt.makePart('text', {text: draftCommitPrompt({diffs})})]})
								],
								model: 'gpt-5.5',
								provider: 'openai-codex',
								thinkingLevel: 'low'
							}),
							Stream.runFold(
								() => '',
								(message: string, part) => (part.type === 'text-delta' ? `${message}${part.delta}` : message)
							),
							Effect.map(message => String.trim(message))
						)

						if (String.isEmpty(text)) return yield* new AiError({message: 'Generated commit message was empty.'})
						return text
					})
				),
			'publish.pr.generate': payload =>
				Effect.scoped(
					Effect.gen(function* () {
						const review = yield* RcMap.get(gitReviews, payload.cwd)
						const publish = yield* RcMap.get(gitPublishes, payload.cwd)
						const metadata = yield* review.metadata()
						const diffs = yield* review.reviewDiffs({_tag: 'branch'})
						if (Array.isReadonlyArrayEmpty(diffs) && Array.isReadonlyArrayEmpty(metadata.branchCommits)) {
							return yield* new GitError({message: 'No branch changes to summarize.'})
						}
						const existing = yield* publish.current()
						const agent = yield* RcMap.get(publishAgents, payload.cwd)
						const text = yield* pipe(
							agent.prompt({
								messages: [
									Prompt.makeMessage('user', {
										content: [
											Prompt.makePart('text', {
												text: draftPullRequestPrompt({
													branchCommits: metadata.branchCommits,
													diffs,
													existing,
													localCommits: metadata.localCommits
												})
											})
										]
									})
								],
								model: 'gpt-5.5',
								provider: 'openai-codex',
								thinkingLevel: 'low'
							}),
							Stream.runFold(
								() => '',
								(message: string, part) => (part.type === 'text-delta' ? `${message}${part.delta}` : message)
							),
							Effect.map(message => String.trim(message))
						)

						return yield* pipe(
							Schema.decodeUnknownEffect(Schema.fromJsonString(PublishPullRequestDraft))(text),
							Effect.mapError(cause => new AiError({cause, message: 'Generated PR draft was not valid JSON.'}))
						)
					})
				),
			'publish.pr.update': payload =>
				pipe(
					RcMap.get(gitPublishes, payload.cwd),
					Effect.flatMap(publish => publish.update({body: payload.body, title: payload.title}))
				),
			'review.comments.resolve': payload =>
				pipe(
					RcMap.get(gitReviews, payload.cwd),
					Effect.flatMap(review =>
						payload.threadId === undefined
							? review.resolveComment({filePath: payload.filePath, lineNumber: payload.lineNumber, side: payload.side})
							: review.resolveReviewThread(payload.threadId)
					)
				),
			'review.comments.save': payload =>
				pipe(
					RcMap.get(gitReviews, payload.cwd),
					Effect.flatMap(review => review.saveComment(payload.comment))
				),
			'review.diffs': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitReviews, payload.cwd),
						Effect.map(review => review.watchReviewDiffs(payload.target))
					)
				),
			'review.metadata': payload =>
				pipe(
					RcMap.get(gitReviews, payload.cwd),
					Effect.flatMap(review => review.metadata())
				),
			'review.state.mark': payload =>
				pipe(
					RcMap.get(gitReviews, payload.cwd),
					Effect.flatMap(review => review.mark(payload.marks))
				),
			'review.state.unmark': payload =>
				pipe(
					RcMap.get(gitReviews, payload.cwd),
					Effect.flatMap(review => review.unmark(payload.marks))
				),
			'review.state.watch': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitReviews, payload.cwd),
						Effect.map(review => review.watchReviewState())
					)
				),
			'runs.portless': payload => RcMap.get(portlessWorktrees, payload.cwd),
			'terminal.attach': payload =>
				Stream.unwrap(
					pipe(
						getTerminal(
							TerminalPayload.make({
								args: payload.args,
								command: payload.command,
								cwd: payload.cwd,
								env: payload.env,
								sessionId: payload.sessionId
							})
						),
						Effect.map(sessionTerminal => sessionTerminal.attach(payload.cursor))
					)
				),
			'terminal.resize': payload =>
				pipe(
					getTerminal(TerminalPayload.make(payload)),
					Effect.flatMap(sessionTerminal => sessionTerminal.resize({cols: payload.cols, rows: payload.rows}))
				),
			'terminal.restart': payload =>
				Effect.gen(function* () {
					const input = TerminalPayload.make(payload)
					const sessionTerminal = yield* getTerminal(input)
					const status = yield* sessionTerminal.restart()
					yield* watchPortlessRoute(input, sessionTerminal)
					return status
				}),
			'terminal.status.watch': payload =>
				Stream.unwrap(
					pipe(
						getTerminal(TerminalPayload.make(payload)),
						Effect.flatMap(sessionTerminal =>
							pipe(
								SubscriptionRef.get(sessionTerminal.status),
								Effect.map(state =>
									pipe(
										Stream.make(state),
										Stream.concat(Stream.drop(1)(SubscriptionRef.changes(sessionTerminal.status)))
									)
								)
							)
						)
					)
				),
			'terminal.stop': payload =>
				Effect.gen(function* () {
					const input = TerminalPayload.make(payload)
					const status = yield* pipe(
						getTerminal(input),
						Effect.flatMap(sessionTerminal => sessionTerminal.stop())
					)
					yield* releasePortlessRoute(input)
					return status
				}),
			'terminal.write': payload =>
				pipe(
					getTerminal(TerminalPayload.make(payload)),
					Effect.flatMap(sessionTerminal => sessionTerminal.write(payload.data))
				)
		})
	})
)
