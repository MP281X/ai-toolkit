import {useAtomRefresh, useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Effect, Hash, Match, Option, Schema, Stream, String, pipe} from 'effect'

import {Outlet, createFileRoute, useRouterState} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition, useEffect, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom, projectsAtom} from '#lib/state.ts'
import {
	AgentIcon,
	BotIcon,
	CircleIcon,
	GitBranch,
	GitBranchPlus,
	GlobeIcon,
	Layers,
	PackageIcon,
	PanelTop,
	PlayIcon,
	SparklesIcon,
	Square,
	TerminalIcon,
	Trash
} from '@deslop/components/icons'
import {TreeExplorer, TreeExplorerRow, TreeExplorerSection} from '@deslop/components/tree-explorer'
import {Button} from '@deslop/components/ui/button'
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut
} from '@deslop/components/ui/command'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@deslop/components/ui/resizable'
import type {GitProject} from '@deslop/git/schema'
import {GitBranchesSnapshot} from '@deslop/git/schema'
import type {TerminalStatus} from '@deslop/terminal/schema'

export const Route = createFileRoute('/(home)')({
	component: HomeLayout,
	validateSearch: Schema.toStandardSchemaV1(Schema.Struct({}))
})

const projectAccentClassNames = [
	'[&_svg]:text-[oklch(0.74_0.085_50)] [&_.tree-label]:text-[oklch(0.8_0.085_50)]',
	'[&_svg]:text-[oklch(0.72_0.075_150)] [&_.tree-label]:text-[oklch(0.78_0.075_150)]',
	'[&_svg]:text-[oklch(0.72_0.075_220)] [&_.tree-label]:text-[oklch(0.78_0.075_220)]',
	'[&_svg]:text-[oklch(0.72_0.075_285)] [&_.tree-label]:text-[oklch(0.78_0.075_285)]',
	'[&_svg]:text-[oklch(0.72_0.075_20)] [&_.tree-label]:text-[oklch(0.78_0.075_20)]',
	'[&_svg]:text-[oklch(0.74_0.065_95)] [&_.tree-label]:text-[oklch(0.8_0.065_95)]'
] as const

const runsAtom = Atom.family((cwd: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			Effect.flatMap(RpcClient, client =>
				String.isNonEmpty(cwd) ? client('runs.scripts', {cwd}) : Effect.succeed([])
			),
			{initialValue: []}
		)
	)
)

const runStatusAtom = Atom.family(
	(input: {readonly command: string; readonly cwd: string; readonly sessionId: string}) =>
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client =>
					client('terminal.status', {
						args: ['-lc', input.command],
						command: 'sh',
						cwd: input.cwd,
						sessionId: input.sessionId
					})
				),
				Stream.unwrap
			),
			{initialValue: {state: 'starting'} as TerminalStatus}
		)
)

const branchesAtom = Atom.family((cwd: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			Effect.flatMap(RpcClient, client =>
				String.isNonEmpty(cwd)
					? client('projects.branches', {cwd})
					: Effect.succeed(new GitBranchesSnapshot({branches: [], defaultBranch: 'main'}))
			),
			{initialValue: new GitBranchesSnapshot({branches: [], defaultBranch: 'main'})}
		)
	)
)

function HomeLayout() {
	const navigate = Route.useNavigate()
	const homeRouteState = useRouterState({
		select: state => {
			const activeView = pipe(
				Match.value(state.location.pathname),
				Match.when(String.endsWith('/terminal'), () => 'terminal' as const),
				Match.when(String.endsWith('/browser'), () => 'browser' as const),
				Match.when(String.endsWith('/run'), () => 'run' as const),
				Match.when(String.endsWith('/agent'), () => 'agent' as const),
				Match.orElse(() => 'diff' as const)
			)

			return {activeView, activeWorktreeId: String.split('/')(state.location.pathname)[1]}
		}
	})
	const activeHome = useAtomSuspense(activeHomeAtom(homeRouteState.activeWorktreeId))

	return (
		<div className="bg-background h-full min-h-0 flex-1 overflow-hidden font-mono">
			<ResizablePanelGroup orientation="horizontal" className="h-full min-h-0 overflow-hidden">
				<ResizablePanel defaultSize="22%" minSize="16%" maxSize="34%">
					<WorktreeManager
						activeProject={activeHome.value.activeProject}
						activeWorktree={activeHome.value.activeWorktree}
						activeView={homeRouteState.activeView}
						projects={activeHome.value.projects}
						selectWorktree={worktreeRoot => {
							startTransition(() => {
								void navigate({
									params: {worktree: Math.abs(Hash.string(worktreeRoot)).toString(36)},
									to: '/$worktree/diff'
								})
							})
						}}
						selectTerminal={worktreeRoot => {
							startTransition(() => {
								void navigate({
									params: {worktree: Math.abs(Hash.string(worktreeRoot)).toString(36)},
									to: '/$worktree/terminal'
								})
							})
						}}
						selectBrowser={worktreeRoot => {
							startTransition(() => {
								void navigate({
									params: {worktree: Math.abs(Hash.string(worktreeRoot)).toString(36)},
									to: '/$worktree/browser'
								})
							})
						}}
						selectAgent={(worktreeRoot, sessionId, command, args) => {
							startTransition(() => {
								void navigate({
									params: {worktree: Math.abs(Hash.string(worktreeRoot)).toString(36)},
									search: {args, command, sessionId},
									to: '/$worktree/agent'
								})
							})
						}}
						selectRun={(worktreeRoot, sessionId, command, inactive) => {
							startTransition(() => {
								void navigate({
									params: {worktree: Math.abs(Hash.string(worktreeRoot)).toString(36)},
									search: {command, inactive, sessionId},
									to: '/$worktree/run'
								})
							})
						}}
					/>
				</ResizablePanel>

				<ResizableHandle />

				<ResizablePanel defaultSize="86%" minSize="60%">
					<div className="flex h-full min-h-0 flex-col">
						<Outlet />
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	)
}

function pathLabel(value: string) {
	const segments = String.split('/')(value)

	for (let index = segments.length - 1; index >= 0; index -= 1) {
		if (String.isNonEmpty(segments[index] ?? '') && segments[index] !== '.') return segments[index] ?? value
	}

	return value
}

function shortPath(value: string) {
	const homeSegments = String.startsWith('/home/')(value)
		? pipe(String.split('/')(value), Array.take(3), Array.join('/'))
		: undefined
	if (homeSegments && String.startsWith(`${homeSegments}/`)(value)) {
		return `~/${String.slice(String.length(homeSegments) + 1)(value)}`
	}
	return pathLabel(value)
}

function WorktreeIcon(input: {readonly dirty: boolean; readonly root: boolean}) {
	if (input.root) return <PanelTop className={`size-3.5 ${input.dirty ? 'text-amber-500' : 'text-current'}`} />
	return <Square className={`size-3.5 ${input.dirty ? 'text-amber-500' : 'text-current'}`} />
}

function runSessionId(scriptName: string, taskIndex: number) {
	return `run:${scriptName}:${taskIndex}`
}

function runTaskCommand(script: {readonly name: string; readonly tasks: readonly string[]}, taskIndex: number) {
	return script.tasks.length > 1 ? (script.tasks[taskIndex] ?? '') : `vp run ${script.name}`
}

function WorktreeRuns(input: {
	readonly cwd: string
	readonly selectRun: (cwd: string, sessionId: string, command: string, inactive?: boolean) => void
}) {
	const scripts = useAtomSuspense(runsAtom(input.cwd))
	const restart = useAtomSet(RpcClient.mutation('terminal.restart'), {mode: 'promise'})
	const stop = useAtomSet(RpcClient.mutation('terminal.stop'), {mode: 'promise'})
	const [activeSessions, setActiveSessions] = useState<ReadonlySet<string>>(new Set())
	const [expanded, setExpanded] = useState(false)
	const [expandedScripts, setExpandedScripts] = useState<ReadonlySet<string>>(new Set())
	const [lastStates, setLastStates] = useState<ReadonlyMap<string, TerminalStatus['state']>>(new Map())

	function payload(scriptName: string, taskIndex: number, command: string) {
		return {args: ['-lc', command], command: 'sh', cwd: input.cwd, sessionId: runSessionId(scriptName, taskIndex)}
	}

	function startTask(scriptName: string, taskIndex: number, command: string, focus = true) {
		const sessionId = runSessionId(scriptName, taskIndex)
		setActiveSessions(current => new Set(current).add(sessionId))
		setLastStates(current => new Map(current).set(sessionId, 'starting'))
		void restart({payload: payload(scriptName, taskIndex, command)})
		if (focus) input.selectRun(input.cwd, sessionId, command)
	}

	function updateTaskState(sessionId: string, state: TerminalStatus['state']) {
		setLastStates(current => (current.get(sessionId) === state ? current : new Map(current).set(sessionId, state)))
		if (state === 'exited' || state === 'failed' || state === 'stopped') deactivateTask(sessionId)
	}

	function deactivateTask(sessionId: string) {
		setActiveSessions(current => {
			const next = new Set(current)
			next.delete(sessionId)
			return next
		})
	}

	function stopTask(scriptName: string, taskIndex: number, command: string) {
		const sessionId = runSessionId(scriptName, taskIndex)
		setLastStates(current => new Map(current).set(sessionId, 'stopped'))
		deactivateTask(sessionId)
		void stop({payload: payload(scriptName, taskIndex, command)})
	}

	if (scripts.value.length === 0) return null

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				icon={<PackageIcon className="size-3.5" />}
				selected={false}
				onClick={() => {
					setExpanded(value => !value)
				}}
			>
				scripts
			</TreeExplorerRow>
			{expanded && (
				<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
					{Array.map(scripts.value, script => {
						const parallel = script.tasks.length > 1
						const groupCommands = script.tasks.map((_, taskIndex) => runTaskCommand(script, taskIndex))
						const firstSessionId = runSessionId(script.name, 0)
						const scriptExpanded = expandedScripts.has(script.name)
						const active = groupCommands.some((_, taskIndex) =>
							activeSessions.has(runSessionId(script.name, taskIndex))
						)
						const groupState = active ? 'running' : lastStates.get(firstSessionId)
						const groupIcon =
							!parallel && activeSessions.has(firstSessionId) ? (
								<RunTaskStatus
									command={groupCommands[0] ?? ''}
									cwd={input.cwd}
									onState={state => updateTaskState(firstSessionId, state)}
									sessionId={firstSessionId}
								/>
							) : (
								<StatusDot state={groupState} />
							)
						return (
							<li key={script.name} className="w-full min-w-0">
								<TreeExplorerRow
									actions={
										<button
											type="button"
											className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center"
											onClick={event => {
												event.stopPropagation()
												if (active) {
													groupCommands.forEach((command, taskIndex) => stopTask(script.name, taskIndex, command))
												} else {
													groupCommands.forEach((command, taskIndex) =>
														startTask(script.name, taskIndex, command, taskIndex === 0)
													)
												}
											}}
											title={active ? 'Stop script' : 'Start script'}
										>
											{active ? <Square className="size-3" /> : <PlayIcon className="size-3" />}
										</button>
									}
									icon={groupIcon}
									selected={false}
									onClick={() => {
										if (parallel) {
											setExpandedScripts(current => {
												const next = new Set(current)
												if (next.has(script.name)) next.delete(script.name)
												else next.add(script.name)
												return next
											})
										} else if (active || lastStates.has(firstSessionId)) {
											input.selectRun(input.cwd, firstSessionId, groupCommands[0] ?? '')
										} else {
											input.selectRun(input.cwd, firstSessionId, groupCommands[0] ?? '', true)
										}
									}}
								>
									{script.name}
								</TreeExplorerRow>
								{parallel && scriptExpanded && (
									<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
										{groupCommands.map((command, taskIndex) => (
											<RunTaskRow
												key={runSessionId(script.name, taskIndex)}
												active={activeSessions.has(runSessionId(script.name, taskIndex))}
												command={command}
												cwd={input.cwd}
												lastState={lastStates.get(runSessionId(script.name, taskIndex))}
												onState={state => updateTaskState(runSessionId(script.name, taskIndex), state)}
												selectRun={input.selectRun}
												sessionId={runSessionId(script.name, taskIndex)}
												start={() => startTask(script.name, taskIndex, command)}
												stop={() => stopTask(script.name, taskIndex, command)}
											/>
										))}
									</ul>
								)}
							</li>
						)
					})}
				</ul>
			)}
		</li>
	)
}

function RunTaskRow(input: {
	readonly active: boolean
	readonly command: string
	readonly cwd: string
	readonly lastState?: TerminalStatus['state']
	readonly onState: (state: TerminalStatus['state']) => void
	readonly selectRun: (cwd: string, sessionId: string, command: string, inactive?: boolean) => void
	readonly sessionId: string
	readonly start: () => void
	readonly stop: () => void
}) {
	const status = input.active ? (
		<RunTaskStatus command={input.command} cwd={input.cwd} onState={input.onState} sessionId={input.sessionId} />
	) : null
	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				actions={
					<button
						type="button"
						className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center"
						onClick={event => {
							event.stopPropagation()
							if (input.active) input.stop()
							else input.start()
						}}
						title={input.active ? 'Stop task' : 'Start task'}
					>
						{input.active ? <Square className="size-3" /> : <PlayIcon className="size-3" />}
					</button>
				}
				icon={status ?? <StatusDot state={input.lastState} />}
				selected={false}
				onClick={() => {
					if (input.active || input.lastState) input.selectRun(input.cwd, input.sessionId, input.command)
					else input.selectRun(input.cwd, input.sessionId, input.command, true)
				}}
			>
				{input.command}
			</TreeExplorerRow>
		</li>
	)
}

function StatusDot(input: {readonly state?: TerminalStatus['state']}) {
	if (input.state === 'running' || input.state === 'starting') {
		return <CircleIcon className="fill-primary text-primary size-2.5" />
	}
	if (input.state === 'failed' || input.state === 'stopped') {
		return <CircleIcon className="text-destructive fill-destructive size-2.5" />
	}
	if (input.state === 'exited') return <CircleIcon className="size-2.5 fill-emerald-500 text-emerald-500" />
	return <CircleIcon className="text-muted-foreground size-2.5" />
}

function RunTaskStatus(input: {
	readonly command: string
	readonly cwd: string
	readonly onState: (state: TerminalStatus['state']) => void
	readonly sessionId: string
}) {
	const status = useAtomSuspense(runStatusAtom(input))
	const [observedCurrentRun, setObservedCurrentRun] = useState(false)
	const state = status.value.state
	const staleFinalState = !observedCurrentRun && (state === 'exited' || state === 'failed' || state === 'stopped')

	useEffect(() => {
		if (state === 'running' || state === 'starting') {
			setObservedCurrentRun(true)
			input.onState(state)
		} else if (observedCurrentRun) {
			input.onState(state)
		}
	}, [input.onState, observedCurrentRun, state])

	return <StatusDot state={staleFinalState ? 'running' : state} />
}

const agentProfiles = [
	{args: ['--model', 'openai/gpt-5.5'], command: 'opencode', icon: 'opencode', label: 'opencode'},
	{
		args: ['--model', 'gpt-5.5', '-c', 'model_reasoning_effort=low', '--dangerously-bypass-approvals-and-sandbox'],
		command: 'codex',
		icon: 'codex',
		label: 'codex'
	},
	{args: ['--model', 'openai/gpt-5.5:low'], command: 'pi', icon: 'pi', label: 'pi'}
] as const

type AgentSession = {
	readonly args: readonly string[]
	readonly command: string
	readonly id: string
	readonly icon: (typeof agentProfiles)[number]['icon']
	readonly label: string
}

function WorktreeAgents(input: {
	readonly cwd: string
	readonly selectAgent: (cwd: string, sessionId: string, command: string, args: readonly string[]) => void
}) {
	const stop = useAtomSet(RpcClient.mutation('terminal.stop'), {mode: 'promise'})
	const [sessions, setSessions] = useState<readonly AgentSession[]>([])

	function startAgent(profile: (typeof agentProfiles)[number]) {
		const session: AgentSession = {
			args: profile.args,
			command: profile.command,
			icon: profile.icon,
			id: `agent:${profile.label}:${crypto.randomUUID()}`,
			label: `${profile.label} ${sessions.filter(session => session.command === profile.command).length + 1}`
		}
		setSessions(current => [...current, session])
		input.selectAgent(input.cwd, session.id, session.command, session.args)
	}

	function stopAgent(session: AgentSession) {
		setSessions(current => current.filter(candidate => candidate.id !== session.id))
		void stop({payload: {args: session.args, command: session.command, cwd: input.cwd, sessionId: session.id}})
	}

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow icon={<BotIcon className="size-3.5" />} selected={false} onClick={() => {}}>
				agents
			</TreeExplorerRow>
			<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
				{agentProfiles.map(profile => {
					const profileSessions = sessions.filter(session => session.command === profile.command)
					return (
						<li key={profile.command} className="w-full min-w-0">
							<TreeExplorerRow
								actions={
									<button
										type="button"
										className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center"
										onClick={event => {
											event.stopPropagation()
											startAgent(profile)
										}}
										title={`Start ${profile.label}`}
									>
										<SparklesIcon className="size-3" />
									</button>
								}
								icon={<AgentIcon layer={profile.icon} />}
								selected={false}
								onClick={() => {}}
							>
								{profile.label}
							</TreeExplorerRow>
							{profileSessions.length > 0 && (
								<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
									{profileSessions.map(session => (
										<li key={session.id} className="w-full min-w-0">
											<TreeExplorerRow
												actions={
													<button
														type="button"
														className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center"
														onClick={event => {
															event.stopPropagation()
															stopAgent(session)
														}}
														title={`Stop ${session.label}`}
													>
														<Square className="size-3" />
													</button>
												}
												icon={<AgentIcon layer={session.icon} />}
												selected={false}
												onClick={() => input.selectAgent(input.cwd, session.id, session.command, session.args)}
											>
												{session.label}
											</TreeExplorerRow>
										</li>
									))}
								</ul>
							)}
						</li>
					)
				})}
			</ul>
		</li>
	)
}

function WorktreeManager(input: {
	readonly activeProject?: GitProject
	readonly activeWorktree?: GitProject['worktrees'][number]
	readonly activeView: 'agent' | 'diff' | 'terminal' | 'browser' | 'run'
	readonly projects: readonly GitProject[]
	readonly selectWorktree: (worktreeRoot: string) => void
	readonly selectTerminal: (worktreeRoot: string) => void
	readonly selectBrowser: (worktreeRoot: string) => void
	readonly selectAgent: (worktreeRoot: string, sessionId: string, command: string, args: readonly string[]) => void
	readonly selectRun: (worktreeRoot: string, sessionId: string, command: string, inactive?: boolean) => void
}) {
	const refreshProjects = useAtomRefresh(projectsAtom)
	const createWorktree = useAtomSet(RpcClient.mutation('projects.createWorktree'), {mode: 'promise'})
	const deleteWorktree = useAtomSet(RpcClient.mutation('projects.deleteWorktree'), {mode: 'promise'})
	const [branch, setBranch] = useState('')
	const [actionsOpen, setActionsOpen] = useState(false)
	const [createWorktreeProjectRoot, setCreateWorktreeProjectRoot] = useState(input.activeProject?.repository.root)
	const createWorktreeProject =
		pipe(
			input.projects,
			Array.findFirst(project => project.repository.root === createWorktreeProjectRoot),
			Option.getOrUndefined
		) ?? input.activeProject
	const branchSnapshot = useAtomSuspense(branchesAtom(createWorktreeProject?.repository.root ?? ''))
	const availableBranches = pipe(
		branchSnapshot.value.branches,
		Array.filter(candidate => String.isNonEmpty(candidate.name)),
		Array.dedupeWith((left, right) => left.name === right.name),
		Array.filter(
			candidate =>
				!pipe(
					createWorktreeProject?.worktrees ?? [],
					Array.map(worktree => worktree.branch ?? ''),
					Array.filter(String.isNonEmpty),
					Array.contains(candidate.name)
				)
		)
	)
	async function createFastWorktree(nextBranch = branch) {
		const nextSelectedBranch = pipe(
			availableBranches,
			Array.findFirst(candidate => candidate.name === nextBranch),
			Option.getOrUndefined
		)
		const worktreeRoot = await createWorktree({
			payload: {
				baseBranch:
					nextSelectedBranch?.type === 'remote'
						? `${nextSelectedBranch.remote}/${nextSelectedBranch.name}`
						: `origin/${branchSnapshot.value.defaultBranch}`,
				branch: nextBranch,
				cwd: (createWorktreeProject ?? input.activeProject)?.repository.root ?? '',
				mode:
					nextSelectedBranch?.type === 'local'
						? 'existing-local'
						: nextSelectedBranch?.type === 'remote'
							? 'existing-remote'
							: 'new-local'
			}
		})
		setActionsOpen(false)
		setBranch('')
		refreshProjects()
		input.selectWorktree(worktreeRoot)
	}

	return (
		<div className="flex h-full flex-col border-r text-xs">
			<div className="grid h-8 grid-cols-[minmax(0,1fr)_auto] items-center border-b">
				<button
					type="button"
					className="text-muted-foreground hover:text-foreground flex h-full min-w-0 items-center px-3 text-left"
					onClick={() => {
						if (input.activeWorktree) void navigator.clipboard.writeText(input.activeWorktree.root)
					}}
				>
					<span className="min-w-0 truncate">
						{input.activeWorktree ? shortPath(input.activeWorktree.root) : 'No worktree selected'}
					</span>
				</button>
				{input.activeWorktree && input.activeWorktree.root !== input.activeProject?.repository.root && (
					<button
						type="button"
						className="text-destructive hover:bg-muted hover:text-destructive flex h-8 w-8 items-center justify-center"
						onClick={async () => {
							if (!input.activeWorktree) return
							if (!confirm(`Delete worktree ${input.activeWorktree.branch ?? pathLabel(input.activeWorktree.root)}?`)) {
								return
							}

							await deleteWorktree({payload: {cwd: input.activeWorktree.root, force: true}})
							setActionsOpen(false)
							refreshProjects()
						}}
						title="Delete worktree"
					>
						<Trash className="size-3" />
					</button>
				)}
			</div>

			<CommandDialog
				open={actionsOpen}
				onOpenChange={open => {
					setActionsOpen(open)
				}}
				title="Create worktree"
				description="Create or open a worktree branch."
				className="sm:max-w-2xl"
			>
				<Command
					onKeyDown={event => {
						event.stopPropagation()
						if (event.key === 'Escape') setActionsOpen(false)
					}}
				>
					<CommandInput
						placeholder={`Create in ${createWorktreeProject ? pathLabel(createWorktreeProject.repository.root) : 'workspace'}...`}
						value={branch}
						onValueChange={value => {
							setBranch(value)
						}}
						onKeyDown={event => {
							if (event.key === 'Enter' && branch !== '' && createWorktreeProject) {
								event.preventDefault()
								void createFastWorktree()
							}
						}}
					/>
					<CommandList>
						<CommandEmpty>No command found.</CommandEmpty>
						{createWorktreeProject && (
							<CommandGroup>
								{Array.map(availableBranches, candidate => (
									<CommandItem
										key={`${candidate.type}:${candidate.remote ?? ''}:${candidate.name}`}
										value={candidate.name}
										onSelect={() => {
											setBranch(candidate.name)
											void createFastWorktree(candidate.name)
										}}
									>
										{candidate.type === 'local' ? <GitBranch className="size-3.5" /> : <Square className="size-3.5" />}
										<span className="min-w-0 truncate">{candidate.name}</span>
										<CommandShortcut>{candidate.type}</CommandShortcut>
									</CommandItem>
								))}
								{branch !== '' &&
									Option.isNone(Array.findFirst(availableBranches, candidate => candidate.name === branch)) && (
										<CommandItem value={`create ${branch}`} onSelect={() => void createFastWorktree()}>
											<GitBranchPlus className="size-3.5" />
											Create {branch}
											<CommandShortcut>origin/{branchSnapshot.value.defaultBranch}</CommandShortcut>
										</CommandItem>
									)}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</CommandDialog>

			<TreeExplorer className="min-h-0 flex-1 overflow-y-auto px-0 py-1">
				<TreeExplorerSection>
					{Array.map(input.projects, (project, index) => {
						const projectWorktree =
							Option.getOrUndefined(
								Array.findFirst(project.worktrees, candidate => candidate.root === project.repository.root)
							) ?? project.worktrees[0]

						return (
							<li key={project.repository.gitDirectory} className="min-w-0 py-1 first:pt-0">
								<div
									className={`text-foreground grid h-7 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 pr-2 text-left text-xs font-semibold hover:bg-transparent ${projectAccentClassNames[index % projectAccentClassNames.length]}`}
								>
									<span className="flex min-w-0 flex-1 items-center gap-1.5">
										<span className="flex size-3.5 shrink-0 items-center justify-center">
											<Layers className="size-3.5" />
										</span>
										<span className="min-w-0 flex-1 truncate">
											<button
												type="button"
												className="tree-label flex min-w-0 items-center gap-1.5 text-left"
												onClick={() => {
													if (projectWorktree) input.selectWorktree(projectWorktree.root)
												}}
											>
												<span className="min-w-0 truncate">{pathLabel(project.repository.root)}</span>
											</button>
										</span>
									</span>
									<Button
										variant="ghost"
										size="icon-xs"
										className="h-5 w-5 rounded-none opacity-70 hover:opacity-100"
										onClick={event => {
											event.stopPropagation()
											setCreateWorktreeProjectRoot(project.repository.root)
											setBranch('')
											setActionsOpen(true)
										}}
										title="Create worktree"
									>
										<GitBranchPlus className="size-3" />
									</Button>
								</div>
								<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
									{Array.map(project.worktrees, worktree => (
										<li key={worktree.root} className="w-full min-w-0">
											<TreeExplorerRow
												key={worktree.root}
												icon={
													<WorktreeIcon
														dirty={
															worktree.status?.dirtyTracked ??
															worktree.status?.untracked ??
															worktree.status?.unpushedCommits ??
															(worktree.status?.behind ?? 0) > 0
														}
														root={worktree.root === project.repository.root}
													/>
												}
												selected={input.activeView === 'diff' && input.activeWorktree?.root === worktree.root}
												onClick={() => {
													input.selectWorktree(worktree.root)
												}}
											>
												{worktree.branch ?? pathLabel(worktree.root)}
											</TreeExplorerRow>
											<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
												<WorktreeAgents cwd={worktree.root} selectAgent={input.selectAgent} />
												<li className="w-full min-w-0">
													<TreeExplorerRow
														icon={<TerminalIcon className="size-3.5" />}
														selected={input.activeView === 'terminal' && input.activeWorktree?.root === worktree.root}
														onClick={() => {
															input.selectTerminal(worktree.root)
														}}
													>
														terminal
													</TreeExplorerRow>
												</li>
												<li className="w-full min-w-0">
													<TreeExplorerRow
														icon={<GlobeIcon className="size-3.5" />}
														selected={input.activeView === 'browser' && input.activeWorktree?.root === worktree.root}
														onClick={() => {
															input.selectBrowser(worktree.root)
														}}
													>
														browser
													</TreeExplorerRow>
												</li>
												<WorktreeRuns cwd={worktree.root} selectRun={input.selectRun} />
											</ul>
										</li>
									))}
								</ul>
							</li>
						)
					})}
				</TreeExplorerSection>
			</TreeExplorer>
		</div>
	)
}
