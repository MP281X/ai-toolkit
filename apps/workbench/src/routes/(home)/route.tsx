import {useAtomRefresh, useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Effect, Match, Option, Predicate, Schema, String, pipe} from 'effect'

import {Outlet, createFileRoute, useRouterState} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {
	activeHomeAtom,
	agentsAtom,
	portlessRunsAtom,
	projectsAtom,
	terminalStateAtom,
	worktreeRouteId
} from '#lib/state.ts'
import type {AgentSession, RunScript} from '#rpcs/contracts.ts'
import {
	AgentIcon,
	BotIcon,
	GitBranch,
	GitBranchPlus,
	GlobeIcon,
	Layers,
	Loader2Icon,
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
import type {GitBranch as GitBranchSchema, GitProject} from '@deslop/git/schema'
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
				Match.when(String.endsWith('/portless'), () => 'portless' as const),
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
						selectPortless={(worktreeRoot, origin) => {
							startTransition(() => {
								void navigate({
									params: {worktree: worktreeRouteId(worktreeRoot)},
									search: {origin},
									to: '/$worktree/portless'
								})
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
						selectRun={(worktreeRoot, sessionId, command, runId, inactive, env, cwd) => {
							startTransition(() => {
								void navigate({
									params: {worktree: worktreeRouteId(worktreeRoot)},
									search: {command, cwd, env, inactive, runId, sessionId},
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
	if (Predicate.isNotUndefined(homeSegments) && String.startsWith(`${homeSegments}/`)(value)) {
		return `~/${String.slice(String.length(homeSegments) + 1)(value)}`
	}
	return pathLabel(value)
}

function WorktreeIcon(input: {readonly dirty: boolean; readonly root: boolean}) {
	if (input.root) return <PanelTop className={input.dirty ? 'text-amber-500' : 'text-current'} />
	return <Square className={input.dirty ? 'text-amber-500' : 'text-current'} />
}

function scriptSession(script: RunScript) {
	return script.portless === true
		? {cwd: script.cwd, sessionId: script.sessionId}
		: {args: ['-lc', script.command], command: 'sh', cwd: script.cwd, sessionId: script.sessionId}
}

function portlessServiceRank(script: RunScript) {
	const service = script.service ?? script.name
	if (service === 'dev') return 0
	if (service === 'client') return 1
	if (service === 'server') return 2
	return 3
}

function portlessLabel(script: RunScript) {
	const service = script.service ?? script.name
	return service === 'dev' ? script.packageFolder : `${script.packageFolder}:${service}`
}

function sortPortlessScripts(scripts: readonly RunScript[]) {
	return [...scripts].toSorted((left, right) => {
		const packageOrder = left.packageFolder.localeCompare(right.packageFolder)
		if (packageOrder !== 0) return packageOrder

		const rankOrder = portlessServiceRank(left) - portlessServiceRank(right)
		if (rankOrder !== 0) return rankOrder

		return portlessLabel(left).localeCompare(portlessLabel(right))
	})
}

const portlessActiveAtom = Atom.family((scripts: readonly RunScript[]) =>
	Atom.make(get =>
		pipe(
			pipe(
				scripts,
				Array.map(script => get.result(terminalStateAtom(scriptSession(script))))
			),
			Effect.all,
			Effect.map(Array.some(state => state.runId > 0 && terminalStateActive(state.state)))
		)
	)
)

function WorktreePortless(input: {
	readonly cwd: string
	readonly selectPortless: (worktreeRoot: string, origin?: string) => void
	readonly selectRun: (
		worktreeRoot: string,
		sessionId: string,
		command?: string,
		runId?: number,
		inactive?: boolean,
		env?: Readonly<Record<string, string>>,
		runCwd?: string
	) => void
}) {
	const restart = useAtomSet(RpcClient.mutation('terminal.restart'), {mode: 'promise'})
	const stop = useAtomSet(RpcClient.mutation('terminal.stop'), {mode: 'promise'})
	const scripts = useAtomSuspense(portlessRunsAtom(input.cwd))
	const sortedScripts = sortPortlessScripts(scripts.value)
	const active = useAtomSuspense(portlessActiveAtom(scripts.value))

	if (scripts.value.length === 0) return null

	async function startScripts() {
		for (const session of pipe(scripts.value, Array.map(scriptSession))) {
			await restart({payload: session})
		}
	}

	async function stopScripts() {
		for (const session of pipe(scripts.value, Array.map(scriptSession))) {
			await stop({payload: session})
		}
	}

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				actions={
					<span className="flex h-full items-center justify-end">
						<button
							type="button"
							className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center"
							onClick={event => {
								event.stopPropagation()
								void (active.value ? stopScripts() : startScripts())
							}}
							title={active.value ? 'Stop all portless services' : 'Start all portless services'}
						>
							{active.value ? <Square className="size-3" /> : <PlayIcon className="size-3" />}
						</button>
					</span>
				}
				icon={<GlobeIcon />}
				selected={false}
				onClick={() => {}}
			>
				portless
			</TreeExplorerRow>
			<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
				{sortedScripts.map(script => (
					<PortlessServiceRow
						key={script.sessionId}
						cwd={input.cwd}
						label={portlessLabel(script)}
						script={script}
						selectPortless={input.selectPortless}
						selectRun={input.selectRun}
					/>
				))}
			</ul>
		</li>
	)
}

function PortlessServiceRow(input: {
	readonly cwd: string
	readonly label: string
	readonly script: RunScript
	readonly selectPortless: (worktreeRoot: string, origin?: string) => void
	readonly selectRun: (
		worktreeRoot: string,
		sessionId: string,
		command?: string,
		runId?: number,
		inactive?: boolean,
		env?: Readonly<Record<string, string>>,
		runCwd?: string
	) => void
}) {
	const session = scriptSession(input.script)
	const firstState = useAtomSuspense(terminalStateAtom(session))

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				actions={
					<span className="flex h-full items-center justify-end">
						<button
							type="button"
							className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center"
							onClick={event => {
								event.stopPropagation()
								input.selectRun(
									input.cwd,
									input.script.sessionId,
									undefined,
									firstState.value.runId,
									firstState.value.runId === 0
								)
							}}
							title={`Open ${input.label} terminal`}
						>
							<TerminalIcon className="size-3" />
						</button>
					</span>
				}
				icon={<ProcessStateIcon state={firstState.value.state} />}
				selected={false}
				onClick={() => {
					input.selectPortless(input.cwd, input.script.origin)
				}}
			>
				{input.label}
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
				icon={<ProcessStateIcon state={input.session.state.state} />}
				selected={false}
				title={input.session.state.title ? `Title: ${input.session.state.title}` : input.session.label}
				onClick={input.onSelect}
			>
				{input.session.state.title === '' ? input.session.label : input.session.state.title}
			</TreeExplorerRow>
		</li>
	)
}

function WorktreeAgents(input: {readonly cwd: string; readonly selectAgent: (cwd: string, agentId: string) => void}) {
	const create = useAtomSet(RpcClient.mutation('agents.create'), {mode: 'promise'})
	const remove = useAtomSet(RpcClient.mutation('agents.remove'), {mode: 'promise'})
	const sessions = useAtomSuspense(agentsAtom(input.cwd))

	async function startAgent(profile: (typeof agentProfiles)[number]) {
		const session = await create({payload: {...profile, cwd: input.cwd}})
		input.selectAgent(input.cwd, session.uuid)
	}

	function stopAgent(session: AgentSession) {
		void remove({payload: {cwd: input.cwd, uuid: session.uuid}})
	}

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow icon={<BotIcon />} selected={false} onClick={() => {}}>
				agents
			</TreeExplorerRow>
			<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
				{agentProfiles.map(profile => {
					const profileSessions = pipe(
						sessions.value,
						Array.filter(session => session.command === profile.command)
					)
					return (
						<li key={profile.command} className="w-full min-w-0">
							<TreeExplorerRow
								actions={
									<button
										type="button"
										className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center"
										onClick={event => {
											event.stopPropagation()
											void startAgent(profile)
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
											onSelect={() => {
												input.selectAgent(input.cwd, session.uuid)
											}}
											onStop={() => {
												stopAgent(session)
											}}
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
	readonly activeView: 'agent' | 'diff' | 'terminal' | 'portless' | 'run'
	readonly projects: readonly GitProject[]
	readonly selectWorktree: (worktreeRoot: string) => void
	readonly selectTerminal: (worktreeRoot: string) => void
	readonly selectPortless: (worktreeRoot: string, origin?: string) => void
	readonly selectAgent: (worktreeRoot: string, agentId: string) => void
	readonly selectRun: (
		worktreeRoot: string,
		sessionId: string,
		command?: string,
		runId?: number,
		inactive?: boolean,
		env?: Readonly<Record<string, string>>,
		runCwd?: string
	) => void
}) {
	const refreshProjects = useAtomRefresh(projectsAtom)
	const createWorktree = useAtomSet(RpcClient.mutation('projects.createWorktree'), {mode: 'promise'})
	const deleteWorktree = useAtomSet(RpcClient.mutation('projects.deleteWorktree'), {mode: 'promise'})
	const branchState = useState('')
	const actionsOpenState = useState(false)
	const createWorktreeProjectRootState = useState(input.activeProject?.repository.root)
	const creatingBranchState = useState('')
	const deletingWorktreeState = useState(false)
	const createWorktreeProject =
		pipe(
			input.projects,
			Array.findFirst(project => project.repository.root === createWorktreeProjectRootState[0]),
			Option.getOrUndefined
		) ?? input.activeProject
	const branchSnapshot = useAtomSuspense(branchesAtom(createWorktreeProject?.repository.root ?? ''))
	const localBranchNames = pipe(
		branchSnapshot.value.branches,
		Array.filter(candidate => candidate.type === 'local'),
		Array.map(candidate => candidate.name)
	)
	const availableBranches = pipe(
		branchSnapshot.value.branches,
		Array.filter(candidate => String.isNonEmpty(candidate.name)),
		Array.filter(candidate => candidate.type === 'local' || !Array.contains(localBranchNames, candidate.name)),
		Array.dedupeWith(
			(left, right) => left.name === right.name && left.type === right.type && left.remote === right.remote
		),
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
	async function createFastWorktree(candidate?: GitBranchSchema) {
		const nextBranch = candidate?.name ?? branchState[0]
		if (String.isEmpty(nextBranch) || String.isNonEmpty(creatingBranchState[0])) return

		const source =
			candidate === undefined
				? {_tag: 'new' as const}
				: Match.value(candidate).pipe(
						Match.when({type: 'local'}, () => ({_tag: 'local' as const})),
						Match.orElse(branch => ({_tag: 'remote' as const, remote: branch.remote ?? 'origin'}))
					)

		creatingBranchState[1](nextBranch)
		try {
			const worktreeRoot = await createWorktree({
				payload: {
					branch: nextBranch,
					cwd: (createWorktreeProject ?? input.activeProject)?.repository.root ?? '',
					source
				}
			})
			actionsOpenState[1](false)
			branchState[1]('')
			refreshProjects()
			input.selectWorktree(worktreeRoot)
		} finally {
			creatingBranchState[1]('')
		}
	}
	async function deleteActiveWorktree() {
		if (!input.activeWorktree || deletingWorktreeState[0]) return

		deletingWorktreeState[1](true)
		try {
			await deleteWorktree({payload: {cwd: input.activeWorktree.root}})
			refreshProjects()
		} finally {
			deletingWorktreeState[1](false)
		}
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
						disabled={deletingWorktreeState[0]}
						onClick={() => {
							if (!input.activeWorktree) return
							if (!confirm(`Delete worktree ${input.activeWorktree.branch ?? pathLabel(input.activeWorktree.root)}?`)) {
								return
							}

							void deleteActiveWorktree()
							actionsOpenState[1](false)
						}}
						title="Delete worktree"
					>
						{deletingWorktreeState[0] ? <Loader2Icon className="size-3 animate-spin" /> : <Trash className="size-3" />}
					</button>
				)}
			</div>

			<CommandDialog
				open={actionsOpenState[0]}
				onOpenChange={actionsOpenState[1]}
				title="Create worktree"
				description="Create or open a worktree branch."
				className="sm:max-w-2xl"
			>
				<Command
					onKeyDown={event => {
						event.stopPropagation()
						if (event.key === 'Escape') actionsOpenState[1](false)
					}}
				>
					<CommandInput
						placeholder={`Create in ${createWorktreeProject ? pathLabel(createWorktreeProject.repository.root) : 'workspace'}...`}
						value={branchState[0]}
						onValueChange={branchState[1]}
						onKeyDown={event => {
							if (event.key === 'Enter' && String.isNonEmpty(branchState[0]) && createWorktreeProject) {
								event.preventDefault()
								void createFastWorktree(
									pipe(
										availableBranches,
										Array.findFirst(candidate => candidate.name === branchState[0]),
										Option.getOrUndefined
									)
								)
							}
						}}
					/>
					<CommandList>
						<CommandEmpty>No command found.</CommandEmpty>
						{createWorktreeProject && (
							<CommandGroup>
								{Array.map(availableBranches, candidate => {
									const icon =
										creatingBranchState[0] === candidate.name ? (
											<Loader2Icon className="animate-spin" />
										) : (
											Match.value(candidate.type).pipe(
												Match.when('local', () => <GitBranch />),
												Match.orElse(() => <Square />)
											)
										)

									return (
										<CommandItem
											key={`${candidate.type}:${candidate.remote ?? ''}:${candidate.name}`}
											value={candidate.name}
											onSelect={() => {
												branchState[1](candidate.name)
												void createFastWorktree(candidate)
											}}
										>
											{icon}
											<span className="min-w-0 truncate">{candidate.name}</span>
											<CommandShortcut>{candidate.type}</CommandShortcut>
										</CommandItem>
									)
								})}
								{String.isNonEmpty(branchState[0]) &&
									Option.isNone(Array.findFirst(availableBranches, candidate => candidate.name === branchState[0])) && (
										<CommandItem value={`create ${branchState[0]}`} onSelect={() => void createFastWorktree()}>
											{creatingBranchState[0] === branchState[0] ? (
												<Loader2Icon className="animate-spin" />
											) : (
												<GitBranchPlus />
											)}
											Create {branchState[0]}
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
											createWorktreeProjectRootState[1](project.repository.root)
											branchState[1]('')
											actionsOpenState[1](true)
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
												<WorktreePortless
													cwd={worktree.root}
													selectPortless={input.selectPortless}
													selectRun={input.selectRun}
												/>
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
