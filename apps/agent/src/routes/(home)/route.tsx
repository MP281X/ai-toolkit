import {useAtomRefresh, useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Effect, Hash, Match, Option, Predicate, Schema, String, pipe} from 'effect'

import {Outlet, createFileRoute, useRouterState} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition, useEffect, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom, agentsAtom, draftAgentsAtom, projectsAtom} from '#lib/state.ts'
import {AgentId} from '@ai-toolkit/ai/catalog'
import type {AgentKey} from '@ai-toolkit/ai/schema'
import {
	AgentIcon,
	Archive,
	GitBranch,
	GitBranchPlus,
	GlobeIcon,
	Layers,
	PanelTop,
	SparklesIcon,
	Square,
	TerminalIcon,
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
import type {GitProject} from '@ai-toolkit/git/schema'
import {GitBranchesSnapshot} from '@ai-toolkit/git/schema'

export const Route = createFileRoute('/(home)')({
	component: HomeLayout,
	validateSearch: Schema.toStandardSchemaV1(
		Schema.Struct({
			threadId: Schema.optional(Schema.String)
		})
	)
})

const projectAccentClassNames = [
	'[&_svg]:text-[oklch(0.74_0.085_50)] [&_.tree-label]:text-[oklch(0.8_0.085_50)]',
	'[&_svg]:text-[oklch(0.72_0.075_150)] [&_.tree-label]:text-[oklch(0.78_0.075_150)]',
	'[&_svg]:text-[oklch(0.72_0.075_220)] [&_.tree-label]:text-[oklch(0.78_0.075_220)]',
	'[&_svg]:text-[oklch(0.72_0.075_285)] [&_.tree-label]:text-[oklch(0.78_0.075_285)]',
	'[&_svg]:text-[oklch(0.72_0.075_20)] [&_.tree-label]:text-[oklch(0.78_0.075_20)]',
	'[&_svg]:text-[oklch(0.74_0.065_95)] [&_.tree-label]:text-[oklch(0.8_0.065_95)]'
] as const

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
	const search = Route.useSearch()
	const homeRouteState = useRouterState({
		select: state => {
			const activeView = pipe(
				Match.value(state.location.pathname),
				Match.when(String.endsWith('/thread'), () => 'thread' as const),
				Match.when(String.endsWith('/terminal'), () => 'terminal' as const),
				Match.when(String.endsWith('/browser'), () => 'browser' as const),
				Match.orElse(() => 'diff' as const)
			)

			return {
				activeView,
				activeWorktreeId: String.split('/')(state.location.pathname)[1]
			}
		}
	})
	const activeHome = useAtomSuspense(activeHomeAtom(homeRouteState.activeWorktreeId))
	const agentsSnapshot = useAtomSuspense(agentsAtom)

	return (
		<div className="bg-background h-full min-h-0 flex-1 overflow-hidden font-mono">
			<ResizablePanelGroup orientation="horizontal" className="h-full min-h-0 overflow-hidden">
				<ResizablePanel defaultSize="22%" minSize="16%" maxSize="34%">
					<WorktreeManager
						agents={agentsSnapshot.value}
						activeProject={activeHome.value.activeProject}
						activeWorktree={activeHome.value.activeWorktree}
						activeAgentId={search.threadId}
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
						selectAgent={(worktreeRoot, agentId) => {
							startTransition(() => {
								void navigate({
									params: {worktree: Math.abs(Hash.string(worktreeRoot)).toString(36)},
									search: {
										threadId: agentId
									},
									to: '/$worktree/thread'
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
						selectBrowser={worktreeRoot =>
							startTransition(() => {
								navigate({
									params: {worktree: Math.abs(Hash.string(worktreeRoot)).toString(36)},
									to: '/$worktree/browser'
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

function BranchCandidateIcon(input: {readonly type: 'local' | 'remote'}) {
	if (input.type === 'local') return <GitBranch className="size-3.5" />
	return <Square className="size-3.5" />
}

function WorktreeIcon(input: {readonly dirty: boolean; readonly root: boolean}) {
	if (input.root) return <PanelTop className={`size-3.5 ${input.dirty ? 'text-amber-500' : 'text-current'}`} />
	return <Square className={`size-3.5 ${input.dirty ? 'text-amber-500' : 'text-current'}`} />
}

function WorktreeManager(input: {
	readonly agents: readonly AgentKey[]
	readonly activeProject?: GitProject
	readonly activeWorktree?: GitProject['worktrees'][number]
	readonly activeAgentId?: string
	readonly activeView: 'thread' | 'diff' | 'terminal' | 'browser'
	readonly projects: readonly GitProject[]
	readonly selectWorktree: (worktreeRoot: string) => void
	readonly selectAgent: (worktreeRoot: string, agentId: string) => void
	readonly selectTerminal: (worktreeRoot: string) => void
	readonly selectBrowser: (worktreeRoot: string) => void
}) {
	const refreshProjects = useAtomRefresh(projectsAtom)
	const setDraftAgents = useAtomSet(draftAgentsAtom)
	const createWorktree = useAtomSet(RpcClient.mutation('projects.createWorktree'), {mode: 'promise'})
	const createAgent = useAtomSet(RpcClient.mutation('agents.create'), {mode: 'promise'})
	const deleteAgent = useAtomSet(RpcClient.mutation('agent.delete'), {mode: 'promise'})
	const deleteWorktree = useAtomSet(RpcClient.mutation('projects.deleteWorktree'), {mode: 'promise'})
	const [branch, setBranch] = useState('')
	const [switcherValue, setSwitcherValue] = useState('')
	const [switcherOpen, setSwitcherOpen] = useState(false)
	const [actionsOpen, setActionsOpen] = useState(false)
	const [actionPaletteMode, setActionPaletteMode] = useState<'create-thread' | 'create-worktree'>('create-thread')
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
	useEffect(() => {
		function openThreadSearch(event: KeyboardEvent) {
			if (!(event.ctrlKey || event.metaKey) || event.shiftKey) return
			if (String.toLowerCase(event.key) !== 'p') return

			event.preventDefault()
			setSwitcherValue('')
			setSwitcherOpen(open => !open)
		}

		globalThis.addEventListener('keydown', openThreadSearch)

		return () => {
			globalThis.removeEventListener('keydown', openThreadSearch)
		}
	}, [])

	async function createFastWorktree(nextBranch = branch) {
		const nextSelectedBranch = pipe(
			availableBranches,
			Array.findFirst(candidate => candidate.name === nextBranch),
			Option.getOrUndefined
		)
		const mode = pipe(
			Match.value(nextSelectedBranch?.type),
			Match.when('local', () => 'existing-local' as const),
			Match.when('remote', () => 'existing-remote' as const),
			Match.orElse(() => 'new-local' as const)
		)

		const worktreeRoot = await createWorktree({
			payload: {
				baseBranch:
					nextSelectedBranch?.type === 'remote'
						? `${nextSelectedBranch.remote}/${nextSelectedBranch.name}`
						: `origin/${branchSnapshot.value.defaultBranch}`,
				branch: nextBranch,
				cwd: (createWorktreeProject ?? input.activeProject)?.repository.root ?? '',
				mode
			}
		})
		setActionsOpen(false)
		setBranch('')
		refreshProjects()
		input.selectWorktree(worktreeRoot)
	}

	async function createFastAgent(layer: typeof AgentId.Type) {
		const agent = await createAgent({
			payload: {
				agent: layer,
				cwd: input.activeWorktree?.root ?? ''
			}
		})

		setActionsOpen(false)
		setDraftAgents(draftAgents => ({...draftAgents, [agent.id]: agent}))
		input.selectAgent(input.activeWorktree?.root ?? '', agent.id)
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
							if (
								!globalThis.confirm(
									`Delete worktree ${input.activeWorktree.branch ?? pathLabel(input.activeWorktree.root)}?`
								)
							) {
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
					<CommandInput placeholder="Go to thread..." />
					<CommandList>
						<CommandEmpty>No thread found.</CommandEmpty>
						<CommandGroup>
							{Array.map(input.agents, agent => {
								const worktreeLabel = pipe(
									input.projects,
									Array.findFirst(project => Array.some(project.worktrees, worktree => worktree.root === agent.cwd)),
									Option.flatMap(project =>
										Array.findFirst(project.worktrees, candidate => candidate.root === agent.cwd)
									),
									Option.map(worktree => worktree.branch ?? pathLabel(agent.cwd)),
									Option.getOrElse(() => pathLabel(agent.cwd))
								)

								return (
									<CommandItem
										key={agent.id}
										value={`agent:${agent.id}`}
										keywords={[worktreeLabel, agent.agent, agent.id]}
										onSelect={() => {
											setSwitcherOpen(false)
											input.selectAgent(agent.cwd, agent.id)
										}}
									>
										<AgentIcon layer={agent.agent} className="size-3.5" />
										<span className="min-w-0 truncate">thread</span>
										<CommandShortcut className="max-w-64 truncate tracking-normal normal-case">
											{worktreeLabel}
										</CommandShortcut>
									</CommandItem>
								)
							})}
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
						placeholder={
							actionPaletteMode === 'create-worktree'
								? `Create in ${createWorktreeProject ? pathLabel(createWorktreeProject.repository.root) : 'workspace'}...`
								: `Create thread in ${input.activeWorktree ? (input.activeWorktree.branch ?? pathLabel(input.activeWorktree.root)) : 'worktree'}...`
						}
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
										<BranchCandidateIcon type={candidate.type} />
										<span className="min-w-0 truncate">{candidate.name}</span>
										<CommandShortcut>{candidate.type}</CommandShortcut>
									</CommandItem>
								))}
								{branch !== '' &&
									Predicate.isUndefined(
										Option.getOrUndefined(Array.findFirst(availableBranches, candidate => candidate.name === branch))
									) && (
										<CommandItem value={`create ${branch}`} onSelect={() => void createFastWorktree()}>
											<GitBranchPlus className="size-3.5" />
											Create {branch}
											<CommandShortcut>origin/{branchSnapshot.value.defaultBranch}</CommandShortcut>
										</CommandItem>
									)}
							</CommandGroup>
						)}
						{actionPaletteMode === 'create-thread' && input.activeProject && input.activeWorktree && (
							<CommandGroup>
								{Array.map(AgentId.literals, layer => (
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
											setActionPaletteMode('create-worktree')
											setActionsOpen(true)
										}}
										title="Create worktree"
									>
										<GitBranchPlus className="size-3" />
									</Button>
								</div>
								<ul className="border-muted-foreground/20 flex flex-col gap-px border-l" style={{marginLeft: 15}}>
									{Array.map(project.worktrees, worktree => {
										const worktreeAgents = Array.filter(input.agents, agent => agent.cwd === worktree.root)
										return (
											<li key={worktree.root} className="w-full min-w-0">
												<TreeExplorerRow
													key={worktree.root}
													icon={
														<WorktreeIcon
															dirty={Boolean(
																worktree.status?.dirtyTracked ??
																worktree.status?.untracked ??
																worktree.status?.unpushedCommits ??
																worktree.status?.behind
															)}
															root={worktree.root === project.repository.root}
														/>
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
													onClick={() => {
														input.selectWorktree(worktree.root)
													}}
												>
													{worktree.branch ?? pathLabel(worktree.root)}
												</TreeExplorerRow>
												<ul
													className="border-muted-foreground/20 flex flex-col gap-px border-l"
													style={{marginLeft: 15}}
												>
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
															onClick={() => input.selectBrowser(worktree.root)}
														>
															browser
														</TreeExplorerRow>
													</li>
												</ul>
												{!Array.isReadonlyArrayEmpty(worktreeAgents) && (
													<ul
														className="border-muted-foreground/20 flex flex-col gap-px border-l"
														style={{marginLeft: 15}}
													>
														{Array.map(worktreeAgents, agent => (
															<li key={agent.id} className="w-full min-w-0">
																<TreeExplorerRow
																	icon={<AgentIcon layer={agent.agent} className="size-3.5" />}
																	actions={
																		<div className="flex items-center gap-1">
																			<Button
																				variant="ghost"
																				size="icon-xs"
																				className="h-5 w-5 rounded-none opacity-60 hover:opacity-100"
																				onClick={async event => {
																					event.stopPropagation()
																					await deleteAgent({payload: {key: agent}})
																					pipe(
																						input.agents,
																						Array.filter(candidate => candidate.id !== agent.id),
																						Array.head,
																						Option.match({
																							onNone: () => undefined,
																							onSome: nextAgent => {
																								input.selectAgent(nextAgent.cwd, nextAgent.id)
																							}
																						})
																					)
																				}}
																			>
																				<Archive className="size-3" />
																			</Button>
																		</div>
																	}
																	selected={input.activeAgentId === agent.id}
																	onClick={() => {
																		input.selectAgent(worktree.root, agent.id)
																	}}
																>
																	<span className="min-w-0 flex-1 truncate">thread</span>
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
					})}
				</TreeExplorerSection>
			</TreeExplorer>
		</div>
	)
}
