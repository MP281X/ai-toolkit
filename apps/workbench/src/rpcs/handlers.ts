import {randomUUID} from 'node:crypto'

import {
	Array,
	Context,
	Duration,
	Effect,
	Equal,
	HashMap,
	HashSet,
	Layer,
	Option,
	Predicate,
	RcMap,
	Ref,
	Record,
	Schedule,
	Schema,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import {Prompt} from 'effect/unstable/ai'
import {ChildProcess} from 'effect/unstable/process'

import {RpcContracts, TerminalPayload, type AgentSession} from '#rpcs/contracts.ts'
import {discoverPackageScripts, packageScriptCommand, scriptRuns} from '#rpcs/scripts.ts'
import {AiError, type AgentCommandProfile, type AgentCommandRequest} from '@deslop/ai/schema'
import {Agent, AgentCommand} from '@deslop/ai/service'
import {GitError, GitReviewChangesTarget} from '@deslop/git/schema'
import {GitPublish, GitReview, GitWorkspace} from '@deslop/git/service'
import {PortlessRun} from '@deslop/portless/schema'
import {Portless} from '@deslop/portless/service'
import {TerminalError, terminalStatusActive} from '@deslop/terminal/schema'
import {Terminal} from '@deslop/terminal/service'
import {Usage} from '@deslop/usage/service'

const AgentSessionKey = Schema.Struct({cwd: Schema.String, uuid: Schema.String})

type ScriptSessionKey = typeof ScriptSessionKey.Type
const ScriptSessionKey = Schema.Struct({cwd: Schema.String, sessionId: Schema.String})

type TerminalStatusKey = typeof TerminalStatusKey.Type
const TerminalStatusKey = Schema.Struct({cwd: Schema.String, sessionId: Schema.optional(Schema.String)})

type TerminalSessionIdentity = typeof TerminalSessionIdentity.Type
const TerminalSessionIdentity = Schema.Struct({
	command: Schema.optional(Schema.Any),
	cwd: Schema.String,
	sessionId: Schema.optional(Schema.String)
})

function terminalStatusDone(state: AgentSession['state']) {
	return !terminalStatusActive(state.state)
}

function replacePortlessScripts(
	current: HashMap.HashMap<ScriptSessionKey, PortlessRun & {readonly preparedCommand: ChildProcess.StandardCommand}>,
	cwd: string,
	scripts: readonly (PortlessRun & {readonly preparedCommand: ChildProcess.StandardCommand})[]
) {
	return pipe(
		scripts,
		Array.reduce(
			HashMap.filter(current, script => script.script.cwd !== cwd),
			(next, script) =>
				HashMap.set(next, ScriptSessionKey.make({cwd: script.script.cwd, sessionId: script.script.sessionId}), script)
		)
	)
}

function removePortlessScript(
	current: HashMap.HashMap<ScriptSessionKey, PortlessRun & {readonly preparedCommand: ChildProcess.StandardCommand}>,
	input: {readonly cwd: string; readonly sessionId?: string}
) {
	if (Predicate.isUndefined(input.sessionId)) return {current, script: undefined}

	const key = ScriptSessionKey.make({cwd: input.cwd, sessionId: input.sessionId})
	const script = pipe(current, HashMap.get(key), Option.getOrUndefined)
	return {current: HashMap.remove(current, key), script}
}

function replacePackageScripts(
	current: HashMap.HashMap<
		ScriptSessionKey,
		{
			readonly command: string
			readonly cwd: string
			readonly preparedCommand: ChildProcess.StandardCommand
			readonly scriptName: string
			readonly sessionId: string
			readonly taskId: string
		}
	>,
	cwd: string,
	scripts: Parameters<typeof scriptRuns>[0]
) {
	return pipe(
		scripts,
		Array.reduce(
			HashMap.filter(current, script => script.cwd !== cwd),
			(next, script) =>
				HashMap.set(next, ScriptSessionKey.make({cwd, sessionId: script.sessionId}), {
					...script,
					cwd,
					preparedCommand: packageScriptCommand(cwd, script)
				})
		)
	)
}

function removePackageScripts(
	current: HashMap.HashMap<
		ScriptSessionKey,
		{
			readonly command: string
			readonly cwd: string
			readonly preparedCommand: ChildProcess.StandardCommand
			readonly scriptName: string
			readonly sessionId: string
			readonly taskId: string
		}
	>,
	cwd: string
) {
	return HashMap.filter(current, script => script.cwd !== cwd)
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

function terminalSessionInput(
	session:
		| TerminalPayload
		| {readonly command?: ChildProcess.StandardCommand | string; readonly cwd: string; readonly sessionId?: string}
) {
	if ('args' in session || 'env' in session) {
		return {
			command: Predicate.isUndefined(session.command)
				? undefined
				: ChildProcess.make(session.command, session.args ?? [], {env: session.env}),
			cwd: session.cwd,
			sessionId: session.sessionId
		}
	}
	if (Predicate.isString(session.command)) {
		return {command: ChildProcess.make(session.command), cwd: session.cwd, sessionId: session.sessionId}
	}

	return {command: session.command, cwd: session.cwd, sessionId: session.sessionId}
}

const TerminalSessions = RcMap.make({
	idleTimeToLive: Duration.infinity,
	lookup: Effect.fnUntraced(function* (config: {
		readonly command?: ChildProcess.StandardCommand
		readonly cwd: string
		readonly sessionId?: string
	}) {
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
		const portlessScripts = yield* Ref.make(
			HashMap.empty<ScriptSessionKey, PortlessRun & {readonly preparedCommand: ChildProcess.StandardCommand}>()
		)
		const packageScripts = yield* Ref.make(
			HashMap.empty<
				ScriptSessionKey,
				{
					readonly command: string
					readonly cwd: string
					readonly preparedCommand: ChildProcess.StandardCommand
					readonly scriptName: string
					readonly sessionId: string
					readonly taskId: string
				}
			>()
		)
		const portlessStatusWatchers = yield* Ref.make(HashSet.empty<ScriptSessionKey>())
		const runStatuses = yield* SubscriptionRef.make(HashMap.empty<ScriptSessionKey, AgentSession['state']>())
		const resolvedTerminals = yield* Ref.make(
			HashMap.empty<
				TerminalStatusKey,
				{readonly command?: ChildProcess.StandardCommand; readonly cwd: string; readonly sessionId?: string}
			>()
		)

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
					Array.map(route => PortlessRun.make({origin: route.origin, script: route.script, status: route.status}))
				)
			})
		})
		const scriptWorktrees = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: Effect.fnUntraced(function* (cwd: string) {
				const scripts = yield* pipe(
					discoverPackageScripts(cwd),
					Effect.mapError(cause => new TerminalError({cause, message: `failed to discover package scripts in ${cwd}`}))
				)

				yield* Ref.update(packageScripts, current => replacePackageScripts(current, cwd, scripts))

				return scriptRuns(scripts)
			})
		})

		const terminalSession = Effect.fnUntraced(function* (input: TerminalPayload) {
			if (Predicate.isUndefined(input.sessionId) || Predicate.isNotUndefined(input.command)) return input

			const scriptKey = ScriptSessionKey.make({cwd: input.cwd, sessionId: input.sessionId})
			const portlessScript = yield* pipe(
				Ref.get(portlessScripts),
				Effect.map(current => pipe(current, HashMap.get(scriptKey), Option.getOrUndefined)),
				Effect.flatMap(script =>
					Predicate.isNotUndefined(script)
						? Effect.succeed(script)
						: pipe(
								RcMap.get(portlessWorktrees, input.cwd),
								Effect.withSpan('Workbench.Portless.prepareTerminalSession'),
								Effect.andThen(Ref.get(portlessScripts)),
								Effect.map(current => pipe(current, HashMap.get(scriptKey), Option.getOrUndefined))
							)
				)
			)
			if (Predicate.isNotUndefined(portlessScript)) {
				return {
					command: ChildProcess.make(portlessScript.preparedCommand.command, portlessScript.preparedCommand.args, {
						...portlessScript.preparedCommand.options,
						env: portlessScript.script.env
					}),
					cwd: portlessScript.script.cwd,
					sessionId: portlessScript.script.sessionId
				}
			}

			const packageScript = yield* pipe(
				Ref.get(packageScripts),
				Effect.map(current => pipe(current, HashMap.get(scriptKey), Option.getOrUndefined)),
				Effect.flatMap(script =>
					Predicate.isNotUndefined(script)
						? Effect.succeed(script)
						: pipe(
								RcMap.get(scriptWorktrees, input.cwd),
								Effect.withSpan('Workbench.Scripts.prepareTerminalSession'),
								Effect.andThen(Ref.get(packageScripts)),
								Effect.map(current => pipe(current, HashMap.get(scriptKey), Option.getOrUndefined))
							)
				)
			)
			if (Predicate.isNotUndefined(packageScript)) {
				return {command: packageScript.preparedCommand, cwd: packageScript.cwd, sessionId: packageScript.sessionId}
			}

			return yield* new TerminalError({message: `failed to resolve script ${input.sessionId} in ${input.cwd}`})
		})
		const getTerminal = Effect.fnUntraced(function* (input: TerminalPayload) {
			const session = yield* pipe(terminalSession(input), Effect.map(terminalSessionInput))
			yield* Ref.update(resolvedTerminals, current =>
				HashMap.set(current, TerminalStatusKey.make({cwd: input.cwd, sessionId: input.sessionId}), session)
			)
			return yield* RcMap.get(terminals, session)
		})
		const invalidateTerminal = Effect.fnUntraced(function* (input: TerminalPayload) {
			if (Predicate.isUndefined(input.sessionId)) return

			const statusKey = TerminalStatusKey.make({cwd: input.cwd, sessionId: input.sessionId})
			const session = pipe(yield* Ref.get(resolvedTerminals), HashMap.get(statusKey), Option.getOrUndefined)
			yield* Ref.update(resolvedTerminals, current => HashMap.remove(current, statusKey))
			if (Predicate.isNotUndefined(session)) yield* pipe(RcMap.invalidate(terminals, session), Effect.ignore)
		})
		const releasePortlessRoute = Effect.fnUntraced(function* (input: TerminalPayload) {
			const removed = removePortlessScript(yield* Ref.get(portlessScripts), input)
			if (Predicate.isUndefined(removed.script)) return
			yield* Ref.set(portlessScripts, removed.current)

			yield* portless.remove({cwd: removed.script.script.cwd, sessionId: removed.script.script.sessionId})
			yield* pipe(RcMap.invalidate(portlessWorktrees, removed.script.script.cwd), Effect.ignore)
			yield* pipe(RcMap.invalidate(scriptWorktrees, removed.script.script.cwd), Effect.ignore)
		})
		const watchPortlessRoute = Effect.fnUntraced(function* (
			input: TerminalPayload,
			sessionTerminal: {readonly status: SubscriptionRef.SubscriptionRef<AgentSession['state']>}
		) {
			if (Predicate.isUndefined(input.sessionId)) return
			const script = pipe(
				yield* Ref.get(portlessScripts),
				HashMap.get(ScriptSessionKey.make({cwd: input.cwd, sessionId: input.sessionId})),
				Option.getOrUndefined
			)
			if (Predicate.isUndefined(script)) return
			const watcherKey = ScriptSessionKey.make({cwd: script.script.cwd, sessionId: script.script.sessionId})
			const watching = yield* Ref.modify(portlessStatusWatchers, current => {
				if (HashSet.has(current, watcherKey)) return [true, current] as const
				return [false, HashSet.add(current, watcherKey)] as const
			})
			if (watching) return

			yield* pipe(
				SubscriptionRef.changes(sessionTerminal.status),
				Stream.takeUntil(state => terminalStatusDone(state)),
				Stream.runForEach(state =>
					pipe(
						SubscriptionRef.update(runStatuses, current =>
							HashMap.set(
								current,
								ScriptSessionKey.make({cwd: script.script.cwd, sessionId: script.script.sessionId}),
								state
							)
						),
						Effect.andThen(
							terminalStatusDone(state)
								? pipe(
										portless.remove({cwd: script.script.cwd, sessionId: script.script.sessionId}),
										Effect.andThen(
											Ref.update(portlessScripts, current => removePortlessScript(current, script.script).current)
										),
										Effect.andThen(pipe(RcMap.invalidate(portlessWorktrees, script.script.cwd), Effect.ignore)),
										Effect.andThen(pipe(RcMap.invalidate(scriptWorktrees, script.script.cwd), Effect.ignore)),
										Effect.andThen(invalidateTerminal(input)),
										Effect.andThen(Ref.update(portlessStatusWatchers, current => HashSet.remove(current, watcherKey)))
									)
								: Effect.void
						)
					)
				),
				Effect.forkDetach
			)
		})

		const currentAgentSessions = Effect.fnUntraced(function* (cwd: string) {
			return pipe(
				Array.fromIterable(HashMap.values(yield* SubscriptionRef.get(agents))),
				Array.filter(session => session.cwd === cwd)
			)
		})

		const sidebarSnapshot = Effect.fnUntraced(function* () {
			const profiles = yield* agentCommand.profiles
			const statuses = yield* SubscriptionRef.get(runStatuses)
			const sidebarProjects = yield* pipe(
				SubscriptionRef.get(git.projects),
				Effect.flatMap(snapshot =>
					Effect.forEach(
						snapshot,
						project =>
							Effect.gen(function* () {
								const worktrees = yield* Effect.forEach(
									project.worktrees,
									worktree =>
										Effect.gen(function* () {
											const portlessRuns = yield* pipe(
												RcMap.get(portlessWorktrees, worktree.root),
												Effect.orElseSucceed(() => [])
											)
											const packageRuns = yield* pipe(
												RcMap.get(scriptWorktrees, worktree.root),
												Effect.orElseSucceed(() => [])
											)
											return {
												agents: yield* currentAgentSessions(worktree.root),
												branch: worktree.branch,
												portlessRuns,
												root: worktree.root,
												runStatuses: pipe(
													Array.appendAll(
														Array.map(packageRuns, run => run.sessionId),
														Array.map(portlessRuns, run => run.script.sessionId)
													),
													Array.map(
														sessionId =>
															[
																sessionId,
																pipe(
																	statuses,
																	HashMap.get(ScriptSessionKey.make({cwd: worktree.root, sessionId})),
																	Option.getOrElse(() => ({state: 'idle' as const, title: ''}))
																)
															] as const
													),
													Record.fromEntries
												),
												scriptRuns: packageRuns
											}
										}),
									{concurrency: 8}
								)
								return {repository: project.repository, worktrees}
							}),
						{concurrency: 8}
					)
				)
			)

			return {agentProfiles: profiles, projects: sidebarProjects}
		})

		const agents = yield* SubscriptionRef.make<HashMap.HashMap<typeof AgentSessionKey.Type, AgentSession>>(
			HashMap.empty()
		)
		const removeAgent = Effect.fnUntraced(function* (payload: typeof AgentSessionKey.Type) {
			const session = pipe(yield* SubscriptionRef.get(agents), HashMap.get(payload), Option.getOrUndefined)
			yield* SubscriptionRef.update(agents, current => HashMap.remove(current, payload))
			if (Predicate.isUndefined(session)) return

			const input = terminalSessionInput({
				args: session.args,
				command: session.command,
				cwd: session.cwd,
				sessionId: session.uuid
			})
			yield* pipe(
				RcMap.get(terminals, input),
				Effect.flatMap(terminal => terminal.stop),
				Effect.ignore
			)
			yield* pipe(RcMap.invalidate(terminals, input), Effect.ignore)
			yield* Ref.update(resolvedTerminals, current =>
				HashMap.remove(current, TerminalStatusKey.make({cwd: payload.cwd, sessionId: payload.uuid}))
			)
		})

		return RpcContracts.of({
			agents: payload =>
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
			'agents.create': Effect.fn('WorkbenchRpc.agents.create')(function* (payload: AgentCommandRequest) {
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
				if (Predicate.isUndefined(profile)) {
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
				yield* Ref.update(resolvedTerminals, sessions =>
					HashMap.set(sessions, TerminalStatusKey.make({cwd: agentSession.cwd, sessionId: agentSession.uuid}), input)
				)
				const sessionTerminal = yield* RcMap.get(terminals, input)
				yield* sessionTerminal.restart
				const key = AgentSessionKey.make({cwd: agentSession.cwd, uuid: agentSession.uuid})
				yield* pipe(
					Effect.scoped(
						pipe(
							SubscriptionRef.changes(sessionTerminal.status),
							Stream.takeUntil(state => terminalStatusDone(state)),
							Stream.runForEach(state =>
								pipe(
									SubscriptionRef.update(agents, sessions =>
										pipe(
											HashMap.get(sessions, key),
											Option.match({
												onNone: () => sessions,
												onSome: session => HashMap.set(sessions, key, {...session, state})
											})
										)
									),
									Effect.andThen(
										terminalStatusDone(state)
											? pipe(
													SubscriptionRef.update(agents, sessions => HashMap.remove(sessions, key)),
													Effect.andThen(pipe(RcMap.invalidate(terminals, input), Effect.ignore)),
													Effect.andThen(
														Ref.update(resolvedTerminals, sessions =>
															HashMap.remove(
																sessions,
																TerminalStatusKey.make({cwd: agentSession.cwd, sessionId: agentSession.uuid})
															)
														)
													)
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
			'home.sidebar': () =>
				pipe(
					Stream.merge(SubscriptionRef.changes(git.projects), SubscriptionRef.changes(agents)),
					Stream.merge(SubscriptionRef.changes(runStatuses)),
					Stream.mapEffect(() => sidebarSnapshot()),
					Stream.changes
				),
			projects: () => SubscriptionRef.changes(git.projects),
			'projects.branches': payload => git.branches(payload.cwd),
			'projects.createWorktree': payload => git.createWorktree(payload),
			'projects.deleteWorktree': payload =>
				pipe(
					portless.clear(payload.cwd),
					Effect.andThen(RcMap.invalidate(portlessWorktrees, payload.cwd)),
					Effect.andThen(RcMap.invalidate(scriptWorktrees, payload.cwd)),
					Effect.andThen(Ref.update(packageScripts, current => removePackageScripts(current, payload.cwd))),
					Effect.andThen(git.deleteWorktree(payload))
				),
			'projects.fix': payload => git.fix(payload.cwd),
			'publish.approve': payload =>
				pipe(
					RcMap.get(gitPublishes, payload.cwd),
					Effect.flatMap(publish => publish.approve({message: payload.message}))
				),
			'publish.message.generate': Effect.fn('WorkbenchRpc.publish.message.generate')(function* (payload: {
				readonly cwd: string
			}) {
				return yield* Effect.scoped(
					Effect.gen(function* () {
						const review = yield* RcMap.get(gitReviews, payload.cwd)
						const diffs = yield* review.reviewDiffs(GitReviewChangesTarget.make({}))
						if (Array.isReadonlyArrayEmpty(diffs)) {
							return yield* new GitError({message: 'No current changes to summarize.'})
						}
						const metadata = yield* review.metadata
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
							Effect.map(message => String.trim(message))
						)

						if (String.isEmpty(text)) return yield* new AiError({message: 'Generated commit message was empty.'})
						return text
					})
				)
			}),
			'review.comments.resolve': payload =>
				pipe(
					RcMap.get(gitReviews, payload.cwd),
					Effect.flatMap(review =>
						Predicate.isUndefined(payload.threadId)
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
				Stream.unwrap(
					pipe(
						RcMap.get(gitReviews, payload.cwd),
						Effect.map(review => review.watchReviewMetadata())
					)
				),
			'review.state': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitReviews, payload.cwd),
						Effect.map(review => review.watchReviewState())
					)
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
			'runs.portless': payload => RcMap.get(portlessWorktrees, payload.cwd),
			'runs.scripts': payload => RcMap.get(scriptWorktrees, payload.cwd),
			'terminal.attach': payload =>
				Stream.unwrap(
					pipe(
						getTerminal(TerminalPayload.make(payload)),
						Effect.map(sessionTerminal =>
							sessionTerminal.attach(
								Predicate.isUndefined(payload.cols) || Predicate.isUndefined(payload.rows)
									? undefined
									: {cols: payload.cols, rows: payload.rows}
							)
						)
					)
				),
			'terminal.resize': payload =>
				pipe(
					getTerminal(TerminalPayload.make(payload)),
					Effect.flatMap(sessionTerminal => sessionTerminal.resize({cols: payload.cols, rows: payload.rows}))
				),
			'terminal.restart': Effect.fn('WorkbenchRpc.terminal.restart')(function* (payload: TerminalPayload) {
				const input = TerminalPayload.make(payload)
				const sessionTerminal = yield* getTerminal(input)
				const status = yield* sessionTerminal.restart
				if (Predicate.isNotUndefined(input.sessionId)) {
					const scriptKey = ScriptSessionKey.make({cwd: input.cwd, sessionId: input.sessionId})
					yield* SubscriptionRef.update(runStatuses, current => HashMap.set(current, scriptKey, status))
				}
				yield* watchPortlessRoute(input, sessionTerminal)
				return status
			}),
			'terminal.status': payload =>
				Stream.unwrap(
					Effect.gen(function* () {
						const input = TerminalPayload.make(payload)
						const statusKey = TerminalStatusKey.make({cwd: input.cwd, sessionId: input.sessionId})
						const scriptKey = Predicate.isUndefined(input.sessionId)
							? undefined
							: ScriptSessionKey.make({cwd: input.cwd, sessionId: input.sessionId})
						const session = pipe(yield* Ref.get(resolvedTerminals), HashMap.get(statusKey), Option.getOrUndefined)
						const activeSession = Predicate.isUndefined(session)
							? false
							: Array.some(Array.fromIterable(yield* RcMap.keys(terminals)), current =>
									Equal.equals(TerminalSessionIdentity.make(current), TerminalSessionIdentity.make(session))
								)
						if (!activeSession || Predicate.isUndefined(session)) {
							const idle = Predicate.isUndefined(scriptKey)
								? ({state: 'idle' as const, title: ''} satisfies AgentSession['state'])
								: pipe(
										yield* SubscriptionRef.get(runStatuses),
										HashMap.get(scriptKey),
										Option.getOrElse(() => ({state: 'idle' as const, title: ''}))
									)
							return pipe(
								Stream.make(idle),
								Stream.concat(
									pipe(
										SubscriptionRef.changes(runStatuses),
										Stream.map(statuses =>
											Predicate.isUndefined(scriptKey)
												? ({state: 'idle' as const, title: ''} satisfies AgentSession['state'])
												: pipe(
														statuses,
														HashMap.get(scriptKey),
														Option.getOrElse(() => ({state: 'idle' as const, title: ''}))
													)
										),
										Stream.changes
									)
								)
							)
						}

						const sessionTerminal = yield* RcMap.get(terminals, session)
						const state = yield* SubscriptionRef.get(sessionTerminal.status)
						return pipe(Stream.make(state), Stream.concat(SubscriptionRef.changes(sessionTerminal.status)))
					})
				),
			'terminal.stop': Effect.fn('WorkbenchRpc.terminal.stop')(function* (payload: TerminalPayload) {
				const input = TerminalPayload.make(payload)
				const status = yield* pipe(
					getTerminal(input),
					Effect.flatMap(sessionTerminal => sessionTerminal.stop)
				)
				if (Predicate.isNotUndefined(input.sessionId)) {
					const scriptKey = ScriptSessionKey.make({cwd: input.cwd, sessionId: input.sessionId})
					yield* SubscriptionRef.update(runStatuses, current => HashMap.set(current, scriptKey, status))
				}
				yield* releasePortlessRoute(input)
				yield* invalidateTerminal(input)
				return status
			}),
			'terminal.write': payload =>
				pipe(
					getTerminal(TerminalPayload.make(payload)),
					Effect.flatMap(sessionTerminal => sessionTerminal.write(payload.data))
				),
			usage: payload =>
				pipe(
					Stream.fromEffect(payload.provider === 'claude' ? usage.claude : usage.codex),
					Stream.repeat(Schedule.spaced('30 seconds'))
				),
			'usage.system': () => pipe(Stream.fromEffect(usage.system), Stream.repeat(Schedule.spaced('5 seconds')))
		})
	})
)
