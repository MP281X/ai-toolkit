import type {Redacted} from 'effect'
import {
	Array,
	Context,
	Crypto,
	Data,
	Duration,
	Effect,
	FileSystem,
	Fiber,
	HashMap,
	Layer,
	Option,
	Path,
	Predicate,
	Ref,
	RcMap,
	Schedule,
	Schema,
	Scope,
	Stream,
	String,
	SubscriptionRef,
	pipe
} from 'effect'

import {Prompt, Tool, Toolkit} from 'effect/unstable/ai'
import {ChildProcessSpawner} from 'effect/unstable/process'

import type {CodeModeContext} from '../../code-mode-contract.ts'
import {codeModeClientFor, codeModeDeclarationsFor} from '../../code-mode-declarations.gen.ts'
import {evaluateCodeMode} from '../../code-mode.ts'
import {EligibleSubagentSkill} from '../../eligible-subagent-skills.gen.ts'

import {ActiveIssue, Conversation, IssueInspector, PlanningConversation, WorkbenchError} from './schema.ts'

import {Assets} from '#services/assets/service.ts'
import type {BranchName} from '#services/issues/schema.ts'
import {AgentId} from '#services/issues/schema.ts'
import {Issues} from '#services/issues/service.ts'
import {Preview} from '#services/preview/service.ts'
import {Processes} from '#services/processes/service.ts'
import {Publication} from '#services/publication/service.ts'
import type {RepositoryName} from '#services/repositories/schema.ts'
import {Repositories} from '#services/repositories/service.ts'
import {AgentError} from '@deslop/agent/schema'
import {Agent} from '@deslop/agent/service'
import {Git, GitHub, SourceRepositories} from '@deslop/git/service'

type WorkbenchConfig = {
	readonly model: string
	readonly reasoningEffort: string
	readonly token: Effect.Effect<Redacted.Redacted, WorkbenchError>
}

const implementationSystemPrompt =
	'Implement the accepted plan exactly. Never edit, weaken, reinterpret, or replace its requirements. Return requirement conflicts to planning instead of resolving them yourself. Direct user prompts may address only defects and minor code-quality problems without changing the accepted plan. Use code-mode for Workbench operations and never mutate Git or GitHub from Bash.'

function userMessage(text: string) {
	return Prompt.makeMessage('user', {content: [Prompt.makePart('text', {text})]})
}

function failure(message: string) {
	return Effect.mapError((cause: unknown) => WorkbenchError.make({cause, message}))
}

function planningTitle(text: string | undefined, agentId: typeof AgentId.Type) {
	if (Predicate.isUndefined(text) || text.trim() === '') return `Planning ${agentId.slice(0, 8)}`
	return pipe(text, String.trim, String.split(/\s+/u), Array.take(8), Array.join(' '))
}

function titleFromHistory(history: readonly Prompt.Message[], agentId: typeof AgentId.Type) {
	const firstUser = Array.findFirst(history, message => message.role === 'user')
	return Option.match(firstUser, {
		onNone: () => planningTitle(undefined, agentId),
		onSome: message =>
			planningTitle(
				typeof message.content === 'string'
					? message.content
					: pipe(
							message.content,
							Array.flatMap(part => (part.type === 'text' && Predicate.isString(part.text) ? [part.text] : [])),
							Array.join(' ')
						),
				agentId
			)
	})
}

function lifecycle(input: {
	readonly cleanAndPushed: boolean
	readonly currentHash: string
	readonly implementation?: {readonly planHash: string}
	readonly published: boolean
	readonly running: boolean
}) {
	if (Predicate.isUndefined(input.implementation)) return 'Planned' as const
	if (input.implementation.planHash !== input.currentHash) return 'Needs update' as const
	if (input.running) return 'Running' as const
	return input.published && input.cleanAndPushed ? ('Implemented' as const) : ('Unpublished' as const)
}

class AgentKey extends Data.Class<{
	readonly branch?: typeof BranchName.Type
	readonly capability: 'implementation' | 'planning' | 'subagent'
	readonly cwd: string
	readonly id: typeof AgentId.Type
	readonly repository: typeof RepositoryName.Type
	readonly skill?: typeof EligibleSubagentSkill.Type
	readonly systemPrompt: string
}> {}

class GitKey extends Data.Class<{
	readonly branch: typeof BranchName.Type
	readonly repository: typeof RepositoryName.Type
}> {}

export class Workbench extends Context.Service<Workbench>()('@deslop/workbench/services/workbench/service/Workbench', {
	make: Effect.fnUntraced(function* (config: WorkbenchConfig) {
		const assets = yield* Assets
		const crypto = yield* Crypto.Crypto
		const fs = yield* FileSystem.FileSystem
		const path = yield* Path.Path
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
		const preview = yield* Preview
		const processes = yield* Processes
		const publication = yield* Publication
		const repositories = yield* Repositories
		const applicationScope = yield* Scope.Scope
		yield* assets.http()
		yield* preview.http()
		const planning = yield* SubscriptionRef.make<readonly (typeof PlanningConversation.Type)[]>([])
		const lifecycleRevision = yield* SubscriptionRef.make(0)
		const promptFibers = yield* Ref.make(
			HashMap.empty<typeof AgentId.Type, Fiber.Fiber<Prompt.AssistantMessage, AgentError>[]>()
		)
		const activeSubagents = yield* SubscriptionRef.make<
			readonly {
				readonly agentId: typeof AgentId.Type
				readonly parentAgentId: typeof AgentId.Type
				readonly skill?: typeof EligibleSubagentSkill.Type
				readonly task: string
			}[]
		>([])
		const operationLayer = Layer.mergeAll(
			Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
			Layer.succeed(Crypto.Crypto, crypto),
			Layer.succeed(FileSystem.FileSystem, fs),
			Layer.succeed(Path.Path, path)
		)
		const emptyContext = Context.makeUnsafe<unknown>(new Map<string, never>())
		function operation<A, E, R>(effect: Effect.Effect<A, E, R | Scope.Scope>): Effect.Effect<A, E> {
			return pipe(effect, Effect.scoped, Effect.provide(operationLayer), Effect.provideContext(emptyContext))
		}

		const makeIssues = Effect.fnUntraced(function* (repository: typeof RepositoryName.Type) {
			const found = yield* repositories.find(repository)
			const root = path.dirname(found.path)
			return yield* Issues.make({
				directory: path.join(root, '.data', 'issues'),
				historyDirectory: path.join(root, '.data', 'history')
			})
		})
		const issueInstances = yield* RcMap.make({idleTimeToLive: Duration.infinity, lookup: makeIssues})
		function issuesFor(repository: typeof RepositoryName.Type) {
			return RcMap.get(issueInstances, repository)
		}
		const sourceInstances = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: Effect.fnUntraced(function* (repository: typeof RepositoryName.Type) {
				const found = yield* repositories.find(repository)
				return yield* SourceRepositories.make({directory: path.join(path.dirname(found.path), '.resources')})
			})
		})
		function sourcesFor(repository: typeof RepositoryName.Type) {
			return RcMap.get(sourceInstances, repository)
		}
		const gitInstances = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: (key: GitKey) =>
				Effect.gen(function* () {
					const repository = yield* repositories.find(key.repository)
					return yield* Git.make({
						path: repositories.implementationPath(key.repository, key.branch),
						remote: repository.url,
						token: yield* config.token
					})
				})
		})
		function cachedGit(repository: typeof RepositoryName.Type, branch: typeof BranchName.Type) {
			return RcMap.get(gitInstances, new GitKey({branch, repository}))
		}
		const githubInstances = yield* RcMap.make({
			idleTimeToLive: Duration.infinity,
			lookup: (name: typeof RepositoryName.Type) =>
				Effect.gen(function* () {
					const repository = yield* repositories.find(name)
					return yield* GitHub.make({path: repository.path, token: yield* config.token})
				})
		})
		const sessionDirectory = Effect.fnUntraced(function* (repository: typeof RepositoryName.Type) {
			const found = yield* repositories.find(repository)
			return path.join(path.dirname(found.path), '.data', 'sessions')
		})
		const savePlanInternal = Effect.fnUntraced(function* (input: {
			readonly agentId: typeof AgentId.Type
			readonly branch?: typeof BranchName.Type
			readonly plan: string
			readonly repository: typeof RepositoryName.Type
		}) {
			const issues = yield* issuesFor(input.repository)
			if (Predicate.isUndefined(input.branch)) {
				const branch = yield* issues.create({agentId: input.agentId, plan: input.plan})
				yield* SubscriptionRef.update(
					planning,
					Array.filter(item => item.agentId !== input.agentId)
				)
				return branch
			}
			yield* issues.save({branch: input.branch, plan: input.plan})
			return input.branch
		})

		type AgentInstance = Effect.Success<ReturnType<typeof Agent.make>>
		type MakeAgentInput = {
			readonly branch?: typeof BranchName.Type
			readonly capability: 'implementation' | 'planning' | 'subagent'
			readonly cwd: string
			readonly id?: typeof AgentId.Type
			readonly repository: typeof RepositoryName.Type
			readonly skill?: typeof EligibleSubagentSkill.Type
			readonly systemPrompt: string
		}
		function makeAgent(input: MakeAgentInput): Effect.Effect<AgentInstance, WorkbenchError, Scope.Scope> {
			return Effect.gen(function* () {
				const identity = yield* Ref.make(input.id ?? AgentId.make('pending'))
				const sessions = yield* sessionDirectory(input.repository).pipe(failure('failed to resolve agent sessions'))
				const issueService = yield* issuesFor(input.repository).pipe(failure('failed to resolve agent issue'))
				const CodeMode = Tool.make('code_mode', {
					dependencies: [ChildProcessSpawner.ChildProcessSpawner, Crypto.Crypto, FileSystem.FileSystem, Path.Path],
					description:
						'Run one final Effect.gen program using only effect, client, and context. Use this for Workbench application operations.',
					failure: WorkbenchError,
					parameters: Schema.Struct({source: Schema.String}),
					success: Schema.Json
				})
				const Subagent = Tool.make('subagent', {
					dependencies: [ChildProcessSpawner.ChildProcessSpawner, Crypto.Crypto, FileSystem.FileSystem, Path.Path],
					description: 'Run one focused subtask in an awaited recursive subagent.',
					failure: WorkbenchError,
					parameters: Schema.Struct({skill: Schema.optional(EligibleSubagentSkill), task: Schema.String}),
					success: Schema.Struct({agentId: AgentId, message: Prompt.AssistantMessage})
				})
				const toolkit = Toolkit.make(CodeMode, Subagent)
				const handlers = toolkit.toLayer({
					code_mode: Effect.fnUntraced(function* ({source}) {
						const agentId = yield* Ref.get(identity)
						const currentBranch = pipe(
							yield* SubscriptionRef.get(issueService.entries),
							Array.findFirst(entry => entry.issue.agentId === agentId),
							Option.map(entry => entry.branch),
							Option.getOrElse(() => input.branch)
						)
						const context: CodeModeContext = {
							agent: agentId,
							issue: currentBranch,
							repository: input.repository,
							worktree: input.cwd
						}
						const requireBranch = Effect.gen(function* () {
							if (Predicate.isUndefined(currentBranch)) {
								return yield* WorkbenchError.make({message: 'this operation requires a saved issue'})
							}
							return currentBranch
						})
						const fullClient = {
							'agent.assets.upload': (payload: {readonly bytes: Uint8Array}) =>
								operation(assets.upload({...payload, repository: input.repository})),
							'agent.implementation.handoff': () =>
								operation(
									pipe(
										requireBranch,
										Effect.flatMap(issueBranch => issueService.prepareImplementation(issueBranch))
									)
								),
							'agent.implementation.start': () =>
								operation(
									pipe(
										requireBranch,
										Effect.flatMap(issueBranch =>
											startImplementationInternal({branch: issueBranch, repository: input.repository})
										)
									)
								),
							'agent.issue.close': () =>
								operation(
									pipe(
										requireBranch,
										Effect.flatMap(issueBranch =>
											Effect.suspend(() => closeIssue({branch: issueBranch, repository: input.repository}))
										)
									)
								),
							'agent.issue.history': () => operation(issueService.history()),
							'agent.issue.savePlan': (payload: {readonly plan: string}) =>
								operation(
									savePlanInternal({agentId, branch: currentBranch, plan: payload.plan, repository: input.repository})
								),
							'agent.preview.expose': (payload: {readonly script: string}) =>
								operation(
									Effect.gen(function* () {
										const process = yield* processes.observe(input.cwd, payload.script)
										return yield* preview.expose({id: agentId, process})
									})
								),
							'agent.preview.revoke': () => operation(preview.revoke(agentId)),
							'agent.process.start': (payload: {readonly script: string}) =>
								operation(processes.start({cwd: input.cwd, script: payload.script})),
							'agent.process.stop': (payload: {readonly script: string}) =>
								operation(processes.stop({cwd: input.cwd, script: payload.script})),
							'agent.publication.publish': (payload: {readonly base?: typeof BranchName.Type}) =>
								operation(
									pipe(
										requireBranch,
										Effect.flatMap(issueBranch =>
											Effect.gen(function* () {
												return yield* publication.publish({
													base: payload.base,
													branch: issueBranch,
													git: yield* cachedGit(input.repository, issueBranch),
													github: yield* RcMap.get(githubInstances, input.repository),
													issues: issueService,
													repository: input.repository
												})
											}).pipe(Effect.tap(() => SubscriptionRef.update(lifecycleRevision, value => value + 1)))
										)
									)
								),
							'agent.repository.alignDefault': () =>
								operation(
									Effect.gen(function* () {
										const issueBranch = yield* requireBranch
										const repository = yield* repositories.synchronize(input.repository)
										const git = yield* cachedGit(input.repository, issueBranch)
										yield* git.merge({branch: `origin/${repository.defaultBranch}`})
										yield* SubscriptionRef.update(lifecycleRevision, value => value + 1)
									})
								),
							'agent.source.add': (payload: {readonly url: URL}) =>
								operation(
									pipe(
										sourcesFor(input.repository),
										Effect.flatMap(sources => sources.add(payload))
									)
								),
							'agent.source.synchronize': (payload: {readonly name: string}) =>
								operation(
									pipe(
										sourcesFor(input.repository),
										Effect.flatMap(sources => sources.synchronize(payload))
									)
								)
						}
						const client = codeModeClientFor(fullClient, input.capability, input.skill)
						return yield* pipe(
							evaluateCodeMode({client, context, layer: Layer.empty, source}),
							Effect.mapError(cause => WorkbenchError.make({cause, message: 'code-mode execution failed'}))
						)
					}),
					subagent: ({skill, task}) =>
						pipe(
							operation(
								Effect.gen(function* () {
									const parentAgentId = yield* Ref.get(identity)
									const child = yield* makeAgent({
										branch: input.branch,
										capability: 'subagent',
										cwd: input.cwd,
										repository: input.repository,
										skill,
										systemPrompt: Predicate.isUndefined(skill)
											? 'Complete only the delegated subtask and return the result to the parent.'
											: `Load and follow the ${skill} skill. Complete only the delegated subtask.`
									})
									const childId = AgentId.make(child.id)
									yield* SubscriptionRef.update(
										activeSubagents,
										Array.append({agentId: childId, parentAgentId, skill, task})
									)
									const message = yield* pipe(
										child.prompt(userMessage(task)),
										Effect.ensuring(
											SubscriptionRef.update(
												activeSubagents,
												Array.filter(active => active.agentId !== childId)
											)
										)
									)
									return {agentId: childId, message}
								})
							),
							Effect.mapError(cause => WorkbenchError.make({cause, message: 'subagent failed'}))
						)
				})
				const agent = yield* Agent.make({
					cwd: input.cwd,
					id: input.id,
					model: config.model,
					reasoningEffort: config.reasoningEffort,
					sessionDirectory: sessions,
					systemPrompt: `${input.systemPrompt}\n\nCode-mode declarations:\n\n${codeModeDeclarationsFor(
						input.capability,
						input.skill
					)}`,
					toolkit
				}).pipe(
					Effect.provide(handlers),
					Effect.mapError(cause =>
						WorkbenchError.make({
							cause,
							message: Schema.is(AgentError)(cause) ? cause.message : 'failed to create agent'
						})
					)
				)
				yield* Ref.set(identity, AgentId.make(agent.id))
				return agent
			})
		}
		const agents = yield* RcMap.make({idleTimeToLive: Duration.infinity, lookup: (key: AgentKey) => makeAgent(key)})
		function cachedAgent(input: AgentKey) {
			return RcMap.get(agents, input)
		}
		const runPrompt = Effect.fnUntraced(function* (agent: AgentInstance, message: Prompt.UserMessage) {
			return yield* agent.prompt(message)
		})
		function addPromptFiber(agentId: typeof AgentId.Type, fiber: Fiber.Fiber<Prompt.AssistantMessage, AgentError>) {
			return Ref.update(promptFibers, current =>
				HashMap.modifyAt(agentId, (existing: Option.Option<Fiber.Fiber<Prompt.AssistantMessage, AgentError>[]>) =>
					Option.match(existing, {
						onNone: () => Option.some([fiber]),
						onSome: fibers => Option.some([...fibers, fiber])
					})
				)(current)
			)
		}
		function removePromptFiber(agentId: typeof AgentId.Type, fiber: Fiber.Fiber<Prompt.AssistantMessage, AgentError>) {
			return Ref.update(promptFibers, current =>
				HashMap.modifyAt(agentId, (existing: Option.Option<Fiber.Fiber<Prompt.AssistantMessage, AgentError>[]>) =>
					Option.flatMap(existing, fibers => {
						const remaining = Array.filter(fibers, currentFiber => currentFiber !== fiber)
						return Array.isReadonlyArrayEmpty(remaining) ? Option.none() : Option.some(remaining)
					})
				)(current)
			)
		}
		const launchPrompt = Effect.fnUntraced(function* (agent: AgentInstance, message: Prompt.UserMessage) {
			const acceptanceFiber = yield* pipe(
				SubscriptionRef.changes(agent.status),
				Stream.drop(1),
				Stream.filter(status => status === 'running' || status === 'retrying'),
				Stream.runHead,
				Effect.flatMap(result =>
					Option.isSome(result)
						? Effect.void
						: WorkbenchError.make({message: 'agent stopped before accepting the prompt'})
				),
				Effect.forkIn(applicationScope, {startImmediately: true})
			)
			const promptFiber = yield* pipe(runPrompt(agent, message), Effect.forkIn(applicationScope))
			const agentId = AgentId.make(agent.id)
			yield* addPromptFiber(agentId, promptFiber)
			yield* pipe(
				Fiber.await(promptFiber),
				Effect.andThen(removePromptFiber(agentId, promptFiber)),
				Effect.forkIn(applicationScope)
			)
			yield* pipe(
				Effect.raceFirst(
					Fiber.join(acceptanceFiber),
					pipe(
						Fiber.join(promptFiber),
						Effect.asVoid,
						Effect.mapError(cause => WorkbenchError.make({cause, message: 'agent rejected the prompt'}))
					)
				),
				Effect.ensuring(Fiber.interrupt(acceptanceFiber))
			)
		})
		function planningAgent(repository: typeof RepositoryName.Type, id: typeof AgentId.Type) {
			return cachedAgent(
				new AgentKey({
					branch: undefined,
					capability: 'planning',
					cwd: repositories.planningPath(repository, id),
					id,
					repository,
					systemPrompt:
						'Plan the requested change. Inspect source and write the complete implementation plan in Markdown. Do not implement it.'
				})
			)
		}
		function implementationAgent(
			repository: typeof RepositoryName.Type,
			branch: typeof BranchName.Type,
			id: typeof AgentId.Type
		) {
			return cachedAgent(
				new AgentKey({
					branch,
					capability: 'implementation',
					cwd: repositories.implementationPath(repository, branch),
					id,
					repository,
					systemPrompt: implementationSystemPrompt
				})
			)
		}
		const restorePlanning = Effect.fnUntraced(function* () {
			const restored = yield* Effect.forEach(
				yield* SubscriptionRef.get(repositories.repositories),
				Effect.fnUntraced(function* (repository) {
					const found = yield* repositories.find(repository.name)
					const directory = path.join(path.dirname(found.path), '.worktrees', 'planning')
					const issueAgentIds = pipe(
						yield* SubscriptionRef.get((yield* issuesFor(repository.name)).entries),
						Array.map(entry => entry.issue.agentId)
					)
					return yield* Effect.forEach(
						yield* fs.readDirectory(directory),
						id => {
							const agentId = AgentId.make(id)
							if (issueAgentIds.includes(agentId)) {
								return Effect.succeed(Option.none<typeof PlanningConversation.Type>())
							}
							return pipe(
								planningAgent(repository.name, agentId),
								Effect.flatMap(agent => SubscriptionRef.get(agent.history)),
								Effect.map(history =>
									Option.some(
										PlanningConversation.make({
											agentId,
											repository: repository.name,
											title: titleFromHistory(history, agentId)
										})
									)
								),
								Effect.orElseSucceed(() => Option.none<typeof PlanningConversation.Type>())
							)
						},
						{concurrency: 8}
					)
				}),
				{concurrency: 4}
			)
			yield* SubscriptionRef.set(planning, pipe(restored, Array.flatten, Array.getSomes))
		})
		yield* restorePlanning()
		const findEntry = Effect.fnUntraced(function* (
			repository: typeof RepositoryName.Type,
			branch: typeof BranchName.Type
		) {
			const issues = yield* issuesFor(repository)
			const entries = yield* SubscriptionRef.get(issues.entries)
			return yield* Option.match(
				Array.findFirst(entries, entry => entry.branch === branch),
				{onNone: () => WorkbenchError.make({message: `unknown issue ${branch}`}), onSome: Effect.succeed}
			)
		})
		const pullRequests = Effect.fnUntraced(function* (repository: typeof RepositoryName.Type) {
			const github = yield* RcMap.get(githubInstances, repository)
			return yield* SubscriptionRef.get(github.pullRequests)
		})
		const removeAgentSessions = Effect.fnUntraced(function* (
			repository: typeof RepositoryName.Type,
			agentIds: readonly (typeof AgentId.Type)[],
			branch?: typeof BranchName.Type
		) {
			const runningPrompts = yield* Ref.get(promptFibers)
			yield* Effect.forEach(
				agentIds,
				agentId =>
					pipe(
						HashMap.get(runningPrompts, agentId),
						Option.match({onNone: () => Effect.void, onSome: Fiber.interruptAll})
					),
				{concurrency: 'unbounded', discard: true}
			)
			yield* Ref.update(promptFibers, current => HashMap.removeMany(current, agentIds))
			yield* Effect.forEach(
				pipe(
					yield* RcMap.keys(agents),
					Array.filter(key => key.repository === repository && agentIds.includes(key.id))
				),
				key => RcMap.invalidate(agents, key),
				{discard: true}
			)
			yield* Effect.forEach(
				pipe(
					yield* RcMap.keys(gitInstances),
					Array.filter(key => key.repository === repository && key.branch === branch)
				),
				key => RcMap.invalidate(gitInstances, key),
				{discard: true}
			)
			const directory = yield* sessionDirectory(repository)
			const files = yield* fs.readDirectory(directory)
			yield* Effect.forEach(
				files.filter(file => agentIds.some(agentId => file.includes(agentId))),
				file => fs.remove(path.join(directory, file)),
				{concurrency: 8, discard: true}
			)
		})
		const reconcileRepository = Effect.fnUntraced(function* (
			repository: typeof RepositoryName.Type,
			currentPullRequests: readonly {readonly head: string; readonly state: 'closed' | 'merged' | 'open'}[],
			disappearedHeads: readonly string[] = []
		) {
			const issues = yield* issuesFor(repository)
			const entries = yield* SubscriptionRef.get(issues.entries)
			for (const entry of entries) {
				const pullRequest = Array.findFirst(currentPullRequests, current => current.head === entry.branch)
				if (Option.isNone(pullRequest) && !disappearedHeads.includes(entry.branch)) continue
				const remoteExists = yield* repositories.remoteBranchExists({branch: entry.branch, repository})
				if (Option.isSome(pullRequest) && pullRequest.value.state === 'open' && remoteExists) continue
				yield* processes.stopAll(repositories.implementationPath(repository, entry.branch))
				yield* repositories.removeIssueMechanics({
					branch: entry.branch,
					planningAgentId: entry.issue.agentId,
					repository
				})
				yield* removeAgentSessions(
					repository,
					Predicate.isUndefined(entry.implementation)
						? [entry.issue.agentId]
						: [entry.issue.agentId, entry.implementation.agentId],
					entry.branch
				)
				yield* issues.archive(entry.branch)
				yield* SubscriptionRef.update(lifecycleRevision, value => value + 1)
			}
		})
		const reconciliation = pipe(
			SubscriptionRef.changes(repositories.repositories),
			Stream.switchMap(current =>
				Stream.mergeAll(
					current.map(repository =>
						Stream.unwrap(
							Effect.gen(function* () {
								const github = yield* RcMap.get(githubInstances, repository.name)
								return pipe(
									SubscriptionRef.changes(github.pullRequests),
									Stream.mapEffect(snapshot => reconcileRepository(repository.name, snapshot).pipe(Effect.ignore))
								)
							})
						)
					),
					{concurrency: 'unbounded'}
				)
			),
			Stream.runDrain
		)
		yield* Effect.forkScoped(reconciliation)
		const synchronizeRepositories = Effect.gen(function* () {
			yield* Effect.forEach(
				yield* SubscriptionRef.get(repositories.repositories),
				Effect.fnUntraced(function* (repository) {
					const issues = yield* issuesFor(repository.name)
					const entries = yield* SubscriptionRef.get(issues.entries)
					const existingHeads = yield* Effect.forEach(
						entries,
						Effect.fnUntraced(function* (entry) {
							return (yield* repositories.remoteBranchExists({branch: entry.branch, repository: repository.name}))
								? [entry.branch]
								: []
						}),
						{concurrency: 8}
					)
					yield* repositories.synchronize(repository.name)
					const disappearedHeads = yield* Effect.forEach(
						Array.flatten(existingHeads),
						Effect.fnUntraced(function* (branch) {
							return (yield* repositories.remoteBranchExists({branch, repository: repository.name})) ? [] : [branch]
						}),
						{concurrency: 8}
					)
					yield* reconcileRepository(
						repository.name,
						yield* pullRequests(repository.name),
						Array.flatten(disappearedHeads)
					)
				}),
				{concurrency: 4, discard: true}
			)
		})
		yield* pipe(synchronizeRepositories, Effect.ignore, Effect.repeat(Schedule.spaced('1 minute')), Effect.forkScoped)
		const startImplementationInternal = Effect.fnUntraced(function* (input: {
			readonly branch: typeof BranchName.Type
			readonly repository: typeof RepositoryName.Type
		}) {
			const issues = yield* issuesFor(input.repository)
			const entry = yield* findEntry(input.repository, input.branch)
			const handoff = yield* issues.prepareImplementation(input.branch)
			const prompt = userMessage(
				`Implement this current accepted plan.\n\nPlan hash: ${handoff.currentHash}\nPrevious hash: ${handoff.previousHash ?? 'none'}\n\nPlan:\n${handoff.plan}\n\nExact plan diff:\n${handoff.diff}`
			)
			if (Predicate.isNotUndefined(entry.implementation)) {
				const agent = yield* implementationAgent(input.repository, input.branch, entry.implementation.agentId)
				yield* launchPrompt(agent, prompt)
				yield* issues.acceptImplementation({
					agentId: entry.implementation.agentId,
					branch: input.branch,
					planHash: handoff.currentHash
				})
				return entry.implementation.agentId
			}
			const cwd = yield* repositories.createImplementationWorktree(input)
			const agentId = yield* Effect.scoped(
				pipe(
					makeAgent({
						branch: input.branch,
						capability: 'implementation',
						cwd,
						repository: input.repository,
						systemPrompt: implementationSystemPrompt
					}),
					Effect.map(agent => AgentId.make(agent.id))
				)
			)
			yield* pipe(
				Effect.gen(function* () {
					yield* launchPrompt(yield* implementationAgent(input.repository, input.branch, agentId), prompt)
					yield* issues.acceptImplementation({agentId, branch: input.branch, planHash: handoff.currentHash})
				}),
				Effect.tapError(() => removeAgentSessions(input.repository, [agentId], input.branch))
			)
			return agentId
		})

		function conversationStream(input: {
			readonly branch?: typeof BranchName.Type
			readonly id: typeof AgentId.Type
			readonly repository: typeof RepositoryName.Type
		}) {
			return Stream.unwrap(
				Effect.gen(function* () {
					const agent = yield* Predicate.isUndefined(input.branch)
						? planningAgent(input.repository, input.id)
						: implementationAgent(input.repository, input.branch, input.id)
					return pipe(
						Stream.merge(SubscriptionRef.changes(agent.history), SubscriptionRef.changes(agent.status), {
							haltStrategy: 'either'
						}),
						Stream.mapEffect(() =>
							Effect.gen(function* () {
								return Conversation.make({
									history: yield* SubscriptionRef.get(agent.history),
									id: input.id,
									status: yield* SubscriptionRef.get(agent.status)
								})
							})
						)
					)
				})
			)
		}

		const issueSnapshot = Effect.fnUntraced(function* (repository: typeof RepositoryName.Type) {
			const issues = yield* issuesFor(repository)
			const pullRequestsForRepository = yield* pullRequests(repository)
			return yield* Effect.forEach(
				pipe(
					yield* SubscriptionRef.get(issues.entries),
					Array.filter(entry =>
						pipe(
							pullRequestsForRepository,
							Array.findFirst(current => current.head === entry.branch),
							Option.match({onNone: () => true, onSome: pullRequest => pullRequest.state === 'open'})
						)
					)
				),
				Effect.fnUntraced(function* (entry) {
					const handoff = yield* issues.prepareImplementation(entry.branch)
					const pullRequest = Array.findFirst(pullRequestsForRepository, current => current.head === entry.branch)
					const git = Predicate.isUndefined(entry.implementation)
						? undefined
						: yield* cachedGit(repository, entry.branch)
					const cleanAndPushed =
						Predicate.isUndefined(git) ||
						(!(yield* SubscriptionRef.get(git.status)).dirty &&
							!(yield* repositories.hasUnpushedCommits({branch: entry.branch, repository})))
					return ActiveIssue.make({
						branch: entry.branch,
						implementationAgentId: entry.implementation?.agentId,
						lifecycle: lifecycle({
							cleanAndPushed,
							currentHash: handoff.currentHash,
							implementation: entry.implementation,
							published: Option.isSome(pullRequest) && pullRequest.value.state === 'open' && pullRequest.value.draft,
							running:
								Predicate.isNotUndefined(entry.implementation) &&
								(yield* SubscriptionRef.get(
									(yield* implementationAgent(repository, entry.branch, entry.implementation.agentId)).status
								)) !== 'idle'
						}),
						plan: handoff.plan,
						planIterations: entry.issue.planIterations.length,
						planningAgentId: entry.issue.agentId,
						pullRequest: Option.getOrUndefined(pullRequest),
						repository
					})
				}),
				{concurrency: 8}
			)
		})

		function issuesStream(repository: typeof RepositoryName.Type) {
			return Stream.unwrap(
				Effect.gen(function* () {
					const issues = yield* issuesFor(repository)
					const github = yield* RcMap.get(githubInstances, repository)
					return pipe(
						SubscriptionRef.changes(issues.entries),
						Stream.switchMap(entries =>
							Stream.unwrap(
								Effect.gen(function* () {
									const changes: Stream.Stream<unknown>[] = [
										SubscriptionRef.changes(github.pullRequests),
										SubscriptionRef.changes(lifecycleRevision)
									]
									for (const entry of entries) {
										if (Predicate.isUndefined(entry.implementation)) continue
										const git = yield* cachedGit(repository, entry.branch)
										const agent = yield* implementationAgent(repository, entry.branch, entry.implementation.agentId)
										changes.push(SubscriptionRef.changes(git.status), SubscriptionRef.changes(agent.status))
									}
									return pipe(
										Stream.mergeAll(changes, {concurrency: 'unbounded'}),
										Stream.mapEffect(() => issueSnapshot(repository))
									)
								})
							)
						)
					)
				})
			)
		}

		function inspectorStream(input: {
			readonly branch: typeof BranchName.Type
			readonly repository: typeof RepositoryName.Type
		}) {
			return Stream.unwrap(
				Effect.gen(function* () {
					const issues = yield* issuesFor(input.repository)
					const github = yield* RcMap.get(githubInstances, input.repository)
					const sources = yield* sourcesFor(input.repository)
					return pipe(
						SubscriptionRef.changes(issues.entries),
						Stream.switchMap(entries =>
							Stream.unwrap(
								Effect.gen(function* () {
									const entry = yield* pipe(
										entries,
										Array.findFirst(current => current.branch === input.branch),
										Option.match({
											onNone: () => WorkbenchError.make({message: `unknown issue ${input.branch}`}),
											onSome: Effect.succeed
										})
									)
									const implementationPath = repositories.implementationPath(input.repository, input.branch)
									const git = Predicate.isUndefined(entry.implementation)
										? undefined
										: yield* cachedGit(input.repository, input.branch)
									const processChanges = Predicate.isUndefined(entry.implementation)
										? Stream.succeed([])
										: processes.stream(implementationPath)
									const changes: Stream.Stream<unknown, unknown>[] = [
										SubscriptionRef.changes(activeSubagents),
										SubscriptionRef.changes(github.pullRequests),
										SubscriptionRef.changes(lifecycleRevision),
										SubscriptionRef.changes(sources.repositories),
										processChanges
									]
									if (Predicate.isNotUndefined(git)) changes.push(SubscriptionRef.changes(git.status))
									return pipe(
										Stream.mergeAll(changes, {concurrency: 'unbounded'}),
										Stream.mapEffect(() =>
											Effect.gen(function* () {
												const current = yield* findEntry(input.repository, input.branch)
												const pullRequest = Array.findFirst(
													yield* SubscriptionRef.get(github.pullRequests),
													value => value.head === input.branch
												)
												return IssueInspector.make({
													activeSubagents: pipe(
														yield* SubscriptionRef.get(activeSubagents),
														Array.filter(subagent =>
															[current.issue.agentId, current.implementation?.agentId].includes(subagent.parentAgentId)
														)
													),
													branch: input.branch,
													changes: Predicate.isUndefined(git) ? [] : yield* git.diff({}),
													processes: Predicate.isUndefined(current.implementation)
														? []
														: yield* processes.list(implementationPath),
													pullRequest: Option.getOrUndefined(pullRequest),
													sources: yield* SubscriptionRef.get(sources.repositories),
													worktree: Predicate.isUndefined(current.implementation) ? undefined : implementationPath
												})
											})
										)
									)
								})
							)
						)
					)
				})
			)
		}

		const closeIssue = Effect.fn('Workbench.close')(function* (input: {
			readonly branch: typeof BranchName.Type
			readonly repository: typeof RepositoryName.Type
		}) {
			const issues = yield* issuesFor(input.repository)
			const entry = yield* findEntry(input.repository, input.branch)
			const published = Array.some(
				yield* pullRequests(input.repository),
				pullRequest => pullRequest.head === input.branch
			)
			if (published) yield* repositories.closeRemote(input)
			const implementationPath = repositories.implementationPath(input.repository, input.branch)
			yield* processes.stopAll(implementationPath)
			yield* repositories.removeIssueMechanics({...input, planningAgentId: entry.issue.agentId})
			yield* removeAgentSessions(
				input.repository,
				Predicate.isUndefined(entry.implementation)
					? [entry.issue.agentId]
					: [entry.issue.agentId, entry.implementation.agentId],
				input.branch
			)
			yield* published ? issues.archive(input.branch) : issues.remove(input.branch)
		})

		return {
			addSource: Effect.fn('Workbench.addSource')(function* (input: {
				readonly repository: typeof RepositoryName.Type
				readonly url: URL
			}) {
				return yield* (yield* sourcesFor(input.repository)).add({url: input.url})
			}),
			alignDefault: Effect.fn('Workbench.alignDefault')(function* (input: {
				readonly branch: typeof BranchName.Type
				readonly repository: typeof RepositoryName.Type
			}) {
				const repository = yield* repositories.synchronize(input.repository)
				const git = yield* cachedGit(input.repository, input.branch)
				yield* git.merge({branch: `origin/${repository.defaultBranch}`})
				yield* SubscriptionRef.update(lifecycleRevision, value => value + 1)
			}),
			assets,
			close: closeIssue,
			conversation: conversationStream,
			createPlanning: Effect.fn('Workbench.createPlanning')(function* (input: {
				readonly prompt?: string
				readonly repository: typeof RepositoryName.Type
			}) {
				const temporary = AgentId.make(yield* crypto.randomUUIDv4)
				const cwd = yield* repositories.createPlanningWorktree({agentId: temporary, repository: input.repository})
				const id = yield* Effect.scoped(
					pipe(
						makeAgent({
							capability: 'planning',
							cwd,
							repository: input.repository,
							systemPrompt:
								'Plan the requested change. Inspect source and write the complete implementation plan in Markdown. Do not implement it.'
						}),
						Effect.map(agent => AgentId.make(agent.id))
					)
				)
				const value = PlanningConversation.make({
					agentId: id,
					repository: input.repository,
					title: planningTitle(input.prompt, id)
				})
				yield* SubscriptionRef.update(planning, Array.append(value))
				yield* repositories.movePlanningWorktree({from: temporary, repository: input.repository, to: id})
				if (Predicate.isNotUndefined(input.prompt)) {
					yield* launchPrompt(yield* planningAgent(input.repository, id), userMessage(input.prompt))
				}
				return value
			}),
			handoff: Effect.fn('Workbench.handoff')(function* (input: {
				readonly branch: typeof BranchName.Type
				readonly repository: typeof RepositoryName.Type
			}) {
				const issues = yield* issuesFor(input.repository)
				return yield* issues.prepareImplementation(input.branch)
			}),
			history: Effect.fn('Workbench.history')(function* (repository: typeof RepositoryName.Type) {
				return yield* (yield* issuesFor(repository)).history()
			}),
			implementationPath: repositories.implementationPath,
			implementationPrompt: Effect.fn('Workbench.implementationPrompt')(function* (input: {
				readonly branch: typeof BranchName.Type
				readonly prompt: string
				readonly repository: typeof RepositoryName.Type
			}) {
				const entry = yield* findEntry(input.repository, input.branch)
				if (Predicate.isUndefined(entry.implementation)) {
					return yield* WorkbenchError.make({message: `${input.branch} has no implementation conversation`})
				}
				const agent = yield* implementationAgent(input.repository, input.branch, entry.implementation.agentId)
				yield* launchPrompt(
					agent,
					userMessage(
						`Address only a defect or minor code-quality problem without changing the accepted plan. If this request conflicts with or changes the plan, return it to planning instead.\n\nRequest:\n${input.prompt}`
					)
				)
			}),
			inspector: inspectorStream,
			issues: issuesStream,
			planning,
			planningPrompt: Effect.fn('Workbench.planningPrompt')(function* (input: {
				readonly agentId: typeof AgentId.Type
				readonly prompt: string
				readonly repository: typeof RepositoryName.Type
			}) {
				yield* SubscriptionRef.update(
					planning,
					Array.map(item =>
						item.agentId === input.agentId && String.startsWith('Planning ')(item.title)
							? PlanningConversation.make({...item, title: planningTitle(input.prompt, input.agentId)})
							: item
					)
				)
				const agent = yield* planningAgent(input.repository, input.agentId)
				yield* launchPrompt(agent, userMessage(input.prompt))
			}),
			preview,
			processes,
			publish: Effect.fn('Workbench.publish')(function* (input: {
				readonly base?: typeof BranchName.Type
				readonly branch: typeof BranchName.Type
				readonly repository: typeof RepositoryName.Type
			}) {
				const issues = yield* issuesFor(input.repository)
				return yield* pipe(
					publication.publish({
						...input,
						git: yield* cachedGit(input.repository, input.branch),
						github: yield* RcMap.get(githubInstances, input.repository),
						issues
					}),
					Effect.tap(() => SubscriptionRef.update(lifecycleRevision, value => value + 1))
				)
			}),
			repositories: repositories.repositories,
			savePlan: savePlanInternal,
			startImplementation: startImplementationInternal,
			synchronizeSource: Effect.fn('Workbench.synchronizeSource')(function* (input: {
				readonly name: string
				readonly repository: typeof RepositoryName.Type
			}) {
				return yield* (yield* sourcesFor(input.repository)).synchronize({name: input.name})
			})
		}
	})
}) {
	public static layer = (config: WorkbenchConfig) =>
		Layer.effect(this, this.make(config).pipe(failure('failed to start Workbench')))
}
