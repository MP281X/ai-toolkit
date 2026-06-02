import {useAtomRefresh, useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Effect, Match, Option, Schema, String, pipe} from 'effect'

import {Outlet, createFileRoute, useRouterState} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom, agentsAtom, projectsAtom, runsAtom, terminalStateAtom, worktreeRouteId} from '#lib/state.ts'
import type {AgentSession} from '#rpcs/contracts.ts'
import {
	AgentIcon,
	BotIcon,
	GitBranch,
	GitBranchPlus,
	GlobeIcon,
	Layers,
	PackageIcon,
	PanelTop,
	PlayIcon,
	ProcessStateIcon,
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
import {terminalStateActive} from '@deslop/terminal/schema'

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
]

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
		select: state => ({
			activeView: pipe(
				Match.value(state.location.pathname),
				Match.when(String.endsWith('/terminal'), () => 'terminal' as const),
				Match.when(String.endsWith('/browser'), () => 'browser' as const),
				Match.when(String.endsWith('/run'), () => 'run' as const),
				Match.when(String.endsWith('/agent'), () => 'agent' as const),
				Match.orElse(() => 'diff' as const)
			),
			activeWorktreeId: String.split('/')(state.location.pathname)[1]
		})
	})
	const activeHome = useAtomSuspense(activeHomeAtom(homeRouteState.activeWorktreeId))

	return (
		<div className="bg-background h-full min-h-0 flex-1 overflow-hidden">
			<ResizablePanelGroup orientation="horizontal" className="h-full min-h-0 overflow-hidden">
				<ResizablePanel defaultSize="22%" minSize="16%" maxSize="34%">
					<WorktreeManager
						activeProject={activeHome.value.activeProject}
						activeWorktree={activeHome.value.activeWorktree}
						activeView={homeRouteState.activeView}
						projects={activeHome.value.projects}
						selectWorktree={worktreeRoot => {
							startTransition(() => {
								void navigate({params: {worktree: worktreeRouteId(worktreeRoot)}, to: '/$worktree/diff'})
							})
						}}
						selectTerminal={worktreeRoot => {
							startTransition(() => {
								void navigate({params: {worktree: worktreeRouteId(worktreeRoot)}, to: '/$worktree/terminal'})
							})
						}}
						selectBrowser={worktreeRoot => {
							startTransition(() => {
								void navigate({params: {worktree: worktreeRouteId(worktreeRoot)}, to: '/$worktree/browser'})
							})
						}}
						selectAgent={(worktreeRoot, agentId) => {
							startTransition(() => {
								void navigate({
									params: {worktree: worktreeRouteId(worktreeRoot)},
									search: {agentId},
									to: '/$worktree/agent'
								})
							})
						}}
						selectRun={(worktreeRoot, sessionId, command, runId, inactive) => {
							startTransition(() => {
								void navigate({
									params: {worktree: worktreeRouteId(worktreeRoot)},
									search: {command, inactive, runId, sessionId},
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
	if (input.root) return <PanelTop className={input.dirty ? 'text-amber-500' : 'text-current'} />
	return <Square className={input.dirty ? 'text-amber-500' : 'text-current'} />
}

function runSessionId(scriptName: string, taskIndex: number) {
	return `run:${scriptName}:${taskIndex}`
}

function WorktreeRuns(input: {
	readonly cwd: string
	readonly selectRun: (cwd: string, sessionId: string, command: string, runId?: number, inactive?: boolean) => void
}) {
	const scripts = useAtomSuspense(runsAtom(input.cwd))
	const [expanded, setExpanded] = useState(false)
	const [expandedScripts, setExpandedScripts] = useState<ReadonlySet<string>>(new Set())

	if (scripts.value.length === 0) return null

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				icon={<PackageIcon />}
				selected={false}
				onClick={() => {
					setExpanded(value => !value)
				}}
			>
				scripts
			</TreeExplorerRow>
			{expanded && (
				<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
					{Array.map(scripts.value, script => (
						<RunScriptRow
							key={script.name}
							cwd={input.cwd}
							expanded={expandedScripts.has(script.name)}
							onToggleExpanded={() => {
								setExpandedScripts(current => {
									const next = new Set(current)
									if (next.has(script.name)) next.delete(script.name)
									else next.add(script.name)
									return next
								})
							}}
							script={script}
							selectRun={input.selectRun}
						/>
					))}
				</ul>
			)}
		</li>
	)
}

function RunScriptRow(input: {
	readonly cwd: string
	readonly expanded: boolean
	readonly onToggleExpanded: () => void
	readonly script: {readonly name: string; readonly tasks: readonly string[]}
	readonly selectRun: (cwd: string, sessionId: string, command: string, runId?: number, inactive?: boolean) => void
}) {
	const restart = useAtomSet(RpcClient.mutation('terminal.restart'), {mode: 'promise'})
	const stop = useAtomSet(RpcClient.mutation('terminal.stop'), {mode: 'promise'})
	const parallel = input.script.tasks.length > 1
	const commands = input.script.tasks.map(task => (parallel ? task : `vp run ${input.script.name}`))
	const firstCommand = commands[0] ?? ''
	const firstSessionId = runSessionId(input.script.name, 0)
	const firstState = useAtomSuspense(
		terminalStateAtom({args: ['-lc', firstCommand], command: 'sh', cwd: input.cwd, sessionId: firstSessionId})
	)
	const active = firstState.value.runId > 0 && terminalStateActive(firstState.value.state)

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				actions={
					<button
						type="button"
						className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center"
						onClick={event => {
							event.stopPropagation()
							commands.forEach((command, taskIndex) => {
								const sessionId = runSessionId(input.script.name, taskIndex)
								if (active) {
									void stop({payload: {args: ['-lc', command], command: 'sh', cwd: input.cwd, sessionId}})
								} else {
									void restart({payload: {args: ['-lc', command], command: 'sh', cwd: input.cwd, sessionId}})
								}
							})
						}}
						title={active ? 'Stop script' : 'Start script'}
					>
						{active ? <Square className="size-3" /> : <PlayIcon className="size-3" />}
					</button>
				}
				icon={<ProcessStateIcon state={firstState.value.state} />}
				selected={false}
				onClick={() => {
					if (parallel) {
						input.onToggleExpanded()
					} else {
						input.selectRun(
							input.cwd,
							firstSessionId,
							firstCommand,
							firstState.value.runId,
							firstState.value.runId === 0
						)
					}
				}}
			>
				{input.script.name}
			</TreeExplorerRow>
			{parallel && input.expanded && (
				<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
					{commands.map((command, taskIndex) => (
						<RunTaskRow
							key={runSessionId(input.script.name, taskIndex)}
							command={command}
							cwd={input.cwd}
							selectRun={input.selectRun}
							sessionId={runSessionId(input.script.name, taskIndex)}
						/>
					))}
				</ul>
			)}
		</li>
	)
}

function RunTaskRow(input: {
	readonly command: string
	readonly cwd: string
	readonly selectRun: (cwd: string, sessionId: string, command: string, runId?: number, inactive?: boolean) => void
	readonly sessionId: string
}) {
	const restart = useAtomSet(RpcClient.mutation('terminal.restart'), {mode: 'promise'})
	const stop = useAtomSet(RpcClient.mutation('terminal.stop'), {mode: 'promise'})
	const session = {args: ['-lc', input.command], command: 'sh', cwd: input.cwd, sessionId: input.sessionId}
	const state = useAtomSuspense(terminalStateAtom(session))
	const active = state.value.runId > 0 && terminalStateActive(state.value.state)

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				actions={
					<button
						type="button"
						className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center"
						onClick={event => {
							event.stopPropagation()
							if (active) {
								void stop({payload: session})
							} else {
								void restart({payload: session})
							}
						}}
						title={active ? 'Stop task' : 'Start task'}
					>
						{active ? <Square className="size-3" /> : <PlayIcon className="size-3" />}
					</button>
				}
				icon={<ProcessStateIcon state={state.value.state} />}
				selected={false}
				onClick={() => {
					input.selectRun(input.cwd, input.sessionId, input.command, state.value.runId, state.value.runId === 0)
				}}
			>
				{input.command}
			</TreeExplorerRow>
		</li>
	)
}

const agentProfiles = [
	{args: ['--model', 'openai/gpt-5.5'], command: 'opencode', icon: 'opencode', label: 'opencode'},
	{
		args: ['--model', 'gpt-5.5', '-c', 'model_reasoning_effort=low', '--dangerously-bypass-approvals-and-sandbox'],
		command: 'codex',
		icon: 'codex',
		label: 'codex'
	},
	{args: ['--provider', 'openai-codex', '--model', 'gpt-5.5:low'], command: 'pi', icon: 'pi', label: 'pi'}
] as const

function AgentSessionRow(input: {
	readonly onSelect: () => void
	readonly onStop: () => void
	readonly session: AgentSession
}) {
	const state = useAtomSuspense(
		terminalStateAtom({
			args: input.session.args,
			command: input.session.command,
			cwd: input.session.cwd,
			sessionId: input.session.uuid
		})
	)

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				actions={
					<button
						type="button"
						className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center"
						onClick={event => {
							event.stopPropagation()
							input.onStop()
						}}
						title={`Stop ${input.session.label}`}
					>
						<Square className="size-3" />
					</button>
				}
				icon={<ProcessStateIcon state={state.value.state} />}
				selected={false}
				title={state.value.title ? `Title: ${state.value.title}` : input.session.label}
				onClick={input.onSelect}
			>
				{state.value.title === '' ? input.session.label : state.value.title}
			</TreeExplorerRow>
		</li>
	)
}

function WorktreeAgents(input: {readonly cwd: string; readonly selectAgent: (cwd: string, agentId: string) => void}) {
	const create = useAtomSet(RpcClient.mutation('agents.create'), {mode: 'promise'})
	const remove = useAtomSet(RpcClient.mutation('agents.remove'), {mode: 'promise'})
	const stopTerminal = useAtomSet(RpcClient.mutation('terminal.stop'), {mode: 'promise'})
	const sessions = useAtomSuspense(agentsAtom(input.cwd))

	function startAgent(profile: (typeof agentProfiles)[number]) {
		void create({payload: {...profile, cwd: input.cwd}}).then(session => {
			input.selectAgent(input.cwd, session.uuid)
		})
	}

	function stopAgent(session: AgentSession) {
		void remove({payload: {cwd: input.cwd, uuid: session.uuid}})
		void stopTerminal({
			payload: {args: session.args, command: session.command, cwd: session.cwd, sessionId: session.uuid}
		})
	}

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow icon={<BotIcon />} selected={false} onClick={() => {}}>
				agents
			</TreeExplorerRow>
			<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
				{agentProfiles.map(profile => {
					const profileSessions = sessions.value.filter(session => session.command === profile.command)
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
										<AgentSessionRow
											key={session.uuid}
											session={session}
											onSelect={() => input.selectAgent(input.cwd, session.uuid)}
											onStop={() => stopAgent(session)}
										/>
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
	readonly selectAgent: (worktreeRoot: string, agentId: string) => void
	readonly selectRun: (
		worktreeRoot: string,
		sessionId: string,
		command: string,
		runId?: number,
		inactive?: boolean
	) => void
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
		<div className="flex h-full flex-col border-r">
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
				onOpenChange={setActionsOpen}
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
						onValueChange={setBranch}
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
										{candidate.type === 'local' ? <GitBranch /> : <Square />}
										<span className="min-w-0 truncate">{candidate.name}</span>
										<CommandShortcut>{candidate.type}</CommandShortcut>
									</CommandItem>
								))}
								{branch !== '' &&
									Option.isNone(Array.findFirst(availableBranches, candidate => candidate.name === branch)) && (
										<CommandItem value={`create ${branch}`} onSelect={() => void createFastWorktree()}>
											<GitBranchPlus />
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
									className={`text-foreground grid h-7 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 pr-2 text-left font-normal hover:bg-transparent ${projectAccentClassNames[index % projectAccentClassNames.length]}`}
								>
									<span className="flex min-w-0 flex-1 items-center gap-1.5">
										<span className="flex size-3 shrink-0 items-center justify-center [&_svg]:size-3">
											<Layers />
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
														icon={<TerminalIcon />}
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
														icon={<GlobeIcon />}
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
