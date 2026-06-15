import {randomUUID} from 'node:crypto'

import {
	Array,
	Context,
	Data,
	Duration,
	Effect,
	Equal,
	FiberMap,
	HashMap,
	Layer,
	Match,
	Option,
	RcMap,
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

import {
	AgentSession,
	CreatedWorktree,
	HomeSidebar,
	RpcContracts,
	SidebarPackageRun,
	SidebarPortlessRun,
	SidebarProject,
	SidebarWorktree,
	TerminalCommandPayload,
	worktreeRouteId
} from '#rpcs/contracts.ts'
import type {
	ScriptRun,
	TerminalPayload,
	TerminalShellPayload,
	TerminalPackageScriptPayload,
	TerminalPortlessScriptPayload
} from '#rpcs/contracts.ts'
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

function agentWatcherKey(input: {readonly cwd: string; readonly uuid: string}) {
	return `${input.cwd}:${input.uuid}`
}

class TerminalSession extends Schema.Class<TerminalSession>('TerminalSession')({
	command: Schema.optional(TerminalCommand),
	cwd: Schema.String,
	sessionId: Schema.optional(Schema.String)
}) {}

class PackageScriptRunEntry extends Data.TaggedClass('package-script')<{
	readonly cwd: string
	readonly preparedCommand: ChildProcess.StandardCommand
	readonly run: ScriptRun
	readonly sessionId: string
	readonly status: TerminalStatus
}> {}

class PortlessScriptRunEntry extends Data.TaggedClass('portless-script')<{
	readonly cwd: string
	readonly preparedCommand: ChildProcess.StandardCommand
	readonly run: PortlessRun
	readonly sessionId: string
	readonly status: TerminalStatus
}> {}

class PackageScriptRunIdentity extends Schema.Class<PackageScriptRunIdentity>('PackageScriptRunIdentity')({
	cwd: Schema.String,
	sessionId: Schema.String
}) {}

class PortlessScriptRunIdentity extends Schema.Class<PortlessScriptRunIdentity>('PortlessScriptRunIdentity')({
	cwd: Schema.String,
	sessionId: Schema.String
}) {}

function terminalStatusDone(state: AgentSession['state']) {
	return !terminalStatusActive(state.state)
}

function idleTerminalStatus() {
	return new TerminalStatus({state: 'idle', title: ''})
}

function replacePortlessRunEntries(
	current: HashMap.HashMap<PortlessScriptRunIdentity, PortlessScriptRunEntry>,
	cwd: string,
	scripts: readonly PortlessPreparedRun[]
) {
	return Array.reduce(
		scripts,
		HashMap.filter(current, entry => entry.cwd !== cwd),
		(next, script) => {
			const entry = new PortlessScriptRunEntry({
				cwd: script.script.cwd,
				preparedCommand: script.preparedCommand,
				run: new PortlessRun({origin: script.origin, script: script.script}),
				sessionId: script.script.sessionId,
				status: idleTerminalStatus()
			})
			const currentEntry = pipe(
				current,
				HashMap.get(new PortlessScriptRunIdentity({cwd: entry.cwd, sessionId: entry.sessionId})),
				Option.getOrUndefined
			)
			return HashMap.set(
				next,
				new PortlessScriptRunIdentity({cwd: entry.cwd, sessionId: entry.sessionId}),
				new PortlessScriptRunEntry({...entry, status: currentEntry?.status ?? entry.status})
			)
		}
	)
}

function removePortlessScriptRun(
	current: HashMap.HashMap<PortlessScriptRunIdentity, PortlessScriptRunEntry>,
	input: TerminalPortlessScriptPayload
) {
	const identity = new PortlessScriptRunIdentity({cwd: input.cwd, sessionId: input.sessionId})
	const entry = pipe(current, HashMap.get(identity), Option.getOrUndefined)
	return {current: HashMap.remove(current, identity), entry}
}

function replacePackageRunEntries(
	current: HashMap.HashMap<PackageScriptRunIdentity, PackageScriptRunEntry>,
	cwd: string,
	scripts: readonly ScriptRun[]
) {
	return Array.reduce(
		scripts,
		HashMap.filter(current, entry => entry.cwd !== cwd),
		(next, script) => {
			const entry = new PackageScriptRunEntry({
				cwd,
				preparedCommand: ChildProcess.make('vp', ['run', script.taskId], {cwd}),
				run: script,
				sessionId: script.sessionId,
				status: idleTerminalStatus()
			})
			const currentEntry = pipe(
				current,
				HashMap.get(new PackageScriptRunIdentity({cwd: entry.cwd, sessionId: entry.sessionId})),
				Option.getOrUndefined
			)
			return HashMap.set(
				next,
				new PackageScriptRunIdentity({cwd: entry.cwd, sessionId: entry.sessionId}),
				new PackageScriptRunEntry({...entry, status: currentEntry?.status ?? entry.status})
			)
		}
	)
}

function removePackageRunsForCwd(
	current: HashMap.HashMap<PackageScriptRunIdentity, PackageScriptRunEntry>,
	cwd: string
) {
	return {
		current: HashMap.filter(current, entry => entry.cwd !== cwd),
		removed: Array.filter(Array.fromIterable(HashMap.values(current)), entry => entry.cwd === cwd)
	}
}

function removePortlessRunsForCwd(
	current: HashMap.HashMap<PortlessScriptRunIdentity, PortlessScriptRunEntry>,
	cwd: string
) {
	return {
		current: HashMap.filter(current, entry => entry.cwd !== cwd),
		removed: Array.filter(Array.fromIterable(HashMap.values(current)), entry => entry.cwd === cwd)
	}
}

function portlessRunsRemovedByDiscovery(
	current: HashMap.HashMap<PortlessScriptRunIdentity, PortlessScriptRunEntry>,
	cwd: string,
	scripts: readonly PortlessPreparedRun[]
) {
	const discovered = Array.map(
		scripts,
		script => new PortlessScriptRunIdentity({cwd, sessionId: script.script.sessionId})
	)
	return Array.filter(
		Array.fromIterable(HashMap.values(current)),
		entry =>
			entry.cwd === cwd &&
			!Array.containsWith(Equal.equals)(new PortlessScriptRunIdentity({cwd: entry.cwd, sessionId: entry.sessionId}))(
				discovered
			)
	)
}

function packageRunsRemovedByDiscovery(
	current: HashMap.HashMap<PackageScriptRunIdentity, PackageScriptRunEntry>,
	cwd: string,
	scripts: readonly ScriptRun[]
) {
	const discovered = Array.map(scripts, script => new PackageScriptRunIdentity({cwd, sessionId: script.sessionId}))
	return Array.filter(
		Array.fromIterable(HashMap.values(current)),
		entry =>
			entry.cwd === cwd &&
			!Array.containsWith(Equal.equals)(new PackageScriptRunIdentity({cwd: entry.cwd, sessionId: entry.sessionId}))(
				discovered
			)
	)
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
		env: terminalCommandEnv(input.preparedCommand),
		icon: input.profile.icon,
		label: `${input.profile.label} ${labelCount + 1}`,
		profileId: input.profile.id,
		state: new TerminalStatus({state: 'starting', title: ''}),
		uuid: input.uuid
	})
}

function terminalCommandEnv(command: ChildProcess.StandardCommand) {
	const env = Record.filter(command.options.env ?? {}, (value): value is string => typeof value === 'string')
	return Record.isEmptyReadonlyRecord(env) ? void 0 : env
}

function terminalSessionFromPayload(session: TerminalShellPayload | TerminalCommandPayload) {
	return Match.value(session).pipe(
		Match.tag('shell', shell => new TerminalSession({cwd: shell.cwd})),
		Match.tag(
			'command',
			command =>
				new TerminalSession({
					command: ChildProcess.make(command.command, command.args, {env: command.env}),
					cwd: command.cwd,
					sessionId: command.sessionId
				})
		),
		Match.exhaustive
	)
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
		const packageRuns = yield* SubscriptionRef.make(HashMap.empty<PackageScriptRunIdentity, PackageScriptRunEntry>())
		const portlessRuns = yield* SubscriptionRef.make(HashMap.empty<PortlessScriptRunIdentity, PortlessScriptRunEntry>())
		const scriptRunWatchers = yield* FiberMap.make<PackageScriptRunIdentity | PortlessScriptRunIdentity>()
		const terminalStatuses = yield* SubscriptionRef.make(HashMap.empty<TerminalSession, TerminalStatus>())
		const terminalStatusWatchers = yield* FiberMap.make<TerminalSession>()

		const portlessWorktrees = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: Effect.fnUntraced(function* (cwd: string) {
				const scripts = yield* Effect.mapError(
					portless.scripts(cwd),
					cause => new TerminalError({cause, message: `failed to discover portless scripts in ${cwd}`})
				)

				yield* Effect.forEach(
					portlessRunsRemovedByDiscovery(yield* SubscriptionRef.get(portlessRuns), cwd, scripts),
					entry =>
						FiberMap.remove(
							scriptRunWatchers,
							new PortlessScriptRunIdentity({cwd: entry.cwd, sessionId: entry.sessionId})
						),
					{discard: true}
				)
				yield* SubscriptionRef.update(portlessRuns, current => replacePortlessRunEntries(current, cwd, scripts))

				return Array.map(scripts, route => new PortlessRun({origin: route.origin, script: route.script}))
			})
		})
		const scriptWorktrees = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: Effect.fnUntraced(function* (cwd: string) {
				const scripts = yield* Effect.mapError(
					discoverPackageScripts(cwd),
					cause => new TerminalError({cause, message: `failed to discover package scripts in ${cwd}`})
				)

				yield* Effect.forEach(
					packageRunsRemovedByDiscovery(yield* SubscriptionRef.get(packageRuns), cwd, scripts),
					entry =>
						FiberMap.remove(
							scriptRunWatchers,
							new PackageScriptRunIdentity({cwd: entry.cwd, sessionId: entry.sessionId})
						),
					{discard: true}
				)
				yield* SubscriptionRef.update(packageRuns, current => replacePackageRunEntries(current, cwd, scripts))

				return Array.map(scripts, script => ({...script, cwd}))
			})
		})

		const getPortlessRun = Effect.fnUntraced(function* (script: TerminalPortlessScriptPayload) {
			const scriptKey = new PortlessScriptRunIdentity({cwd: script.cwd, sessionId: script.sessionId})
			const current = pipe(yield* SubscriptionRef.get(portlessRuns), HashMap.get(scriptKey), Option.getOrUndefined)
			if (current !== undefined) return current

			yield* Effect.withSpan(RcMap.get(portlessWorktrees, script.cwd), 'Workbench.Portless.prepareTerminalSession')
			return yield* pipe(
				yield* SubscriptionRef.get(portlessRuns),
				HashMap.get(scriptKey),
				Option.match({
					onNone: () =>
						Effect.fail(
							new TerminalError({message: `failed to resolve portless script ${script.sessionId} in ${script.cwd}`})
						),
					onSome: Effect.succeed
				})
			)
		})
		const getPackageRun = Effect.fnUntraced(function* (script: TerminalPackageScriptPayload) {
			const scriptKey = new PackageScriptRunIdentity({cwd: script.cwd, sessionId: script.sessionId})
			const current = pipe(yield* SubscriptionRef.get(packageRuns), HashMap.get(scriptKey), Option.getOrUndefined)
			if (current !== undefined) return current

			yield* Effect.withSpan(RcMap.get(scriptWorktrees, script.cwd), 'Workbench.Scripts.prepareTerminalSession')
			return yield* pipe(
				yield* SubscriptionRef.get(packageRuns),
				HashMap.get(scriptKey),
				Option.match({
					onNone: () =>
						Effect.fail(
							new TerminalError({message: `failed to resolve package script ${script.sessionId} in ${script.cwd}`})
						),
					onSome: Effect.succeed
				})
			)
		})
		const terminalSession = Effect.fnUntraced(function* (input: TerminalPayload) {
			return yield* Match.value(input).pipe(
				Match.tag('portless-script', script =>
					Effect.gen(function* () {
						const entry = yield* getPortlessRun(script)

						return new TerminalSession({
							command: ChildProcess.make(entry.preparedCommand.command, entry.preparedCommand.args, {
								...entry.preparedCommand.options,
								env: entry.run.script.env
							}),
							cwd: entry.run.script.cwd,
							sessionId: entry.run.script.sessionId
						})
					})
				),
				Match.tag('package-script', script =>
					Effect.gen(function* () {
						const entry = yield* getPackageRun(script)

						return new TerminalSession({command: entry.preparedCommand, cwd: entry.cwd, sessionId: entry.sessionId})
					})
				),
				Match.orElse(session => Effect.succeed(terminalSessionFromPayload(session)))
			)
		})
		const watchTerminalSessionStatus = Effect.fnUntraced(function* (
			session: TerminalSession,
			sessionTerminal: {readonly status: SubscriptionRef.SubscriptionRef<TerminalStatus>}
		) {
			const currentStatus = yield* SubscriptionRef.get(sessionTerminal.status)
			yield* SubscriptionRef.update(terminalStatuses, current => HashMap.set(current, session, currentStatus))
			yield* FiberMap.run(
				terminalStatusWatchers,
				session,
				Stream.runForEach(SubscriptionRef.changes(sessionTerminal.status), status =>
					SubscriptionRef.update(terminalStatuses, current => HashMap.set(current, session, status))
				),
				{onlyIfMissing: true}
			)
		})
		const invalidateTerminalSession = Effect.fnUntraced(function* (session: TerminalSession) {
			yield* FiberMap.remove(terminalStatusWatchers, session)
			yield* SubscriptionRef.update(terminalStatuses, current => HashMap.remove(current, session))
			yield* RcMap.invalidate(terminals, session)
		})
		const getTerminalSession = Effect.fnUntraced(function* (session: TerminalSession) {
			const sessionTerminal = yield* Effect.mapError(RcMap.get(terminals, session), cause =>
				cause instanceof TerminalError ? cause : new TerminalError({cause})
			)
			yield* watchTerminalSessionStatus(session, sessionTerminal)

			return sessionTerminal
		})
		const getTerminal = Effect.fnUntraced(function* (input: TerminalPayload) {
			return yield* getTerminalSession(yield* terminalSession(input))
		})
		function terminalSessionStatusStream(session: TerminalSession) {
			return pipe(
				SubscriptionRef.changes(terminalStatuses),
				Stream.map(current => Option.getOrElse(HashMap.get(current, session), idleTerminalStatus)),
				Stream.changes
			)
		}
		function packageScriptStatusStream(input: TerminalPackageScriptPayload) {
			const key = new PackageScriptRunIdentity({cwd: input.cwd, sessionId: input.sessionId})
			return pipe(
				SubscriptionRef.changes(packageRuns),
				Stream.map(current =>
					pipe(
						HashMap.get(current, key),
						Option.map(entry => entry.status),
						Option.getOrElse(idleTerminalStatus)
					)
				),
				Stream.changes
			)
		}
		function portlessScriptStatusStream(input: TerminalPortlessScriptPayload) {
			const key = new PortlessScriptRunIdentity({cwd: input.cwd, sessionId: input.sessionId})
			return pipe(
				SubscriptionRef.changes(portlessRuns),
				Stream.map(current =>
					pipe(
						HashMap.get(current, key),
						Option.map(entry => entry.status),
						Option.getOrElse(idleTerminalStatus)
					)
				),
				Stream.changes
			)
		}
		function commandStatusStream(input: TerminalCommandPayload) {
			const agentKey = AgentSessionKey.make({cwd: input.cwd, uuid: input.sessionId})
			const session = terminalSessionFromPayload(input)
			return pipe(
				Stream.merge(
					Stream.map(SubscriptionRef.changes(agents), () => void 0),
					Stream.map(SubscriptionRef.changes(terminalStatuses), () => void 0)
				),
				Stream.mapEffect(() =>
					Effect.gen(function* () {
						const agentSession = pipe(yield* SubscriptionRef.get(agents), HashMap.get(agentKey), Option.getOrUndefined)
						if (agentSession !== undefined) return agentSession.state

						return pipe(
							yield* SubscriptionRef.get(terminalStatuses),
							HashMap.get(session),
							Option.getOrElse(idleTerminalStatus)
						)
					})
				),
				Stream.changes
			)
		}
		function terminalStatusStream(input: TerminalPayload) {
			return Match.value(input).pipe(
				Match.tag('shell', shell => terminalSessionStatusStream(terminalSessionFromPayload(shell))),
				Match.tag('command', commandStatusStream),
				Match.tag('package-script', packageScriptStatusStream),
				Match.tag('portless-script', portlessScriptStatusStream),
				Match.exhaustive
			)
		}
		const cleanupPortlessRoute = Effect.fnUntraced(function* (removed: PortlessScriptRunEntry) {
			yield* portless.remove({cwd: removed.run.script.cwd, sessionId: removed.run.script.sessionId})
			yield* RcMap.invalidate(portlessWorktrees, removed.run.script.cwd)
		})
		const removePortlessRouteEntry = Effect.fnUntraced(function* (input: TerminalPortlessScriptPayload) {
			const removed = yield* SubscriptionRef.modify(portlessRuns, current => {
				const next = removePortlessScriptRun(current, input)
				return [next.entry, next.current] as const
			})

			return removed
		})
		const completePortlessRoute = Effect.fnUntraced(function* (input: TerminalPortlessScriptPayload) {
			const removed = yield* removePortlessRouteEntry(input)
			if (removed === undefined) return

			yield* cleanupPortlessRoute(removed)
		})
		const releasePortlessRoute = Effect.fnUntraced(function* (input: TerminalPortlessScriptPayload) {
			yield* FiberMap.remove(
				scriptRunWatchers,
				new PortlessScriptRunIdentity({cwd: input.cwd, sessionId: input.sessionId})
			)
			const removed = yield* removePortlessRouteEntry(input)
			if (removed === undefined) return

			yield* cleanupPortlessRoute(removed)
		})
		const updatePackageRunStatus = Effect.fnUntraced(function* (
			input: TerminalPackageScriptPayload,
			status: TerminalStatus
		) {
			yield* SubscriptionRef.update(packageRuns, current =>
				HashMap.modifyAt(
					current,
					new PackageScriptRunIdentity({cwd: input.cwd, sessionId: input.sessionId}),
					Option.match({
						onNone: () => Option.none(),
						onSome: entry => Option.some(new PackageScriptRunEntry({...entry, status}))
					})
				)
			)
		})
		const updatePortlessRunStatus = Effect.fnUntraced(function* (
			input: TerminalPortlessScriptPayload,
			status: TerminalStatus
		) {
			yield* SubscriptionRef.update(portlessRuns, current =>
				HashMap.modifyAt(
					current,
					new PortlessScriptRunIdentity({cwd: input.cwd, sessionId: input.sessionId}),
					Option.match({
						onNone: () => Option.none(),
						onSome: entry => Option.some(new PortlessScriptRunEntry({...entry, status}))
					})
				)
			)
		})
		const updateScriptRunStatus = Effect.fnUntraced(function* (
			input: TerminalPackageScriptPayload | TerminalPortlessScriptPayload,
			status: TerminalStatus
		) {
			yield* Match.value(input).pipe(
				Match.tag('package-script', script => updatePackageRunStatus(script, status)),
				Match.tag('portless-script', script => updatePortlessRunStatus(script, status)),
				Match.exhaustive
			)
		})
		const watchRunStatus = Effect.fnUntraced(function* (
			input: TerminalPackageScriptPayload | TerminalPortlessScriptPayload,
			sessionTerminal: {readonly status: SubscriptionRef.SubscriptionRef<AgentSession['state']>}
		) {
			const key = Match.value(input).pipe(
				Match.tag(
					'package-script',
					script => new PackageScriptRunIdentity({cwd: script.cwd, sessionId: script.sessionId})
				),
				Match.tag(
					'portless-script',
					script => new PortlessScriptRunIdentity({cwd: script.cwd, sessionId: script.sessionId})
				),
				Match.exhaustive
			)
			yield* FiberMap.run(
				scriptRunWatchers,
				key,
				pipe(
					SubscriptionRef.changes(sessionTerminal.status),
					Stream.takeUntil(terminalStatusDone),
					Stream.runForEach(state =>
						Effect.andThen(
							updateScriptRunStatus(input, state),
							Effect.gen(function* () {
								if (!terminalStatusDone(state)) return

								yield* Match.value(input).pipe(
									Match.tag('portless-script', completePortlessRoute),
									Match.tag('package-script', () => Effect.void),
									Match.exhaustive
								)
							})
						)
					)
				),
				{onlyIfMissing: true}
			)
		})
		const startScriptRun = Effect.fnUntraced(function* (
			input: TerminalPackageScriptPayload | TerminalPortlessScriptPayload,
			status: TerminalStatus,
			sessionTerminal: {readonly status: SubscriptionRef.SubscriptionRef<AgentSession['state']>}
		) {
			yield* updateScriptRunStatus(input, status)
			yield* watchRunStatus(input, sessionTerminal)
		})
		const stopScriptRun = Effect.fnUntraced(function* (
			input: TerminalPackageScriptPayload | TerminalPortlessScriptPayload,
			status: TerminalStatus
		) {
			yield* updateScriptRunStatus(input, status)
			yield* Match.value(input).pipe(
				Match.tag('portless-script', releasePortlessRoute),
				Match.tag('package-script', () => Effect.void),
				Match.exhaustive
			)
		})

		const sidebarSnapshot = Effect.fnUntraced(function* () {
			const profiles = yield* agentCommand.profiles
			const projects = yield* SubscriptionRef.get(git.projects)
			yield* Effect.forEach(
				projects,
				project =>
					Effect.forEach(
						project.worktrees,
						worktree =>
							Effect.all([RcMap.get(portlessWorktrees, worktree.root), RcMap.get(scriptWorktrees, worktree.root)], {
								discard: true
							}),
						{concurrency: 8, discard: true}
					),
				{concurrency: 8, discard: true}
			)

			const agentSessionsByCwd = new Map<string, AgentSession[]>()
			for (const session of HashMap.values(yield* SubscriptionRef.get(agents))) {
				const bucket = agentSessionsByCwd.get(session.cwd)
				if (bucket === undefined) agentSessionsByCwd.set(session.cwd, [session])
				else bucket.push(session)
			}

			const packageRunsByCwd = new Map<string, PackageScriptRunEntry[]>()
			for (const run of HashMap.values(yield* SubscriptionRef.get(packageRuns))) {
				const bucket = packageRunsByCwd.get(run.cwd)
				if (bucket === undefined) packageRunsByCwd.set(run.cwd, [run])
				else bucket.push(run)
			}

			const portlessRunsByCwd = new Map<string, PortlessScriptRunEntry[]>()
			for (const run of HashMap.values(yield* SubscriptionRef.get(portlessRuns))) {
				const bucket = portlessRunsByCwd.get(run.cwd)
				if (bucket === undefined) portlessRunsByCwd.set(run.cwd, [run])
				else bucket.push(run)
			}

			const sidebarProjects = Array.map(projects, project => {
				const worktrees = Array.map(
					project.worktrees,
					worktree =>
						new SidebarWorktree({
							agents: agentSessionsByCwd.get(worktree.root) ?? [],
							branch: worktree.branch,
							id: worktreeRouteId(worktree.root),
							packageRuns: Array.map(
								packageRunsByCwd.get(worktree.root) ?? [],
								run =>
									new SidebarPackageRun({
										command: run.run.command,
										cwd: run.cwd,
										sessionId: run.sessionId,
										status: run.status,
										taskId: run.run.taskId
									})
							),
							portlessRuns: Array.map(
								portlessRunsByCwd.get(worktree.root) ?? [],
								run =>
									new SidebarPortlessRun({
										command: run.run.script.command,
										cwd: run.cwd,
										origin: run.run.origin,
										sessionId: run.sessionId,
										status: run.status,
										taskId: run.run.script.taskId
									})
							),
							root: worktree.root
						})
				)
				const rootWorktree = pipe(
					worktrees,
					Array.findFirst(worktree => worktree.root === project.repository.root),
					Option.getOrThrowWith(() => new Error(`Missing root worktree: ${project.repository.root}`))
				)
				return new SidebarProject({repository: project.repository, rootWorktree, worktrees})
			})

			return new HomeSidebar({agentProfiles: profiles, projects: sidebarProjects})
		})

		const agents = yield* SubscriptionRef.make<HashMap.HashMap<AgentSessionKey, AgentSession>>(HashMap.empty())
		const agentWatchers = yield* FiberMap.make<string>()
		const removeAgent = Effect.fnUntraced(function* (payload: AgentSessionKey) {
			yield* FiberMap.remove(agentWatchers, agentWatcherKey(payload))
			const session = pipe(yield* SubscriptionRef.get(agents), HashMap.get(payload), Option.getOrUndefined)
			yield* SubscriptionRef.update(agents, current => HashMap.remove(current, payload))
			if (session === undefined) return

			const input = new TerminalSession({
				command: ChildProcess.make(session.command, session.args, {env: session.env}),
				cwd: session.cwd,
				sessionId: session.uuid
			})
			yield* invalidateTerminalSession(input)
		})

		return RpcContracts.of({
			'agents.create': payload =>
				Effect.gen(function* () {
					const command = yield* agentCommand.create({cwd: payload.cwd, profileId: payload.profileId})
					const agentSession = makeAgentSession({
						cwd: payload.cwd,
						preparedCommand: command.command,
						profile: command.profile,
						sessions: yield* SubscriptionRef.get(agents),
						uuid: randomUUID()
					})

					yield* SubscriptionRef.update(agents, sessions =>
						HashMap.set(sessions, AgentSessionKey.make({cwd: agentSession.cwd, uuid: agentSession.uuid}), agentSession)
					)
					const input = yield* terminalSession(
						new TerminalCommandPayload({
							args: agentSession.args,
							command: agentSession.command,
							cwd: agentSession.cwd,
							env: agentSession.env,
							sessionId: agentSession.uuid
						})
					)
					const sessionTerminal = yield* getTerminalSession(input)
					yield* sessionTerminal.restart(payload.size)
					const key = AgentSessionKey.make({cwd: agentSession.cwd, uuid: agentSession.uuid})
					yield* FiberMap.run(
						agentWatchers,
						agentWatcherKey(key),
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
										? Effect.andThen(
												SubscriptionRef.update(agents, sessions => HashMap.remove(sessions, key)),
												invalidateTerminalSession(input)
											)
										: Effect.void
								)
							)
						),
						{onlyIfMissing: true}
					)

					return agentSession
				}),
			'agents.remove': payload => removeAgent(AgentSessionKey.make(payload)),
			'home.sidebar': () =>
				pipe(
					Stream.merge(SubscriptionRef.changes(git.projects), SubscriptionRef.changes(agents)),
					Stream.merge(SubscriptionRef.changes(packageRuns)),
					Stream.merge(SubscriptionRef.changes(portlessRuns)),
					Stream.mapEffect(sidebarSnapshot),
					Stream.changes
				),
			'projects.branches': payload => git.branches(payload.cwd),
			'projects.createWorktree': payload =>
				Effect.map(
					Effect.mapError(git.createWorktree(payload), cause =>
						cause instanceof GitError ? cause : new GitError({cause})
					),
					root => new CreatedWorktree({id: worktreeRouteId(root)})
				),
			'projects.deleteWorktree': payload =>
				pipe(
					portless.clear(payload.cwd),
					Effect.andThen(RcMap.invalidate(portlessWorktrees, payload.cwd)),
					Effect.andThen(RcMap.invalidate(scriptWorktrees, payload.cwd)),
					Effect.andThen(
						Effect.gen(function* () {
							const removedPackageRuns = yield* SubscriptionRef.modify(packageRuns, current => {
								const next = removePackageRunsForCwd(current, payload.cwd)
								return [next.removed, next.current] as const
							})
							yield* Effect.forEach(
								removedPackageRuns,
								entry =>
									Effect.all(
										[
											FiberMap.remove(
												scriptRunWatchers,
												new PackageScriptRunIdentity({cwd: entry.cwd, sessionId: entry.sessionId})
											),
											RcMap.invalidate(
												terminals,
												new TerminalSession({
													command: entry.preparedCommand,
													cwd: entry.cwd,
													sessionId: entry.sessionId
												})
											)
										],
										{discard: true}
									),
								{discard: true}
							)

							const removedPortlessRuns = yield* SubscriptionRef.modify(portlessRuns, current => {
								const next = removePortlessRunsForCwd(current, payload.cwd)
								return [next.removed, next.current] as const
							})
							yield* Effect.forEach(
								removedPortlessRuns,
								entry =>
									Effect.all(
										[
											FiberMap.remove(
												scriptRunWatchers,
												new PortlessScriptRunIdentity({cwd: entry.cwd, sessionId: entry.sessionId})
											),
											RcMap.invalidate(
												terminals,
												new TerminalSession({
													command: ChildProcess.make(entry.preparedCommand.command, entry.preparedCommand.args, {
														...entry.preparedCommand.options,
														env: entry.run.script.env
													}),
													cwd: entry.run.script.cwd,
													sessionId: entry.run.script.sessionId
												})
											)
										],
										{discard: true}
									),
								{discard: true}
							)
							const removedAgentSessions = yield* SubscriptionRef.modify(agents, current => {
								const removed = Array.filter(
									Array.fromIterable(HashMap.values(current)),
									session => session.cwd === payload.cwd
								)
								return [removed, HashMap.filter(current, session => session.cwd !== payload.cwd)] as const
							})
							yield* Effect.forEach(
								removedAgentSessions,
								session =>
									Effect.all(
										[
											FiberMap.remove(agentWatchers, agentWatcherKey(session)),
											RcMap.invalidate(
												terminals,
												new TerminalSession({
													command: ChildProcess.make(session.command, session.args, {env: session.env}),
													cwd: session.cwd,
													sessionId: session.uuid
												})
											)
										],
										{discard: true}
									),
								{discard: true}
							)
							yield* invalidateTerminalSession(new TerminalSession({cwd: payload.cwd}))
						})
					),
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
			'terminal.attach': payload =>
				Stream.unwrap(
					Effect.map(getTerminal(payload.session), sessionTerminal => sessionTerminal.attach(payload.size))
				),
			'terminal.resize': payload =>
				Effect.flatMap(getTerminal(payload.session), sessionTerminal => sessionTerminal.resize(payload.size)),
			'terminal.restart': payload =>
				Effect.gen(function* () {
					const sessionTerminal = yield* getTerminal(payload.session)
					const status = yield* sessionTerminal.restart(payload.size)
					yield* Match.value(payload.session).pipe(
						Match.tag('package-script', script => startScriptRun(script, status, sessionTerminal)),
						Match.tag('portless-script', script => startScriptRun(script, status, sessionTerminal)),
						Match.orElse(() => Effect.void)
					)
					return status
				}),
			'terminal.status': terminalStatusStream,
			'terminal.stop': payload =>
				Effect.gen(function* () {
					const status = yield* Effect.flatMap(getTerminal(payload), sessionTerminal => sessionTerminal.stop())
					yield* Match.value(payload).pipe(
						Match.tag('package-script', script => stopScriptRun(script, status)),
						Match.tag('portless-script', script => stopScriptRun(script, status)),
						Match.orElse(() => Effect.void)
					)
					return status
				}),
			'terminal.write': payload =>
				Effect.flatMap(getTerminal(payload.session), sessionTerminal => sessionTerminal.write(payload.data)),
			usage: payload =>
				Stream.repeat(
					Stream.fromEffect(payload.provider === 'claude' ? usage.claude : usage.codex),
					Schedule.spaced('30 seconds')
				),
			'usage.system': () => Stream.repeat(Stream.fromEffect(usage.system), Schedule.spaced('5 seconds'))
		})
	})
)
