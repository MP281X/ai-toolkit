import {randomUUID} from 'node:crypto'

import {
	Array,
	Context,
	Duration,
	Effect,
	Equal,
	Exit,
	Function,
	HashMap,
	HashSet,
	Layer,
	Option,
	Predicate,
	RcMap,
	Ref,
	Record,
	Result,
	Schema,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import {Prompt} from 'effect/unstable/ai'
import {ChildProcess} from 'effect/unstable/process'

import {RpcContracts, TerminalPayload, type AgentProfile, type AgentSession} from '#rpcs/contracts.ts'
import {discoverPackageScripts, packageScriptCommand, scriptRuns} from '#rpcs/scripts.ts'
import {AgentBrowser, agentBrowserSessionNameForAgent} from '@deslop/agent-browser/service'
import {type AgentProvider, type AgentUsageProvider} from '@deslop/agent/schema'
import {Agent, AgentUsage} from '@deslop/agent/service'
import {AiError} from '@deslop/ai/schema'
import {Ai} from '@deslop/ai/service'
import {GitError, GitReviewBranchTarget, GitReviewChangesTarget, GitReviewLocalTarget} from '@deslop/git/schema'
import {GitChanges, GitPublish, GitReview, GitWorkspace} from '@deslop/git/service'
import {Os} from '@deslop/os/service'
import {PortlessRun} from '@deslop/portless/schema'
import {Portless} from '@deslop/portless/service'
import {TerminalError, terminalStatusActive} from '@deslop/terminal/schema'
import {Terminal} from '@deslop/terminal/service'

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
	readonly profile: AgentProfile
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

const GitChangesSessions = RcMap.make({
	idleTimeToLive: Duration.seconds(30),
	lookup: Effect.fnUntraced(function* (cwd: string) {
		const context = yield* Layer.buildWithScope(GitChanges.layer({cwd}), yield* Effect.scope)

		return Context.get(context, GitChanges)
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
			Ai.layer({
				agent: 'pi',
				cwd,
				systemPrompt: Prompt.makeMessage('system', {
					content:
						'You write minimal, useful git commit messages. Return only commit message text. Do not use markdown fences, quotes, or explanations.'
				})
			}),
			yield* Effect.scope
		)

		return Context.get(context, Ai)
	})
})

const agentProfiles = [
	{icon: 'codex', id: 'codex', label: 'codex'},
	{icon: 'claude', id: 'claude', label: 'claude'},
	{icon: 'pi', id: 'pi', label: 'pi'}
] satisfies readonly AgentProfile[]

const ProviderAgents = RcMap.make({
	idleTimeToLive: Duration.minutes(5),
	lookup: Effect.fnUntraced(function* (config: {readonly cwd: string; readonly provider: AgentProvider}) {
		const context = yield* Layer.buildWithScope(Agent.layer(config), yield* Effect.scope)

		return Context.get(context, Agent)
	})
})

const AgentUsageSessions = RcMap.make({
	idleTimeToLive: Duration.minutes(2),
	lookup: Effect.fnUntraced(function* (provider: AgentUsageProvider) {
		const context = yield* Layer.buildWithScope(AgentUsage.layer({provider}), yield* Effect.scope)

		return Context.get(context, AgentUsage)
	})
})

function draftCommitPrompt(input: {
	readonly diffs: readonly {readonly filePath: string; readonly patch: string; readonly status: string}[]
	readonly recentSubjects: readonly string[]
	readonly scope: 'branch' | 'worktree'
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

	const scopeLabel = input.scope === 'branch' ? 'branch changes' : 'current worktree changes'

	return `Write a git commit message for these ${scopeLabel}.

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
		const gitChanges = yield* GitChangesSessions
		const gitReviews = yield* GitReviewSessions
		const gitPublishes = yield* GitPublishSessions
		const publishAgents = yield* PublishAgentSessions
		const agentBrowser = yield* AgentBrowser
		const providerAgents = yield* ProviderAgents
		const agentUsages = yield* AgentUsageSessions
		const portless = yield* Portless
		const os = yield* Os
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
		const sidebarRunsVersion = yield* SubscriptionRef.make(0)
		const worktreeRunsRequested = yield* Ref.make(HashSet.empty<string>())
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
		const requestWorktreeRuns = Effect.fnUntraced(function* (cwd: string) {
			const shouldStart = yield* Ref.modify(worktreeRunsRequested, requested =>
				HashSet.has(requested, cwd) ? ([false, requested] as const) : ([true, HashSet.add(requested, cwd)] as const)
			)
			if (!shouldStart) return
			yield* Effect.forkScoped(
				pipe(
					Effect.all([RcMap.get(portlessWorktrees, cwd), RcMap.get(scriptWorktrees, cwd)], {concurrency: 2}),
					Effect.tap(() => SubscriptionRef.update(sidebarRunsVersion, current => current + 1)),
					Effect.catch(() => Ref.update(worktreeRunsRequested, current => HashSet.remove(current, cwd))),
					Effect.ignore
				)
			)
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
						env: {...portlessScript.preparedCommand.options.env, ...portlessScript.script.env}
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
			return yield* pipe(
				Option.fromUndefinedOr(removed.script),
				Option.match({
					onNone: () => Effect.void,
					onSome: Effect.fnUntraced(function* (script) {
						yield* Ref.set(portlessScripts, removed.current)
						yield* portless.remove({cwd: script.script.cwd, sessionId: script.script.sessionId})
						yield* pipe(RcMap.invalidate(portlessWorktrees, script.script.cwd), Effect.ignore)
						yield* pipe(RcMap.invalidate(scriptWorktrees, script.script.cwd), Effect.ignore)
						yield* Ref.update(worktreeRunsRequested, current => HashSet.remove(current, script.script.cwd))
						yield* SubscriptionRef.update(sidebarRunsVersion, current => current + 1)
					})
				})
			)
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
										Effect.andThen(
											Ref.update(worktreeRunsRequested, current => HashSet.remove(current, script.script.cwd))
										),
										Effect.andThen(SubscriptionRef.update(sidebarRunsVersion, current => current + 1)),
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
			const statuses = yield* SubscriptionRef.get(runStatuses)
			const cachedPortlessScripts = yield* Ref.get(portlessScripts)
			const cachedPackageScripts = yield* Ref.get(packageScripts)
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
											yield* requestWorktreeRuns(worktree.root)
											const portlessRuns = pipe(
												Array.fromIterable(HashMap.values(cachedPortlessScripts)),
												Array.filter(run => run.script.cwd === worktree.root),
												Array.map(run => PortlessRun.make({origin: run.origin, script: run.script, status: run.status}))
											)
											const packageRuns = pipe(
												Array.fromIterable(HashMap.values(cachedPackageScripts)),
												Array.filter(script => script.cwd === worktree.root),
												scriptRuns
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

			return {agentProfiles, projects: sidebarProjects}
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
			'agentBrowser.close': payload => agentBrowser.close(payload),
			'agentBrowser.health': () => agentBrowser.health,
			'agentBrowser.open': payload => agentBrowser.open(payload),
			'agentBrowser.sessions': () => agentBrowser.sessions,
			agents: payload =>
				pipe(
					Stream.fromEffect(currentAgentSessions(payload.cwd)),
					Stream.concat(Stream.mapEffect(SubscriptionRef.changes(agents), () => currentAgentSessions(payload.cwd)))
				),
			'agents.create': Effect.fn('WorkbenchRpc.agents.create')(function* (payload: {
				readonly cwd: string
				readonly provider: AgentProvider
			}) {
				const providerAgent = yield* pipe(
					RcMap.get(providerAgents, {cwd: payload.cwd, provider: payload.provider}),
					Effect.mapError(cause => new TerminalError({cause, message: 'failed to prepare agent provider'}))
				)
				const preparedCommand = yield* pipe(
					providerAgent.create,
					Effect.mapError(cause => new TerminalError({cause, message: cause.message}))
				)
				const profile = pipe(
					agentProfiles,
					Array.findFirst(candidate => candidate.id === payload.provider),
					Option.getOrUndefined
				)
				if (Predicate.isUndefined(profile)) {
					return yield* new TerminalError({message: `Unknown agent provider: ${payload.provider}`})
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
				const browserEnv = yield* pipe(
					agentBrowser.browserEnv({session: agentBrowserSessionNameForAgent(agentSession.uuid)}),
					Effect.mapError(
						cause =>
							new TerminalError({
								cause,
								message: cause instanceof Error ? cause.message : 'failed to prepare agent-browser environment'
							})
					)
				)
				const input = yield* terminalSession(
					TerminalPayload.make({
						args: agentSession.args,
						command: agentSession.command,
						cwd: agentSession.cwd,
						env: browserEnv,
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
								SubscriptionRef.update(agents, sessions =>
									pipe(
										HashMap.get(sessions, key),
										Option.match({
											onNone: () => sessions,
											onSome: session => HashMap.set(sessions, key, {...session, state})
										})
									)
								)
							)
						)
					),
					Effect.forkDetach
				)

				return agentSession
			}),
			'agents.profiles': () => Effect.succeed(agentProfiles),
			'agents.remove': payload => removeAgent(AgentSessionKey.make(payload)),
			'home.sidebar': () =>
				pipe(
					Stream.merge(SubscriptionRef.changes(git.projects), SubscriptionRef.changes(agents)),
					Stream.merge(SubscriptionRef.changes(runStatuses)),
					Stream.merge(SubscriptionRef.changes(sidebarRunsVersion)),
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
					Effect.andThen(Ref.update(worktreeRunsRequested, current => HashSet.remove(current, payload.cwd))),
					Effect.andThen(SubscriptionRef.update(sidebarRunsVersion, current => current + 1)),
					Effect.andThen(git.deleteWorktree(payload))
				),
			'projects.maintenance': payload => git.maintenance(payload.cwd),
			'publish.checkpoint': payload =>
				pipe(
					RcMap.get(gitPublishes, payload.cwd),
					Effect.flatMap(publish => publish.checkpoint),
					Effect.andThen(RcMap.invalidate(gitChanges, payload.cwd))
				),
			'publish.message.generate': Effect.fn('WorkbenchRpc.publish.message.generate')(function* (payload: {
				readonly cwd: string
			}) {
				return yield* Effect.scoped(
					Effect.gen(function* () {
						const changes = yield* RcMap.get(gitChanges, payload.cwd)
						const metadata = yield* SubscriptionRef.get(changes.metadata)
						const checkpointCommits = Array.takeWhile(metadata.localCommits, commit => commit.checkpoint)
						const changesDiffsRef = yield* changes.diffs(GitReviewChangesTarget.make({}))
						const changesDiffs = yield* SubscriptionRef.get(changesDiffsRef)
						const diffs = yield* Effect.gen(function* () {
							if (!Array.isReadonlyArrayEmpty(changesDiffs)) return changesDiffs
							if (Array.isReadonlyArrayEmpty(checkpointCommits)) {
								const branchDiffsRef = yield* changes.diffs(GitReviewBranchTarget.make({}))
								return yield* SubscriptionRef.get(branchDiffsRef)
							}
							const localDiffsRef = yield* changes.diffs(GitReviewLocalTarget.make({}))
							return yield* SubscriptionRef.get(localDiffsRef)
						})
						const scope =
							Array.isReadonlyArrayEmpty(changesDiffs) && Array.isReadonlyArrayEmpty(checkpointCommits)
								? 'branch'
								: 'worktree'
						const promptDiffs = Array.map(diffs, diff => ({
							filePath: diff.filePath,
							patch: diff.patch ?? '',
							status: diff.status
						}))
						if (Array.isReadonlyArrayEmpty(promptDiffs)) {
							return yield* new GitError({message: 'No current changes to summarize.'})
						}
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
										content: [
											Prompt.makePart('text', {text: draftCommitPrompt({diffs: promptDiffs, recentSubjects, scope})})
										]
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
			'publish.publish': payload =>
				pipe(
					RcMap.get(gitPublishes, payload.cwd),
					Effect.flatMap(publish => publish.publish({message: payload.message})),
					Effect.tap(() => RcMap.invalidate(gitChanges, payload.cwd))
				),
			'review.comments.resolve': payload =>
				pipe(
					RcMap.get(gitReviews, payload.cwd),
					Effect.flatMap(review => review.resolveComments(payload.comments))
				),
			'review.comments.save': payload =>
				pipe(
					RcMap.get(gitReviews, payload.cwd),
					Effect.flatMap(review => review.saveComment(payload.comment))
				),
			'review.diffs': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitChanges, payload.cwd),
						Effect.flatMap(changes => changes.diffs(payload.target)),
						Effect.map(SubscriptionRef.changes)
					)
				),
			'review.metadata': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitChanges, payload.cwd),
						Effect.map(changes => SubscriptionRef.changes(changes.metadata))
					)
				),
			'review.state': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitReviews, payload.cwd),
						Effect.map(review => SubscriptionRef.changes(review.state))
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
				Stream.unwrap(
					pipe(
						RcMap.get(agentUsages, payload.provider),
						Effect.map(agentUsage =>
							Stream.unwrap(
								Effect.gen(function* () {
									const current = yield* SubscriptionRef.get(agentUsage.usage)
									return pipe(
										Stream.make(current),
										Stream.concat(SubscriptionRef.changes(agentUsage.usage)),
										Stream.filterMap(option => Result.fromOption(option, Function.constVoid)),
										Stream.flatMap(
											Exit.match({
												onFailure: cause => Stream.failCause(cause),
												onSuccess: value => Stream.succeed(value)
											})
										)
									)
								})
							)
						)
					)
				),
			'usage.subscription': payload =>
				pipe(
					RcMap.get(agentUsages, payload.provider),
					Effect.flatMap(agentUsage => agentUsage.subscription)
				),
			'usage.system': () => SubscriptionRef.changes(os.resources)
		})
	})
)
