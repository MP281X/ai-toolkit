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
	Schedule,
	Schema,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import {Prompt} from 'effect/unstable/ai'
import {ChildProcess} from 'effect/unstable/process'

import {
	AgentSession,
	HomeSidebar,
	RpcContracts,
	SidebarProject,
	SidebarWorktree,
	TerminalPayload
} from '#rpcs/contracts.ts'
import type {ScriptRun} from '#rpcs/contracts.ts'
import {discoverPackageScripts} from '#rpcs/scripts.ts'
import {AiError} from '@deslop/ai/schema'
import type {AgentCommandProfile} from '@deslop/ai/schema'
import {Agent, AgentCommand} from '@deslop/ai/service'
import {GitError, GitReviewChangesTarget} from '@deslop/git/schema'
import {GitPublish, GitReview, GitWorkspace} from '@deslop/git/service'
import {PortlessRun} from '@deslop/portless/schema'
import type {PortlessPreparedRun} from '@deslop/portless/schema'
import {Portless} from '@deslop/portless/service'
import {TerminalError, TerminalStatus, terminalStatusActive} from '@deslop/terminal/schema'
import {Terminal} from '@deslop/terminal/service'
import {Usage} from '@deslop/usage/service'

const TerminalCommand = Schema.declare<ChildProcess.StandardCommand>(
	(input): input is ChildProcess.StandardCommand =>
		ChildProcess.isCommand(input) && ChildProcess.isStandardCommand(input)
)

class AgentSessionKey extends Schema.Class<AgentSessionKey>('AgentSessionKey')({
	cwd: Schema.String,
	uuid: Schema.String
}) {}

class TerminalSession extends Schema.Class<TerminalSession>('TerminalSession')({
	command: Schema.optional(TerminalCommand),
	cwd: Schema.String,
	sessionId: Schema.optional(Schema.String)
}) {}

function terminalStatusDone(state: AgentSession['state']) {
	return !terminalStatusActive(state.state)
}

function portlessScriptKey(input: {readonly cwd: string; readonly sessionId: string}) {
	return `${input.cwd}:${input.sessionId}`
}

function terminalStatusKey(input: TerminalPayload) {
	return input.sessionId === undefined ? input.cwd : portlessScriptKey({cwd: input.cwd, sessionId: input.sessionId})
}

function replacePortlessScripts(
	current: HashMap.HashMap<string, PortlessPreparedRun>,
	cwd: string,
	scripts: readonly PortlessPreparedRun[]
) {
	return Array.reduce(
		scripts,
		HashMap.filter(current, script => script.script.cwd !== cwd),
		(next, script) => HashMap.set(next, portlessScriptKey(script.script), script)
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

function replacePackageScripts(
	current: HashMap.HashMap<
		string,
		ScriptRun & {readonly cwd: string; readonly preparedCommand: ChildProcess.StandardCommand}
	>,
	cwd: string,
	scripts: readonly ScriptRun[]
) {
	return Array.reduce(
		scripts,
		HashMap.filter(current, script => script.cwd !== cwd),
		(next, script) =>
			HashMap.set(next, portlessScriptKey({cwd, sessionId: script.sessionId}), {
				...script,
				cwd,
				preparedCommand: ChildProcess.make('vp', ['run', script.taskId], {cwd})
			})
	)
}

function removePackageScripts(
	current: HashMap.HashMap<
		string,
		ScriptRun & {readonly cwd: string; readonly preparedCommand: ChildProcess.StandardCommand}
	>,
	cwd: string
) {
	return HashMap.filter(current, script => script.cwd !== cwd)
}

function makeAgentSession(input: {
	readonly cwd: string
	readonly preparedCommand: ChildProcess.StandardCommand
	readonly profile: AgentCommandProfile
	readonly sessions: HashMap.HashMap<AgentSessionKey, AgentSession>
	readonly uuid: string
}) {
	const labelCount = pipe(
		Array.fromIterable(HashMap.values(input.sessions)),
		Array.filter(agentSession => agentSession.cwd === input.cwd && agentSession.profileId === input.profile.id),
		Array.length
	)

	return new AgentSession({
		args: [...input.preparedCommand.args],
		command: input.preparedCommand.command,
		cwd: input.cwd,
		icon: input.profile.icon,
		label: `${input.profile.label} ${labelCount + 1}`,
		profileId: input.profile.id,
		state: new TerminalStatus({state: 'starting', title: ''}),
		uuid: input.uuid
	})
}

function terminalSessionInput(session: TerminalPayload | TerminalSession) {
	if (session instanceof TerminalSession) return session
	return new TerminalSession({
		command:
			session.command === undefined
				? undefined
				: ChildProcess.make(session.command, session.args ?? [], {env: session.env}),
		cwd: session.cwd,
		sessionId: session.sessionId
	})
}

const TerminalSessions = RcMap.make({
	idleTimeToLive: Duration.infinity,
	lookup: Effect.fnUntraced(function* (config: TerminalSession) {
		const context = yield* Layer.buildWithScope(Terminal.layer(config), yield* Effect.scope)

		return Context.get(context, Terminal)
	})
})

const GitReviewSessions = RcMap.make({
	idleTimeToLive: Duration.minutes(10),
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
						'You write minimal, useful git commit messages. Return only commit message text. Do not use markdown fences, quotes, or explanations.'
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
	readonly recentSubjects: readonly string[]
}) {
	const patches = pipe(
		input.diffs,
		Array.map(diff => `${diff.status} ${diff.filePath}\n${diff.patch}`),
		Array.join('\n\n')
	)
	const styleExamples = Array.isReadonlyArrayEmpty(input.recentSubjects)
		? ''
		: `\n\nRecent commit subjects from this repository, match their style and vocabulary:\n${pipe(
				input.recentSubjects,
				Array.map(subject => `- ${subject}`),
				Array.join('\n')
			)}`

	return `Write a git commit message for these current worktree changes.

Rules:
- Return exactly a commit message, with no markdown or commentary.
- First line: <type>: <imperative summary>
- The subject states the objective or end result of the whole diff, not a single file or a step.
- The summary after the type prefix must be <= 50 characters.
- Types are limited to feat, fix, refactor, perf, chore, docs, test, ci, style.
- Body: blank line, then "- " bullets with only the most important points of the change.
- Before writing the body, rank every candidate point by how much a reader needs it; keep the highest-value points and drop the rest, at most 5 bullets.
- A point earns a bullet when it changes behavior, an API, or a workflow a reader relies on; refactors, cleanups, and mechanical edits do not.
- Order bullets from most to least important.
- A bullet is a short, plain statement of the resulting behavior or change, readable at a glance by a technical reader.
- Bullets state what changed or what the new behavior is, never how it was implemented.
- Merge related edits into one point.
- A single small change gets a subject only, with no body.
- Use imperative mood and no trailing period in the subject or bullets.
- Prefer concrete nouns from the changed code over vague verbs like support, improve, update, or draft.${styleExamples}

Diffs:
${patches}`
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
		const usage = yield* Usage
		const portlessScripts = yield* Ref.make(HashMap.empty<string, PortlessPreparedRun>())
		const packageScripts = yield* Ref.make(
			HashMap.empty<
				string,
				ScriptRun & {readonly cwd: string; readonly preparedCommand: ChildProcess.StandardCommand}
			>()
		)
		const portlessStatusWatchers = yield* Ref.make(new Set<string>())
		const runStatuses = yield* SubscriptionRef.make(HashMap.empty<string, AgentSession['state']>())
		const resolvedTerminals = yield* Ref.make(HashMap.empty<string, TerminalSession>())

		const portlessWorktrees = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: Effect.fnUntraced(function* (cwd: string) {
				const scripts = yield* Effect.mapError(
					portless.scripts(cwd),
					cause => new TerminalError({cause, message: `failed to discover portless scripts in ${cwd}`})
				)

				yield* Ref.update(portlessScripts, current => replacePortlessScripts(current, cwd, scripts))

				return Array.map(
					scripts,
					route => new PortlessRun({origin: route.origin, script: route.script, status: route.status})
				)
			})
		})
		const scriptWorktrees = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: Effect.fnUntraced(function* (cwd: string) {
				const scripts = yield* Effect.mapError(
					discoverPackageScripts(cwd),
					cause => new TerminalError({cause, message: `failed to discover package scripts in ${cwd}`})
				)

				yield* Ref.update(packageScripts, current => replacePackageScripts(current, cwd, scripts))

				return scripts
			})
		})

		const terminalSession = Effect.fnUntraced(function* (input: TerminalPayload) {
			if (input.sessionId === undefined || input.command !== undefined) return terminalSessionInput(input)

			const scriptKey = portlessScriptKey({cwd: input.cwd, sessionId: input.sessionId})
			const portlessScript = yield* Effect.gen(function* () {
				const current = pipe(yield* Ref.get(portlessScripts), HashMap.get(scriptKey), Option.getOrUndefined)
				if (current !== undefined) return current
				yield* Effect.withSpan(RcMap.get(portlessWorktrees, input.cwd), 'Workbench.Portless.prepareTerminalSession')
				return pipe(yield* Ref.get(portlessScripts), HashMap.get(scriptKey), Option.getOrUndefined)
			})
			if (portlessScript !== undefined) {
				return new TerminalSession({
					command: ChildProcess.make(portlessScript.preparedCommand.command, portlessScript.preparedCommand.args, {
						...portlessScript.preparedCommand.options,
						env: portlessScript.script.env
					}),
					cwd: portlessScript.script.cwd,
					sessionId: portlessScript.script.sessionId
				})
			}

			const packageScript = yield* Effect.gen(function* () {
				const current = pipe(yield* Ref.get(packageScripts), HashMap.get(scriptKey), Option.getOrUndefined)
				if (current !== undefined) return current
				yield* Effect.withSpan(RcMap.get(scriptWorktrees, input.cwd), 'Workbench.Scripts.prepareTerminalSession')
				return pipe(yield* Ref.get(packageScripts), HashMap.get(scriptKey), Option.getOrUndefined)
			})
			if (packageScript !== undefined) {
				return new TerminalSession({
					command: packageScript.preparedCommand,
					cwd: packageScript.cwd,
					sessionId: packageScript.sessionId
				})
			}

			return yield* new TerminalError({message: `failed to resolve script ${input.sessionId} in ${input.cwd}`})
		})
		const getTerminal = Effect.fnUntraced(function* (input: TerminalPayload) {
			const session = yield* terminalSession(input)
			yield* Ref.update(resolvedTerminals, current => HashMap.set(current, terminalStatusKey(input), session))
			return yield* Effect.mapError(RcMap.get(terminals, session), cause =>
				cause instanceof TerminalError ? cause : new TerminalError({cause})
			)
		})
		const releasePortlessRoute = Effect.fnUntraced(function* (input: TerminalPayload) {
			const removed = removePortlessScript(yield* Ref.get(portlessScripts), input)
			if (removed.script === undefined) return
			yield* Ref.set(portlessScripts, removed.current)

			yield* portless.remove({cwd: removed.script.script.cwd, sessionId: removed.script.script.sessionId})
			yield* RcMap.invalidate(portlessWorktrees, removed.script.script.cwd)
			yield* RcMap.invalidate(scriptWorktrees, removed.script.script.cwd)
		})
		const watchRunStatus = Effect.fnUntraced(function* (
			input: TerminalPayload,
			sessionTerminal: {readonly status: SubscriptionRef.SubscriptionRef<AgentSession['state']>}
		) {
			if (input.sessionId === undefined) return
			const statusKey = portlessScriptKey({cwd: input.cwd, sessionId: input.sessionId})
			const watching = yield* Ref.modify(portlessStatusWatchers, current => {
				if (current.has(statusKey)) return [true, current] as const
				return [false, new Set(Array.append(Array.fromIterable(current), statusKey))] as const
			})
			if (watching) return

			yield* Effect.forkDetach(
				pipe(
					SubscriptionRef.changes(sessionTerminal.status),
					Stream.takeUntil(terminalStatusDone),
					Stream.runForEach(state =>
						Effect.andThen(
							SubscriptionRef.update(runStatuses, current => HashMap.set(current, statusKey, state)),
							Effect.gen(function* () {
								if (!terminalStatusDone(state)) return

								const removed = removePortlessScript(yield* Ref.get(portlessScripts), input)
								if (removed.script !== undefined) {
									yield* Ref.set(portlessScripts, removed.current)
									yield* portless.remove({cwd: removed.script.script.cwd, sessionId: removed.script.script.sessionId})
									yield* RcMap.invalidate(portlessWorktrees, removed.script.script.cwd)
									yield* RcMap.invalidate(scriptWorktrees, removed.script.script.cwd)
								}
								yield* Ref.update(portlessStatusWatchers, current => {
									const next = new Set(current)
									next.delete(statusKey)
									return next
								})
							})
						)
					)
				)
			)
		})

		const currentAgentSessions = Effect.fnUntraced(function* (cwd: string) {
			return Array.filter(
				Array.fromIterable(HashMap.values(yield* SubscriptionRef.get(agents))),
				session => session.cwd === cwd
			)
		})

		const sidebarSnapshot = Effect.fnUntraced(function* () {
			const profiles = yield* agentCommand.profiles
			const statuses = yield* SubscriptionRef.get(runStatuses)
			const sidebarProjects = yield* Effect.flatMap(SubscriptionRef.get(git.projects), snapshot =>
				Effect.forEach(
					snapshot,
					project =>
						Effect.gen(function* () {
							const worktrees = yield* Effect.forEach(
								project.worktrees,
								worktree =>
									Effect.gen(function* () {
										const portlessRuns = yield* RcMap.get(portlessWorktrees, worktree.root)
										const packageRuns = yield* RcMap.get(scriptWorktrees, worktree.root)
										return new SidebarWorktree({
											agents: yield* currentAgentSessions(worktree.root),
											branch: worktree.branch,
											portlessRuns,
											root: worktree.root,
											runStatuses: Object.fromEntries(
												Array.map(
													Array.appendAll(
														Array.map(packageRuns, run => run.sessionId),
														Array.map(portlessRuns, run => run.script.sessionId)
													),
													sessionId => [
														sessionId,
														pipe(
															statuses,
															HashMap.get(portlessScriptKey({cwd: worktree.root, sessionId})),
															Option.getOrElse(() => new TerminalStatus({state: 'idle', title: ''}))
														)
													]
												)
											),
											scriptRuns: packageRuns
										})
									}),
								{concurrency: 8}
							)
							return new SidebarProject({repository: project.repository, worktrees})
						}),
					{concurrency: 8}
				)
			)

			return new HomeSidebar({agentProfiles: profiles, projects: sidebarProjects})
		})

		const agents = yield* SubscriptionRef.make<HashMap.HashMap<AgentSessionKey, AgentSession>>(HashMap.empty())
		const removeAgent = Effect.fnUntraced(function* (payload: AgentSessionKey) {
			const session = pipe(yield* SubscriptionRef.get(agents), HashMap.get(payload), Option.getOrUndefined)
			yield* SubscriptionRef.update(agents, current => HashMap.remove(current, payload))
			if (session === undefined) return

			const input = terminalSessionInput(
				TerminalPayload.make({args: session.args, command: session.command, cwd: session.cwd, sessionId: session.uuid})
			)
			yield* RcMap.invalidate(terminals, input)
			yield* Ref.update(resolvedTerminals, current =>
				HashMap.remove(current, portlessScriptKey({cwd: payload.cwd, sessionId: payload.uuid}))
			)
		})

		return RpcContracts.of({
			agents: payload =>
				Stream.unwrap(
					Effect.map(SubscriptionRef.get(agents), current =>
						pipe(
							Stream.make(current),
							Stream.concat(Stream.drop(1)(SubscriptionRef.changes(agents))),
							Stream.map(sessions =>
								Array.filter(Array.fromIterable(HashMap.values(sessions)), session => session.cwd === payload.cwd)
							)
						)
					)
				),
			'agents.create': payload =>
				Effect.gen(function* () {
					const preparedCommand = yield* Effect.mapError(
						agentCommand.command({cwd: payload.cwd, profileId: payload.profileId}),
						cause => new TerminalError({cause, message: cause.message})
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
					)
					yield* Ref.update(resolvedTerminals, sessions =>
						HashMap.set(sessions, portlessScriptKey({cwd: agentSession.cwd, sessionId: agentSession.uuid}), input)
					)
					const sessionTerminal = yield* Effect.mapError(RcMap.get(terminals, input), cause =>
						cause instanceof TerminalError ? cause : new TerminalError({cause})
					)
					yield* sessionTerminal.restart()
					const key = AgentSessionKey.make({cwd: agentSession.cwd, uuid: agentSession.uuid})
					yield* Effect.forkDetach(
						Effect.scoped(
							pipe(
								SubscriptionRef.changes(sessionTerminal.status),
								Stream.takeUntil(terminalStatusDone),
								Stream.runForEach(state =>
									Effect.andThen(
										SubscriptionRef.update(agents, sessions =>
											HashMap.modifyAt(
												sessions,
												key,
												Option.match({
													onNone: () => Option.none(),
													onSome: session => Option.some(new AgentSession({...session, state}))
												})
											)
										),
										terminalStatusDone(state)
											? pipe(
													SubscriptionRef.update(agents, sessions => HashMap.remove(sessions, key)),
													Effect.andThen(RcMap.invalidate(terminals, input)),
													Effect.andThen(
														Ref.update(resolvedTerminals, sessions =>
															HashMap.remove(
																sessions,
																portlessScriptKey({cwd: agentSession.cwd, sessionId: agentSession.uuid})
															)
														)
													)
												)
											: Effect.void
									)
								)
							)
						)
					)

					return agentSession
				}),
			'agents.profiles': () => agentCommand.profiles,
			'agents.remove': payload => removeAgent(AgentSessionKey.make(payload)),
			'home.sidebar': () =>
				pipe(
					Stream.merge(SubscriptionRef.changes(git.projects), SubscriptionRef.changes(agents)),
					Stream.merge(SubscriptionRef.changes(runStatuses)),
					Stream.mapEffect(sidebarSnapshot),
					Stream.changes
				),
			projects: () => SubscriptionRef.changes(git.projects),
			'projects.branches': payload => git.branches(payload.cwd),
			'projects.createWorktree': payload =>
				Effect.mapError(git.createWorktree(payload), cause =>
					cause instanceof GitError ? cause : new GitError({cause})
				),
			'projects.deleteWorktree': payload =>
				pipe(
					portless.clear(payload.cwd),
					Effect.andThen(RcMap.invalidate(portlessWorktrees, payload.cwd)),
					Effect.andThen(RcMap.invalidate(scriptWorktrees, payload.cwd)),
					Effect.andThen(Ref.update(packageScripts, current => removePackageScripts(current, payload.cwd))),
					Effect.andThen(git.deleteWorktree(payload)),
					Effect.mapError(cause => (cause instanceof GitError ? cause : new GitError({cause})))
				),
			'projects.fix': payload =>
				Effect.mapError(git.fix(payload.cwd), cause => (cause instanceof GitError ? cause : new GitError({cause}))),
			'publish.approve': payload =>
				Effect.flatMap(RcMap.get(gitPublishes, payload.cwd), publish => publish.approve({message: payload.message})),
			'publish.message.generate': payload =>
				Effect.scoped(
					Effect.gen(function* () {
						const review = yield* Effect.mapError(RcMap.get(gitReviews, payload.cwd), cause => new GitError({cause}))
						const diffs = yield* Effect.mapError(review.reviewDiffs(new GitReviewChangesTarget({})), cause =>
							cause instanceof GitError ? cause : new GitError({cause})
						)
						if (Array.isReadonlyArrayEmpty(diffs)) {
							return yield* new GitError({message: 'No current changes to summarize.'})
						}
						const metadata = yield* Effect.mapError(review.metadata(), cause =>
							cause instanceof GitError ? cause : new GitError({cause})
						)
						const recentSubjects = pipe(
							Array.appendAll(metadata.localCommits, metadata.branchCommits),
							Array.take(10),
							Array.map(commit => commit.subject)
						)
						const agent = yield* RcMap.get(publishAgents, payload.cwd)
						const text = yield* pipe(
							agent.prompt({
								messages: [
									Prompt.makeMessage('user', {
										content: [Prompt.makePart('text', {text: draftCommitPrompt({diffs, recentSubjects})})]
									})
								],
								model: 'gpt-5.5',
								provider: 'openai-codex',
								thinkingLevel: 'low'
							}),
							Stream.runFold(
								() => '',
								(message, part) => (part.type === 'text-delta' ? `${message}${part.delta}` : message)
							),
							Effect.map(String.trim)
						)

						if (String.isEmpty(text)) return yield* new AiError({message: 'Generated commit message was empty.'})
						return text
					})
				),
			'review.comments.resolve': payload =>
				Effect.flatMap(RcMap.get(gitReviews, payload.cwd), review =>
					payload.threadId === undefined
						? review.resolveComment({filePath: payload.filePath, lineNumber: payload.lineNumber, side: payload.side})
						: review.resolveReviewThread(payload.threadId)
				),
			'review.comments.save': payload =>
				Effect.flatMap(RcMap.get(gitReviews, payload.cwd), review => review.saveComment(payload.comment)),
			'review.diffs': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitReviews, payload.cwd),
						Effect.mapError(cause => new GitError({cause})),
						Effect.map(review =>
							Stream.mapError(review.watchReviewDiffs(payload.target), cause => new GitError({cause}))
						)
					)
				),
			'review.fileContent': payload =>
				Effect.flatMap(
					Effect.mapError(RcMap.get(gitReviews, payload.cwd), cause => new GitError({cause})),
					review =>
						Effect.mapError(
							review.fileContent({filePath: payload.filePath, target: payload.target}),
							cause => new GitError({cause})
						)
				),
			'review.metadata': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitReviews, payload.cwd),
						Effect.mapError(cause => new GitError({cause})),
						Effect.map(review => Stream.mapError(review.watchReviewMetadata(), cause => new GitError({cause})))
					)
				),
			'review.state': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitReviews, payload.cwd),
						Effect.mapError(cause => new GitError({cause})),
						Effect.map(review => Stream.mapError(review.watchReviewState(), cause => new GitError({cause})))
					)
				),
			'review.state.mark': payload =>
				Effect.flatMap(RcMap.get(gitReviews, payload.cwd), review => review.mark(payload.marks)),
			'review.state.unmark': payload =>
				Effect.flatMap(RcMap.get(gitReviews, payload.cwd), review => review.unmark(payload.marks)),
			'runs.portless': payload => RcMap.get(portlessWorktrees, payload.cwd),
			'runs.scripts': payload => RcMap.get(scriptWorktrees, payload.cwd),
			'terminal.attach': payload =>
				Stream.unwrap(
					Effect.map(getTerminal(TerminalPayload.make(payload)), sessionTerminal =>
						sessionTerminal.attach(
							payload.cols === undefined || payload.rows === undefined
								? undefined
								: {cols: payload.cols, rows: payload.rows}
						)
					)
				),
			'terminal.resize': payload =>
				Effect.flatMap(getTerminal(TerminalPayload.make(payload)), sessionTerminal =>
					sessionTerminal.resize({cols: payload.cols, rows: payload.rows})
				),
			'terminal.restart': payload =>
				Effect.gen(function* () {
					const input = TerminalPayload.make(payload)
					const sessionTerminal = yield* getTerminal(input)
					const status = yield* sessionTerminal.restart()
					if (input.sessionId !== undefined) {
						const statusKey = portlessScriptKey({cwd: input.cwd, sessionId: input.sessionId})
						yield* SubscriptionRef.update(runStatuses, current => HashMap.set(current, statusKey, status))
					}
					yield* watchRunStatus(input, sessionTerminal)
					return status
				}),
			'terminal.status': payload =>
				Stream.unwrap(
					Effect.gen(function* () {
						const input = TerminalPayload.make(payload)
						const statusKey = terminalStatusKey(input)
						const session = pipe(yield* Ref.get(resolvedTerminals), HashMap.get(statusKey), Option.getOrUndefined)
						const activeSession =
							session === undefined
								? false
								: Array.some(Array.fromIterable(yield* RcMap.keys(terminals)), current => current === session)
						if (!activeSession || session === undefined) {
							const idle = pipe(
								yield* SubscriptionRef.get(runStatuses),
								HashMap.get(statusKey),
								Option.getOrElse(() => new TerminalStatus({state: 'idle', title: ''}))
							)
							return Stream.concat(
								Stream.make(idle),
								pipe(
									SubscriptionRef.changes(runStatuses),
									Stream.map(statuses =>
										pipe(
											statuses,
											HashMap.get(statusKey),
											Option.getOrElse(() => new TerminalStatus({state: 'idle', title: ''}))
										)
									),
									Stream.changes
								)
							)
						}

						const sessionTerminal = yield* Effect.mapError(RcMap.get(terminals, session), cause =>
							cause instanceof TerminalError ? cause : new TerminalError({cause})
						)
						const state = yield* SubscriptionRef.get(sessionTerminal.status)
						return Stream.concat(Stream.make(state), SubscriptionRef.changes(sessionTerminal.status))
					})
				),
			'terminal.stop': payload =>
				Effect.gen(function* () {
					const input = TerminalPayload.make(payload)
					const status = yield* Effect.flatMap(getTerminal(input), sessionTerminal => sessionTerminal.stop())
					if (input.sessionId !== undefined) {
						const statusKey = portlessScriptKey({cwd: input.cwd, sessionId: input.sessionId})
						yield* SubscriptionRef.update(runStatuses, current => HashMap.set(current, statusKey, status))
					}
					yield* releasePortlessRoute(input)
					return status
				}),
			'terminal.write': payload =>
				Effect.flatMap(getTerminal(TerminalPayload.make(payload)), sessionTerminal =>
					sessionTerminal.write(payload.data)
				),
			usage: payload =>
				Stream.repeat(
					Stream.fromEffect(payload.provider === 'claude' ? usage.claude : usage.codex),
					Schedule.spaced('30 seconds')
				),
			'usage.system': () => Stream.repeat(Stream.fromEffect(usage.system), Schedule.spaced('5 seconds'))
		})
	})
)
