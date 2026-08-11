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
	Match,
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

import {Prompt, Toolkit} from 'effect/unstable/ai'
import {ChildProcess} from 'effect/unstable/process'

import {RpcContracts, TerminalPayload, type AgentProfile, type AgentSession} from '#rpcs/contracts.ts'
import {AgentBrowserError} from '@deslop/agent-browser/schema'
import {AgentBrowser} from '@deslop/agent-browser/service'
import type {AgentProvider, AgentUsageProvider} from '@deslop/agent/schema'
import {Agent, AgentUsage} from '@deslop/agent/service'
import {Ai} from '@deslop/ai/service'
import {finalTextMessage} from '@deslop/ai/utils'
import {GitError, GitReviewBranchTarget, GitReviewChangesTarget, GitReviewLocalTarget} from '@deslop/git/schema'
import {GitChanges, GitPublish, GitReview, GitWorkspace} from '@deslop/git/service'
import {Os} from '@deslop/os/service'
import {PortlessOrigin, PortlessRun, PortlessScript} from '@deslop/portless/schema'
import {Portless, portlessWorktreeId} from '@deslop/portless/service'
import {Scripts} from '@deslop/scripts/service'
import {TerminalError, terminalStatusActive} from '@deslop/terminal/schema'
import {Terminal} from '@deslop/terminal/service'

type AgentSessionKey = typeof AgentSessionKey.Type
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

function terminalStatusRunning(state: AgentSession['state']) {
	return terminalStatusActive(state.state) && state.state !== 'idle'
}

function replacePortlessScripts(
	current: HashMap.HashMap<ScriptSessionKey, PortlessRun & {preparedCommand: ChildProcess.StandardCommand}>,
	cwd: string,
	scripts: (PortlessRun & {preparedCommand: ChildProcess.StandardCommand})[]
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

function scriptName(taskId: string) {
	return pipe(
		taskId,
		String.indexOf('#'),
		Option.match({onNone: () => taskId, onSome: index => String.slice(index + 1)(taskId)})
	)
}

function packageSegment(taskId: string) {
	return pipe(
		taskId,
		String.indexOf('#'),
		Option.match({onNone: () => taskId, onSome: index => String.slice(0, index)(taskId)})
	)
}

function routeSegment(value: string) {
	const segment = pipe(
		value,
		String.toLowerCase,
		String.replaceAll(/[^a-z0-9-]+/gu, '-'),
		String.replace(/^-+|-+$/gu, '')
	)
	return String.isEmpty(segment) ? 'app' : segment
}

function scriptRouteSegment(value: string) {
	return pipe(
		Match.value(value),
		Match.when('dev:client', () => 'client'),
		Match.when('dev:server', () => 'server'),
		Match.orElse(routeSegment)
	)
}

function scriptRun(taskId: string, command: ChildProcess.StandardCommand) {
	return {
		command: `${command.command} ${Array.join(' ')(command.args)}`,
		scriptName: scriptName(taskId),
		sessionId: taskId,
		taskId
	}
}

function removePackageScripts(current: HashMap.HashMap<ScriptSessionKey, ChildProcess.StandardCommand>, cwd: string) {
	return HashMap.filter(current, (_, key) => key.cwd !== cwd)
}

function makeAgentSession(input: {
	cwd: string
	preparedCommand: ChildProcess.StandardCommand
	profile: AgentProfile
	sessions: HashMap.HashMap<AgentSessionKey, AgentSession>
	uuid: string
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
		env: input.preparedCommand.options.env,
		icon: input.profile.icon,
		label: `${input.profile.label} ${labelCount + 1}`,
		profileId: input.profile.id,
		state: {state: 'starting' as const, title: ''},
		uuid: input.uuid
	}
}

function terminalSessionInput(
	session: TerminalPayload | {command?: ChildProcess.StandardCommand | string; cwd: string; sessionId?: string}
) {
	if ('args' in session || 'env' in session) {
		const command = Predicate.isUndefined(session.command)
			? undefined
			: ChildProcess.make(session.command, session.args ?? [], {env: session.env})
		return {command, cwd: session.cwd, sessionId: session.sessionId}
	}
	if (Predicate.isString(session.command)) {
		return {command: ChildProcess.make(session.command), cwd: session.cwd, sessionId: session.sessionId}
	}

	return {command: session.command, cwd: session.cwd, sessionId: session.sessionId}
}

const TerminalSessions = RcMap.make({
	idleTimeToLive: Duration.infinity,
	lookup: Effect.fnUntraced(function* (config: {
		command?: ChildProcess.StandardCommand
		cwd: string
		sessionId?: string
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

const agentProfiles = [
	{icon: 'codex', id: 'codex', label: 'codex'},
	{icon: 'claude', id: 'claude', label: 'claude'},
	{icon: 'opencode', id: 'opencode', label: 'opencode'}
] satisfies AgentProfile[]

const ProviderAgents = RcMap.make({
	idleTimeToLive: Duration.minutes(5),
	lookup: Effect.fnUntraced(function* (config: {cwd: string; provider: AgentProvider}) {
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
	diffs: {filePath: string; patch: string; status: string}[]
	recentSubjects: string[]
	scope: 'branch' | 'worktree'
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
		const providerAgents = yield* ProviderAgents
		const agentUsages = yield* AgentUsageSessions
		const portless = yield* Portless
		const os = yield* Os
		const portlessScripts = yield* Ref.make(
			HashMap.empty<ScriptSessionKey, PortlessRun & {preparedCommand: ChildProcess.StandardCommand}>()
		)
		const packageScripts = yield* Ref.make(HashMap.empty<ScriptSessionKey, ChildProcess.StandardCommand>())
		const portlessStatusWatchers = yield* Ref.make(HashSet.empty<ScriptSessionKey>())
		const runStatuses = yield* SubscriptionRef.make(HashMap.empty<ScriptSessionKey, AgentSession['state']>())
		const sidebarRunsVersion = yield* SubscriptionRef.make(0)
		const worktreeRunsRequested = yield* Ref.make(HashSet.empty<string>())
		const resolvedTerminals = yield* Ref.make(
			HashMap.empty<TerminalStatusKey, {command?: ChildProcess.StandardCommand; cwd: string; sessionId?: string}>()
		)
		const portlessWorktrees = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: Effect.fnUntraced(function* (cwd: string) {
				const scriptsContext = yield* Layer.buildWithScope(Scripts.layer({cwd}), yield* Effect.scope)
				const scripts = Context.get(scriptsContext, Scripts)
				const worktree = portlessWorktreeId(cwd)
				const runs = yield* pipe(
					Array.fromIterable(HashMap.entries(scripts.dev)),
					Effect.forEach(([key, command]) =>
						Effect.gen(function* () {
							const name = scriptName(key)
							const route = yield* portless.open({
								command,
								segments: [scriptRouteSegment(name), routeSegment(packageSegment(key)), worktree]
							})
							const run = PortlessRun.make({
								origin: PortlessOrigin.make({...route.origin, sessionId: key, taskId: key, worktree}),
								script: PortlessScript.make({
									cwd,
									env: route.env,
									origin: route.origin.origin,
									portless: true,
									scriptName: name,
									sessionId: key,
									taskId: key
								}),
								status: {state: 'prepared'}
							})
							return {...run, preparedCommand: route.command}
						})
					)
				)

				yield* Ref.update(portlessScripts, current => replacePortlessScripts(current, cwd, runs))

				return pipe(
					runs,
					Array.map(route => PortlessRun.make({origin: route.origin, script: route.script, status: route.status}))
				)
			})
		})
		const portlessBrowsers = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: Effect.fnUntraced(function* (cwd: string) {
				const context = yield* Layer.buildWithScope(
					AgentBrowser.layer({closeOnFinalize: true, sessionId: portlessWorktreeId(cwd)}),
					yield* Effect.scope
				)
				const browser = Context.get(context, AgentBrowser)
				return {
					switchTab: browser.switchTab,
					sync: Effect.fnUntraced(function* (runs: PortlessRun[]) {
						yield* browser.openTabs(Array.map(runs, run => run.origin.origin))
					})
				}
			})
		})
		const scriptWorktrees = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: Effect.fnUntraced(function* (cwd: string) {
				const scriptsContext = yield* Layer.buildWithScope(Scripts.layer({cwd}), yield* Effect.scope)
				const scripts = Context.get(scriptsContext, Scripts)
				const packageRuns = Array.fromIterable(HashMap.entries(scripts.scripts))

				yield* Ref.update(packageScripts, current =>
					pipe(
						packageRuns,
						Array.reduce(
							HashMap.filter(current, (_, key) => key.cwd !== cwd),
							(next, [sessionId, command]) => HashMap.set(next, ScriptSessionKey.make({cwd, sessionId}), command)
						)
					)
				)

				return Array.map(packageRuns, ([taskId, command]) => scriptRun(taskId, command))
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
					command: portlessScript.preparedCommand,
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
				return {command: packageScript, cwd: input.cwd, sessionId: input.sessionId}
			}

			return yield* TerminalError.make({message: `failed to resolve script ${input.sessionId} in ${input.cwd}`})
		})
		const getTerminal = Effect.fnUntraced(function* (input: TerminalPayload) {
			const statusKey = TerminalStatusKey.make({cwd: input.cwd, sessionId: input.sessionId})
			const resolved = pipe(yield* Ref.get(resolvedTerminals), HashMap.get(statusKey), Option.getOrUndefined)
			const session = Predicate.isNotUndefined(resolved)
				? resolved
				: yield* pipe(terminalSession(input), Effect.map(terminalSessionInput))
			yield* Ref.update(resolvedTerminals, current => HashMap.set(current, statusKey, session))
			return yield* RcMap.get(terminals, session)
		})
		const invalidateTerminal = Effect.fnUntraced(function* (input: TerminalPayload) {
			if (Predicate.isUndefined(input.sessionId)) return

			const statusKey = TerminalStatusKey.make({cwd: input.cwd, sessionId: input.sessionId})
			const session = pipe(yield* Ref.get(resolvedTerminals), HashMap.get(statusKey), Option.getOrUndefined)
			yield* Ref.update(resolvedTerminals, current => HashMap.remove(current, statusKey))
			if (Predicate.isNotUndefined(session)) yield* pipe(RcMap.invalidate(terminals, session), Effect.ignore)
		})
		const activePortlessRuns = Effect.fnUntraced(function* (cwd: string) {
			const statuses = yield* SubscriptionRef.get(runStatuses)
			const scripts = pipe(
				Array.fromIterable(HashMap.values(yield* Ref.get(portlessScripts))),
				Array.filter(run => run.script.cwd === cwd)
			)
			const active = Array.filter(scripts, run =>
				terminalStatusRunning(
					pipe(
						statuses,
						HashMap.get(ScriptSessionKey.make({cwd: run.script.cwd, sessionId: run.script.sessionId})),
						Option.getOrElse(() => ({state: 'idle' as const, title: ''}))
					)
				)
			)
			return active
		})
		const syncPortlessBrowser = Effect.fnUntraced(function* (cwd: string) {
			const runs = yield* activePortlessRuns(cwd)
			if (Array.isReadonlyArrayEmpty(runs)) return
			yield* pipe(
				Effect.gen(function* () {
					const browser = yield* RcMap.get(portlessBrowsers, cwd)
					yield* browser.sync(runs)
				}),
				Effect.scoped
			)
		})
		const syncOrClosePortlessBrowser = Effect.fnUntraced(function* (cwd: string) {
			const runs = yield* activePortlessRuns(cwd)
			if (Array.isReadonlyArrayEmpty(runs)) {
				yield* pipe(RcMap.invalidate(portlessBrowsers, cwd), Effect.ignore)
				return
			}
			yield* pipe(
				Effect.gen(function* () {
					const browser = yield* RcMap.get(portlessBrowsers, cwd)
					yield* browser.sync(runs)
				}),
				Effect.scoped
			)
		})
		const watchPortlessRoute = Effect.fnUntraced(function* (
			input: TerminalPayload,
			sessionTerminal: {status: SubscriptionRef.SubscriptionRef<AgentSession['state']>}
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
				Effect.gen(function* () {
					const status = yield* SubscriptionRef.get(sessionTerminal.status)
					yield* SubscriptionRef.update(runStatuses, current =>
						HashMap.set(
							current,
							ScriptSessionKey.make({cwd: script.script.cwd, sessionId: script.script.sessionId}),
							status
						)
					)
					if (terminalStatusRunning(status)) {
						yield* pipe(syncPortlessBrowser(script.script.cwd), Effect.ignore, Effect.forkDetach)
					}

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
										? invalidateTerminal(input)
										: pipe(syncPortlessBrowser(script.script.cwd), Effect.ignore)
								)
							)
						)
					)
				}),
				Effect.ensuring(Ref.update(portlessStatusWatchers, current => HashSet.remove(current, watcherKey))),
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
												Array.fromIterable(HashMap.entries(cachedPackageScripts)),
												Array.filter(([key]) => key.cwd === worktree.root),
												Array.map(([key, command]) => scriptRun(key.sessionId, command))
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

		const agents = yield* SubscriptionRef.make<HashMap.HashMap<AgentSessionKey, AgentSession>>(HashMap.empty())
		const removeAgent = Effect.fnUntraced(function* (payload: AgentSessionKey) {
			const session = pipe(yield* SubscriptionRef.get(agents), HashMap.get(payload), Option.getOrUndefined)
			yield* SubscriptionRef.update(agents, current => HashMap.remove(current, payload))
			if (Predicate.isUndefined(session)) return

			const input = TerminalPayload.make({
				args: session.args,
				command: session.command,
				cwd: session.cwd,
				env: session.env,
				sessionId: session.uuid
			})
			yield* pipe(
				getTerminal(input),
				Effect.flatMap(terminal => terminal.stop),
				Effect.ignore
			)
			yield* invalidateTerminal(input)
		})

		return RpcContracts.of({
			'agentBrowser.switchTab': payload =>
				pipe(
					Effect.gen(function* () {
						const scripts = Array.fromIterable(HashMap.values(yield* Ref.get(portlessScripts)))
						const run = pipe(
							scripts,
							Array.findFirst(script => script.origin.worktree === payload.session)
						)
						if (Option.isNone(run)) {
							return yield* AgentBrowserError.make({message: `Unknown agent-browser session: ${payload.session}`})
						}
						const browser = yield* RcMap.get(portlessBrowsers, run.value.script.cwd)
						yield* browser.switchTab(payload.origin)
					}),
					Effect.scoped
				),
			'agentBrowser.sync': payload => syncPortlessBrowser(payload.cwd),
			agents: payload =>
				pipe(
					Stream.fromEffect(currentAgentSessions(payload.cwd)),
					Stream.concat(Stream.mapEffect(SubscriptionRef.changes(agents), () => currentAgentSessions(payload.cwd)))
				),
			'agents.create': Effect.fn('WorkbenchRpc.agents.create')(function* (payload: {
				cwd: string
				provider: AgentProvider
			}) {
				const providerAgent = yield* pipe(
					RcMap.get(providerAgents, {cwd: payload.cwd, provider: payload.provider}),
					Effect.mapError(cause => TerminalError.make({cause, message: 'failed to prepare agent provider'}))
				)
				const preparedCommand = yield* pipe(
					providerAgent.create,
					Effect.mapError(cause => TerminalError.make({cause, message: cause.message}))
				)
				const profile = pipe(
					agentProfiles,
					Array.findFirst(candidate => candidate.id === payload.provider),
					Option.getOrUndefined
				)
				if (Predicate.isUndefined(profile)) {
					return yield* TerminalError.make({message: `Unknown agent provider: ${payload.provider}`})
				}
				const agentSession = makeAgentSession({
					cwd: payload.cwd,
					preparedCommand,
					profile,
					sessions: yield* SubscriptionRef.get(agents),
					uuid: randomUUID()
				})

				const agentSessionWithEnv = {
					...agentSession,
					env: {
						...agentSession.env,
						AGENT_BROWSER_ENABLE: 'react-devtools',
						AGENT_BROWSER_SESSION: portlessWorktreeId(agentSession.cwd)
					}
				} satisfies AgentSession
				const input = yield* pipe(
					terminalSession(
						TerminalPayload.make({
							args: agentSessionWithEnv.args,
							command: agentSessionWithEnv.command,
							cwd: agentSessionWithEnv.cwd,
							env: agentSessionWithEnv.env,
							sessionId: agentSessionWithEnv.uuid
						})
					),
					Effect.map(terminalSessionInput)
				)
				yield* Ref.update(resolvedTerminals, sessions =>
					HashMap.set(sessions, TerminalStatusKey.make({cwd: agentSession.cwd, sessionId: agentSession.uuid}), input)
				)
				const sessionTerminal = yield* RcMap.get(terminals, input)
				yield* sessionTerminal.restart
				yield* SubscriptionRef.update(agents, sessions =>
					HashMap.set(
						sessions,
						AgentSessionKey.make({cwd: agentSessionWithEnv.cwd, uuid: agentSessionWithEnv.uuid}),
						agentSessionWithEnv
					)
				)
				const key = AgentSessionKey.make({cwd: agentSessionWithEnv.cwd, uuid: agentSessionWithEnv.uuid})
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

				return agentSessionWithEnv
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
					RcMap.invalidate(portlessBrowsers, payload.cwd),
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
				cwd: string
			}) {
				return yield* Effect.scoped(
					Effect.gen(function* () {
						const changes = yield* RcMap.get(gitChanges, payload.cwd)
						const metadata = yield* pipe(changes.metadata, Stream.runHead, Effect.map(Option.getOrThrow))
						const checkpointCommits = Array.takeWhile(metadata.localCommits, commit => commit.checkpoint)
						const changesDiffs = yield* pipe(
							changes.diffs(GitReviewChangesTarget.make({})),
							Effect.flatMap(Stream.runHead),
							Effect.map(Option.getOrThrow)
						)
						const fallbackDiffs = Array.isReadonlyArrayEmpty(checkpointCommits)
							? changes.diffs(GitReviewBranchTarget.make({}))
							: changes.diffs(GitReviewLocalTarget.make({}))
						const diffs = Array.isReadonlyArrayEmpty(changesDiffs)
							? yield* pipe(fallbackDiffs, Effect.flatMap(Stream.runHead), Effect.map(Option.getOrThrow))
							: changesDiffs
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
							return yield* GitError.make({message: 'No current changes to summarize.'})
						}
						const recentSubjects = pipe(
							Array.appendAll(metadata.localCommits, metadata.branchCommits),
							Array.take(10),
							Array.map(commit => commit.subject)
						)
						const agent = yield* Ai.make({
							agent: 'pi',
							cwd: payload.cwd,
							model: {id: 'gpt-5.5', provider: 'openai-codex', reasoning: 'low'},
							systemPrompt: Prompt.makeMessage('system', {
								content:
									'You write minimal, useful git commit messages. Return only commit message text. Do not use markdown fences, quotes, or explanations.'
							}),
							toolkit: Toolkit.empty
						})
						const text = yield* pipe(
							agent.prompt(
								Prompt.makeMessage('user', {
									content: [
										Prompt.makePart('text', {text: draftCommitPrompt({diffs: promptDiffs, recentSubjects, scope})})
									]
								})
							),
							finalTextMessage
						)

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
						Effect.flatMap(changes => changes.diffs(payload.target))
					)
				),
			'review.metadata': payload =>
				Stream.unwrap(
					pipe(
						RcMap.get(gitChanges, payload.cwd),
						Effect.map(changes => changes.metadata)
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
					yield* pipe(syncOrClosePortlessBrowser(input.cwd), Effect.ignore, Effect.forkDetach)
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
					yield* pipe(syncOrClosePortlessBrowser(input.cwd), Effect.ignore, Effect.forkDetach)
				}
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
