import {useAtomRefresh, useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, Hash, Option, Order, Predicate, pipe, Schema, String} from 'effect'

import type {AgentId} from '@ai-toolkit/ai/catalog'
import {
	AgentIcon,
	Archive,
	GitBranch,
	GitBranchPlus,
	Layers,
	PanelTop,
	SparklesIcon,
	Square,
	Trash
} from '@ai-toolkit/components/icons'
import {TreeExplorer, TreeExplorerRow, TreeExplorerSection} from '@ai-toolkit/components/tree-explorer'
import {Button} from '@ai-toolkit/components/ui/button'
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut
} from '@ai-toolkit/components/ui/command'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import {createFileRoute, Outlet, useRouterState} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition, useEffect, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom, agentsAtom, draftAgentsAtom, projectsAtom} from '#lib/state.ts'
import type {AgentEntry, ProjectEntry} from '#rpcs/contracts.ts'
import {BranchesSnapshot} from '#rpcs/contracts.ts'

export const Route = createFileRoute('/(home)')({
	validateSearch: Schema.toStandardSchemaV1(
		Schema.Struct({
			threadId: Schema.optional(Schema.String)
		})
	),
	component: HomeLayout
})

const projectAccentClassNames = [
	'[&_svg]:text-[oklch(0.74_0.085_50)] [&_.tree-label]:text-[oklch(0.8_0.085_50)]',
	'[&_svg]:text-[oklch(0.72_0.075_150)] [&_.tree-label]:text-[oklch(0.78_0.075_150)]',
	'[&_svg]:text-[oklch(0.72_0.075_220)] [&_.tree-label]:text-[oklch(0.78_0.075_220)]',
	'[&_svg]:text-[oklch(0.72_0.075_285)] [&_.tree-label]:text-[oklch(0.78_0.075_285)]',
	'[&_svg]:text-[oklch(0.72_0.075_20)] [&_.tree-label]:text-[oklch(0.78_0.075_20)]',
	'[&_svg]:text-[oklch(0.74_0.065_95)] [&_.tree-label]:text-[oklch(0.8_0.065_95)]'
] as const

type ActionPaletteMode = 'create-thread' | 'create-worktree'
const agentLayers = ['effect', 'opencode', 'codex'] as const satisfies readonly AgentId[]

const branchesAtom = Atom.family((cwd: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient.asEffect(),
				Effect.flatMap(client =>
					String.isNonEmpty(cwd)
						? client('projects.branches', {cwd})
						: Effect.succeed(new BranchesSnapshot({branches: [], defaultBranch: 'main'}))
				)
			),
			{initialValue: new BranchesSnapshot({branches: [], defaultBranch: 'main'})}
		)
	)
)

function HomeLayout() {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const {activeView, activeWorktreeId} = useRouterState({
		select: state => {
			const [worktree] = pipe(state.location.pathname, String.split('/'), Array.drop(1))
			const activeView = pipe(state.location.pathname, String.endsWith('/thread'))
				? ('thread' as const)
				: ('diff' as const)

			return {
				activeView,
				activeWorktreeId: worktree
			}
		}
	})
	const {activeProject, activeWorktree, projects} = useAtomSuspense(activeHomeAtom(activeWorktreeId)).value
	const agents = useAtomSuspense(agentsAtom).value

	return (
		<div className="h-full min-h-0 flex-1 overflow-hidden bg-background font-mono">
			<ResizablePanelGroup orientation="horizontal" className="h-full min-h-0 overflow-hidden">
				<ResizablePanel defaultSize="22%" minSize="16%" maxSize="34%">
					<WorktreeManager
						agents={agents}
						activeProject={activeProject}
						activeWorktree={activeWorktree}
						activeAgentId={search.threadId}
						activeView={activeView}
						projects={projects}
						selectWorktree={worktreeRoot =>
							startTransition(() => {
								navigate({to: '/$worktree/diff', params: {worktree: Math.abs(Hash.string(worktreeRoot)).toString(36)}})
							})
						}
						selectAgent={(worktreeRoot, agentId) =>
							startTransition(() => {
								navigate({
									to: '/$worktree/thread',
									params: {worktree: Math.abs(Hash.string(worktreeRoot)).toString(36)},
									search: {
										threadId: agentId
									}
								})
							})
						}
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
	const segments = pipe(value, String.split('/'))

	for (let index = segments.length - 1; index >= 0; index--) {
		const segment = segments[index]

		if (segment && segment !== '.') {
			return segment
		}
	}

	return value
}

function shortPath(value: string) {
	const homeSegments = pipe(value, String.startsWith('/home/'))
		? pipe(value, String.split('/'), Array.take(3), Array.join('/'))
		: undefined
	if (homeSegments && pipe(value, String.startsWith(`${homeSegments}/`))) {
		return `~/${pipe(value, String.slice(String.length(homeSegments) + 1))}`
	}
	return pathLabel(value)
}

function WorktreeManager(input: {
	agents: readonly AgentEntry[]
	activeProject: ProjectEntry | undefined
	activeWorktree: ProjectEntry['worktrees'][number] | undefined
	activeAgentId: string | undefined
	activeView: 'thread' | 'diff'
	projects: readonly ProjectEntry[]
	selectWorktree: (worktreeRoot: string) => void
	selectAgent: (worktreeRoot: string, agentId: string) => void
}) {
	const refreshProjects = useAtomRefresh(projectsAtom)
	const setDraftAgents = useAtomSet(draftAgentsAtom)
	const createWorktree = useAtomSet(RpcClient.mutation('projects.createWorktree'), {mode: 'promise'})
	const createAgent = useAtomSet(RpcClient.mutation('agents.create'), {mode: 'promise'})
	const archiveAgent = useAtomSet(RpcClient.mutation('agent.archive'), {mode: 'promise'})
	const deleteWorktree = useAtomSet(RpcClient.mutation('projects.deleteWorktree'), {mode: 'promise'})
	const [branch, setBranch] = useState('')
	const [switcherValue, setSwitcherValue] = useState('')
	const [switcherOpen, setSwitcherOpen] = useState(false)
	const [actionsOpen, setActionsOpen] = useState(false)
	const [actionPaletteMode, setActionPaletteMode] = useState<ActionPaletteMode>('create-thread')
	const [createWorktreeProjectRoot, setCreateWorktreeProjectRoot] = useState(input.activeProject?.repository.root)
	const createWorktreeProject =
		pipe(
			input.projects,
			Array.findFirst(project => project.repository.root === createWorktreeProjectRoot),
			Option.getOrUndefined
		) ?? input.activeProject
	const branchSnapshot = useAtomSuspense(branchesAtom(createWorktreeProject?.repository.root ?? '')).value
	const availableBranches = pipe(
		branchSnapshot.branches,
		Array.filter(candidate => pipe(candidate.name, String.isNonEmpty)),
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
	const selectedBranch = pipe(
		availableBranches,
		Array.findFirst(candidate => candidate.name === branch),
		Option.getOrUndefined
	)

	useEffect(() => {
		function openThreadSearch(event: KeyboardEvent) {
			if (!(event.ctrlKey || event.metaKey) || event.shiftKey) return
			if (pipe(event.key, String.toLowerCase) !== 'p') return

			event.preventDefault()
			setSwitcherValue('')
			setSwitcherOpen(open => !open)
		}

		window.addEventListener('keydown', openThreadSearch)

		return () => {
			window.removeEventListener('keydown', openThreadSearch)
		}
	}, [])

	async function createFastWorktree(nextBranch = branch) {
		const selectedProject = pipe(Option.fromNullishOr(createWorktreeProject), Option.getOrThrow)
		const nextSelectedBranch = pipe(
			availableBranches,
			Array.findFirst(candidate => candidate.name === nextBranch),
			Option.getOrUndefined
		)
		let mode: 'existing-local' | 'existing-remote' | 'new-local' = 'new-local'
		if (nextSelectedBranch?.type === 'local') mode = 'existing-local'
		if (nextSelectedBranch?.type === 'remote') mode = 'existing-remote'

		const worktreeRoot = await createWorktree({
			payload: {
				baseBranch:
					nextSelectedBranch?.type === 'remote'
						? `${nextSelectedBranch.remote}/${nextSelectedBranch.name}`
						: `origin/${branchSnapshot.defaultBranch}`,
				branch: nextBranch,
				cwd: selectedProject.repository.root,
				mode
			}
		})
		setActionsOpen(false)
		setBranch('')
		refreshProjects()
		input.selectWorktree(worktreeRoot)
	}

	async function createFastAgent(layer: AgentId) {
		const selectedProjectRoot = pipe(Option.fromNullishOr(input.activeProject?.repository.root), Option.getOrThrow)
		const selectedWorktreeRoot = pipe(Option.fromNullishOr(input.activeWorktree?.root), Option.getOrThrow)
		const agent = await createAgent({
			payload: {
				layer,
				projectRoot: selectedProjectRoot,
				worktreeRoot: selectedWorktreeRoot
			}
		})

		setActionsOpen(false)
		setDraftAgents(draftAgents => ({...draftAgents, [agent.agentId]: agent}))
		input.selectAgent(selectedWorktreeRoot, agent.agentId)
	}

	return (
		<div className="flex h-full flex-col border-r text-xs">
			<div className="grid h-8 grid-cols-[minmax(0,1fr)_auto] items-center border-b">
				<button
					type="button"
					className="flex h-full min-w-0 items-center px-3 text-left text-muted-foreground hover:text-foreground"
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
						className="flex h-8 w-8 items-center justify-center text-destructive hover:bg-muted hover:text-destructive"
						onClick={async () => {
							const selectedWorktree = pipe(Option.fromNullishOr(input.activeWorktree), Option.getOrThrow)
							if (!window.confirm(`Delete worktree ${selectedWorktree.branch ?? pathLabel(selectedWorktree.root)}?`))
								return

							await deleteWorktree({payload: {cwd: selectedWorktree.root, force: true}})
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
				open={switcherOpen}
				onOpenChange={open => {
					setSwitcherOpen(open)
					if (open) setSwitcherValue('')
				}}
				title="Go to thread"
				description="Search threads."
				className="sm:max-w-2xl"
			>
				<Command
					onKeyDown={event => {
						event.stopPropagation()
						if (event.key === 'Escape') setSwitcherOpen(false)
					}}
					value={switcherValue}
					onValueChange={setSwitcherValue}
				>
					<CommandInput autoFocus placeholder="Go to thread..." />
					<CommandList>
						<CommandEmpty>No thread found.</CommandEmpty>
						<CommandGroup>
							{pipe(
								input.agents,
								Array.sortWith(agent => -agent.lastActivityAt, Order.Number),
								Array.map(agent => {
									const project = pipe(
										input.projects,
										Array.findFirst(candidate => candidate.repository.root === agent.projectRoot),
										Option.getOrUndefined
									)
									const worktree = pipe(
										project?.worktrees ?? [],
										Array.findFirst(candidate => candidate.root === agent.worktreeRoot),
										Option.getOrUndefined
									)
									const worktreeLabel = worktree?.branch ?? pathLabel(agent.worktreeRoot)

									return (
										<CommandItem
											key={agent.agentId}
											value={`agent:${agent.agentId}`}
											keywords={[
												worktreeLabel,
												agent.layer,
												agent.agentId,
												pathLabel(agent.projectRoot),
												agent.title ?? '',
												agent.firstPromptPreview ?? ''
											]}
											onSelect={() => {
												setSwitcherOpen(false)
												input.selectAgent(agent.worktreeRoot, agent.agentId)
											}}
										>
											<AgentIcon layer={agent.layer} className="size-3.5" />
											<span className="min-w-0 truncate">{agent.title ?? agent.firstPromptPreview ?? 'thread'}</span>
											<CommandShortcut className="max-w-64 truncate normal-case tracking-normal">
												{worktreeLabel}
											</CommandShortcut>
										</CommandItem>
									)
								})
							)}
						</CommandGroup>
					</CommandList>
				</Command>
			</CommandDialog>

			<CommandDialog
				open={actionsOpen}
				onOpenChange={open => {
					setActionsOpen(open)
				}}
				title={actionPaletteMode === 'create-worktree' ? 'Create worktree' : 'Create thread'}
				description={
					actionPaletteMode === 'create-worktree' ? 'Create or open a worktree branch.' : 'Choose an agent runtime.'
				}
				className="sm:max-w-2xl"
			>
				<Command
					onKeyDown={event => {
						event.stopPropagation()
						if (event.key === 'Escape') setActionsOpen(false)
					}}
				>
					<CommandInput
						placeholder={(() => {
							if (actionPaletteMode === 'create-worktree')
								return `Create in ${createWorktreeProject ? pathLabel(createWorktreeProject.repository.root) : 'workspace'}...`
							return `Create thread in ${input.activeWorktree ? (input.activeWorktree.branch ?? pathLabel(input.activeWorktree.root)) : 'worktree'}...`
						})()}
						value={actionPaletteMode === 'create-worktree' ? branch : undefined}
						onValueChange={value => {
							if (actionPaletteMode === 'create-worktree') setBranch(value)
						}}
						onKeyDown={event => {
							if (
								event.key === 'Enter' &&
								actionPaletteMode === 'create-worktree' &&
								branch !== '' &&
								createWorktreeProject
							) {
								event.preventDefault()
								void createFastWorktree()
							}
						}}
					/>
					<CommandList>
						<CommandEmpty>No command found.</CommandEmpty>
						{actionPaletteMode === 'create-worktree' && createWorktreeProject && (
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
								{branch !== '' && Predicate.isUndefined(selectedBranch) && (
									<CommandItem value={`create ${branch}`} onSelect={() => void createFastWorktree()}>
										<GitBranchPlus className="size-3.5" />
										Create {branch}
										<CommandShortcut>origin/{branchSnapshot.defaultBranch}</CommandShortcut>
									</CommandItem>
								)}
							</CommandGroup>
						)}
						{actionPaletteMode === 'create-thread' && input.activeProject && input.activeWorktree && (
							<CommandGroup>
								{Array.map(agentLayers, layer => (
									<CommandItem key={layer} value={`${layer} thread`} onSelect={() => void createFastAgent(layer)}>
										<AgentIcon layer={layer} className="size-3.5" />
										{layer}
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</CommandDialog>

			<TreeExplorer className="min-h-0 flex-1 overflow-y-auto px-0 py-1">
				<TreeExplorerSection>
					{Array.map(input.projects, (project, index) => {
						const projectWorktree =
							pipe(
								project.worktrees,
								Array.findFirst(candidate => candidate.root === project.repository.root),
								Option.getOrUndefined
							) ?? project.worktrees[0]

						return (
							<li key={project.repository.gitDirectory} className="min-w-0 py-1 first:pt-0">
								<div
									className={`grid h-7 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 pr-2 text-left font-semibold text-foreground text-xs hover:bg-transparent ${projectAccentClassNames[index % projectAccentClassNames.length]}`}
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
											setActionPaletteMode('create-worktree')
											setActionsOpen(true)
										}}
										title="Create worktree"
									>
										<GitBranchPlus className="size-3" />
									</Button>
								</div>
								<ul className="flex flex-col gap-px border-muted-foreground/20 border-l" style={{marginLeft: 15}}>
									{pipe(
										project.worktrees,
										Array.map(worktree => {
											const worktreeAgents = pipe(
												input.agents,
												Array.filter(
													agent => agent.projectRoot === project.repository.root && agent.worktreeRoot === worktree.root
												)
											)
											return (
												<li key={worktree.root} className="w-full min-w-0">
													<TreeExplorerRow
														key={worktree.root}
														icon={
															worktree.root === project.repository.root ? (
																<PanelTop
																	className={`size-3.5 ${worktree.status?.dirtyTracked || worktree.status?.untracked || worktree.status?.unpushedCommits || worktree.status?.behind ? 'text-amber-500' : 'text-current'}`}
																/>
															) : (
																<Square
																	className={`size-3.5 ${worktree.status?.dirtyTracked || worktree.status?.untracked || worktree.status?.unpushedCommits || worktree.status?.behind ? 'text-amber-500' : 'text-current'}`}
																/>
															)
														}
														selected={input.activeView === 'diff' && input.activeWorktree?.root === worktree.root}
														actions={
															<Button
																variant="ghost"
																size="icon-xs"
																className="h-5 w-5 rounded-none opacity-60 hover:opacity-100"
																onClick={event => {
																	event.stopPropagation()
																	input.selectWorktree(worktree.root)
																	setActionPaletteMode('create-thread')
																	setActionsOpen(true)
																}}
																title="Create thread"
															>
																<SparklesIcon className="size-3" />
															</Button>
														}
														onClick={() => input.selectWorktree(worktree.root)}
													>
														{worktree.branch ?? pathLabel(worktree.root)}
													</TreeExplorerRow>
													{!Array.isReadonlyArrayEmpty(worktreeAgents) && (
														<ul
															className="flex flex-col gap-px border-muted-foreground/20 border-l"
															style={{marginLeft: 15}}
														>
															{Array.map(worktreeAgents, agent => (
																<li key={agent.agentId} className="w-full min-w-0">
																	<TreeExplorerRow
																		icon={<AgentIcon layer={agent.layer} className="size-3.5" />}
																		actions={
																			<Button
																				variant="ghost"
																				size="icon-xs"
																				className="h-5 w-5 rounded-none opacity-60 hover:opacity-100"
																				onClick={event => {
																					event.stopPropagation()
																					void (async () => {
																						await archiveAgent({payload: {agentId: agent.agentId}})
																						const nextAgent = pipe(
																							input.agents,
																							Array.filter(candidate => candidate.agentId !== agent.agentId),
																							Array.sortWith(candidate => -candidate.lastActivityAt, Order.Number),
																							Array.head,
																							Option.getOrUndefined
																						)
																						if (nextAgent) input.selectAgent(nextAgent.worktreeRoot, nextAgent.agentId)
																					})()
																				}}
																			>
																				<Archive className="size-3" />
																			</Button>
																		}
																		selected={input.activeAgentId === agent.agentId}
																		onClick={() => input.selectAgent(worktree.root, agent.agentId)}
																	>
																		<span className="min-w-0 flex-1 truncate">
																			{agent.title ?? agent.firstPromptPreview ?? 'thread'}
																		</span>
																	</TreeExplorerRow>
																</li>
															))}
														</ul>
													)}
												</li>
											)
										})
									)}
								</ul>
							</li>
						)
					})}
				</TreeExplorerSection>
			</TreeExplorer>
		</div>
	)
}
