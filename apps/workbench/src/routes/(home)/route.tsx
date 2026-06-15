import {useAtom, useAtomSuspense} from '@effect/atom-react'

import {Array, Effect, Match, Option, Order, Predicate, Schema, String, pipe} from 'effect'

import {Outlet, createFileRoute, useParams, useRouterState} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {Suspense, startTransition, useState} from 'react'
import type {ReactNode} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeSidebarAtom} from '#lib/state.ts'
import {UsageStrip} from '#routes/components/-usage-strip.tsx'
import {TerminalPackageScriptPayload, TerminalPortlessScriptPayload} from '#rpcs/contracts.ts'
import type {
	AgentSession,
	SidebarPackageRun,
	SidebarPortlessRun,
	SidebarProject,
	SidebarWorktree
} from '#rpcs/contracts.ts'
import type {AgentCommandProfile} from '@deslop/ai/schema'
import {Loading} from '@deslop/components/fallbacks'
import {
	AgentIcon,
	BotIcon,
	Braces,
	GitBranch,
	GitBranchPlus,
	GlobeIcon,
	Layers,
	PanelTop,
	PlayIcon,
	ProcessStateIcon,
	RefreshCwIcon,
	Square,
	TerminalIcon,
	Trash
} from '@deslop/components/icons'
import {TreeExplorer, TreeExplorerGroup, TreeExplorerRow, TreeExplorerSection} from '@deslop/components/tree-explorer'
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from '@deslop/components/ui/dialog'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@deslop/components/ui/resizable'
import {toast} from '@deslop/components/ui/sonner'
import {Spinner} from '@deslop/components/ui/spinner'
import {formatError} from '@deslop/components/utils'
import {
	GitBranchesSnapshot,
	GitWorktreeLocalSource,
	GitWorktreeNewSource,
	GitWorktreeRemoteSource
} from '@deslop/git/schema'
import {terminalStatusActive} from '@deslop/terminal/schema'

export const Route = createFileRoute('/(home)')({
	component: HomeLayout,
	validateSearch: Schema.toStandardSchemaV1(Schema.Struct({}))
})

const branchesAtom = Atom.family((cwd: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			Effect.flatMap(RpcClient, client => client('projects.branches', {cwd})),
			{initialValue: new GitBranchesSnapshot({branches: [], defaultBranch: 'main'})}
		)
	)
)

function HomeLayout() {
	const activeWorktreeId = useParams({select: params => params.worktree, strict: false})
	const activeHome = useAtomSuspense(activeSidebarAtom(activeWorktreeId))

	return (
		<div className="bg-background h-full min-h-0 flex-1 overflow-hidden">
			<ResizablePanelGroup orientation="horizontal" className="h-full min-h-0 overflow-hidden">
				<ResizablePanel defaultSize="22%" minSize="16%" maxSize="34%">
					<WorktreeManager sidebar={activeHome.value} />
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
	return pipe(
		String.split('/')(value),
		Array.reverse,
		Array.findFirst(segment => String.isNonEmpty(segment) && segment !== '.'),
		Option.getOrElse(() => value)
	)
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

function WorktreeIcon(input: {readonly root: boolean}) {
	if (input.root) return <PanelTop />
	return <Square />
}

function validNewWorktreeBranch(branch: string) {
	return String.isNonEmpty(String.trim(branch)) && !/\s/u.test(branch)
}

function branchSource(candidate: {readonly remote?: string; readonly type: 'local' | 'remote'}) {
	return Match.value(candidate).pipe(
		Match.when({type: 'local'}, () => new GitWorktreeLocalSource({})),
		Match.orElse(remoteBranch => new GitWorktreeRemoteSource({remote: remoteBranch.remote ?? 'origin'}))
	)
}

function WorktreeScripts(input: {
	readonly runs: readonly SidebarPackageRun[]
	readonly selectRun: (run: SidebarPackageRun) => void
}) {
	const expandedState = useState(false)
	const sortedRuns = Array.sortWith(input.runs, run => run.taskId, Order.String)

	if (sortedRuns.length === 0) return null

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				icon={<Braces />}
				onClick={() => {
					expandedState[1](expanded => !expanded)
				}}
			>
				scripts
			</TreeExplorerRow>
			{expandedState[0] && (
				<TreeExplorerGroup>
					{Array.map(sortedRuns, run => (
						<Suspense key={run.sessionId} fallback={<Loading />}>
							<RunToggleRow
								run={run}
								onSelect={() => {
									input.selectRun(run)
								}}
							/>
						</Suspense>
					))}
				</TreeExplorerGroup>
			)}
		</li>
	)
}

function RunRow(input: {
	readonly actions: ReactNode
	readonly command?: string
	readonly onSelect: () => void
	readonly status: SidebarPackageRun['status']
	readonly taskId: string
}) {
	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				actions={input.actions}
				icon={<ProcessStateIcon state={input.status.state} />}
				title={input.command ?? input.taskId}
				onClick={input.onSelect}
			>
				{input.taskId}
			</TreeExplorerRow>
		</li>
	)
}

function RunActionButton(input: {
	readonly active: boolean
	readonly label: string
	readonly onToggle: () => Promise<void>
}) {
	const pendingState = useState(false)
	const actionIcon = Match.value({active: input.active, pending: pendingState[0]}).pipe(
		Match.when(
			value => value.pending,
			() => <Spinner className="size-2.5 border opacity-60" />
		),
		Match.when(
			value => value.active,
			() => <Square className="size-3" />
		),
		Match.orElse(() => <PlayIcon className="size-3" />)
	)

	async function toggle() {
		if (pendingState[0]) return

		pendingState[1](true)
		try {
			await input.onToggle()
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			pendingState[1](false)
		}
	}

	return (
		<TreeActionButton
			disabled={pendingState[0]}
			onClick={() => {
				void toggle()
			}}
			title={`${input.active ? 'Stop' : 'Start'} ${input.label}`}
		>
			{actionIcon}
		</TreeActionButton>
	)
}

function TreeActionButton(input: {
	readonly children: ReactNode
	readonly disabled?: boolean
	readonly onClick: () => void
	readonly title: string
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			className="text-muted-foreground hover:text-foreground"
			disabled={input.disabled}
			onClick={event => {
				event.stopPropagation()
				input.onClick()
			}}
			title={input.title}
		>
			{input.children}
		</Button>
	)
}

function RunToggleRow(input: {readonly onSelect: () => void; readonly run: SidebarPackageRun}) {
	const [, restart] = useAtom(RpcClient.mutation('terminal.restart'), {mode: 'promise'})
	const [, stop] = useAtom(RpcClient.mutation('terminal.stop'), {mode: 'promise'})
	const active = terminalStatusActive(input.run.status.state) && input.run.status.state !== 'idle'

	return (
		<RunRow
			actions={
				<span className="flex h-full items-center justify-end">
					<RunActionButton
						active={active}
						label={input.run.taskId}
						onToggle={async () => {
							const payload = new TerminalPackageScriptPayload({cwd: input.run.cwd, sessionId: input.run.sessionId})
							await (active ? stop({payload}) : restart({payload}))
						}}
					/>
				</span>
			}
			command={input.run.command}
			onSelect={input.onSelect}
			status={input.run.status}
			taskId={input.run.taskId}
		/>
	)
}

function PortlessGroup(input: {
	readonly openPreview: (run: SidebarPortlessRun) => void
	readonly runs: readonly SidebarPortlessRun[]
	readonly selectRun: (run: SidebarPortlessRun) => void
}) {
	const expandedState = useState(true)
	const sortedRuns = Array.sortWith(input.runs, run => run.taskId, Order.String)
	const active = Array.some(sortedRuns, run => terminalStatusActive(run.status.state) && run.status.state !== 'idle')
	const [, restart] = useAtom(RpcClient.mutation('terminal.restart'), {mode: 'promise'})
	const [, stop] = useAtom(RpcClient.mutation('terminal.stop'), {mode: 'promise'})

	async function toggleRuns() {
		for (const run of sortedRuns) {
			const payload = new TerminalPortlessScriptPayload({cwd: run.cwd, sessionId: run.sessionId})
			await (active ? stop({payload}) : restart({payload}))
		}
	}

	if (sortedRuns.length === 0) return null

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				actions={<RunActionButton active={active} label="deslop" onToggle={toggleRuns} />}
				icon={<GlobeIcon />}
				onClick={() => {
					expandedState[1](expanded => !expanded)
				}}
			>
				deslop
			</TreeExplorerRow>
			{expandedState[0] && (
				<TreeExplorerGroup>
					{Array.map(sortedRuns, run => (
						<Suspense key={run.sessionId} fallback={<Loading />}>
							<RunRow
								actions={
									<TreeActionButton
										onClick={() => {
											input.openPreview(run)
										}}
										title={`Open ${run.taskId} preview`}
									>
										<GlobeIcon className="size-3" />
									</TreeActionButton>
								}
								command={run.command}
								onSelect={() => {
									input.selectRun(run)
								}}
								status={run.status}
								taskId={run.taskId}
							/>
						</Suspense>
					))}
				</TreeExplorerGroup>
			)}
		</li>
	)
}

function AgentSessionRow(input: {
	readonly onSelect: () => void
	readonly onStop: () => void
	readonly session: AgentSession
	readonly stopping: boolean
}) {
	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				actions={
					<TreeActionButton
						disabled={input.stopping}
						onClick={() => {
							input.onStop()
						}}
						title={`Stop ${input.session.label}`}
					>
						{input.stopping ? <Spinner className="size-2.5 border opacity-60" /> : <Square className="size-3" />}
					</TreeActionButton>
				}
				icon={<ProcessStateIcon state={input.session.state.state} />}
				title={input.session.state.title ? `Title: ${input.session.state.title}` : input.session.label}
				onClick={input.onSelect}
			>
				{input.session.state.title === '' ? input.session.label : input.session.state.title}
			</TreeExplorerRow>
		</li>
	)
}

function WorktreeAgents(input: {
	readonly profiles: readonly AgentCommandProfile[]
	readonly selectAgent: (agentId: string) => void
	readonly worktree: SidebarWorktree
}) {
	const [, create] = useAtom(RpcClient.mutation('agents.create'), {mode: 'promise'})
	const [, remove] = useAtom(RpcClient.mutation('agents.remove'), {mode: 'promise'})
	const startingProfilesState = useState<ReadonlySet<string>>(new Set())
	const stoppingSessionsState = useState<ReadonlySet<string>>(new Set())

	async function startAgent(profile: (typeof input.profiles)[number]) {
		if (startingProfilesState[0].has(profile.id)) return

		startingProfilesState[1](current => new Set([...current, profile.id]))
		try {
			const session = await create({payload: {cwd: input.worktree.root, profileId: profile.id}})
			input.selectAgent(session.uuid)
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			startingProfilesState[1](current => {
				const next = new Set(current)
				next.delete(profile.id)
				return next
			})
		}
	}

	async function stopAgent(session: AgentSession) {
		if (stoppingSessionsState[0].has(session.uuid)) return

		stoppingSessionsState[1](current => new Set([...current, session.uuid]))
		try {
			await remove({payload: {cwd: input.worktree.root, uuid: session.uuid}})
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			stoppingSessionsState[1](current => {
				const next = new Set(current)
				next.delete(session.uuid)
				return next
			})
		}
	}

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow icon={<BotIcon />}>agents</TreeExplorerRow>
			<TreeExplorerGroup>
				{Array.map(input.profiles, profile => {
					const profileSessions = Array.filter(input.worktree.agents, session => session.profileId === profile.id)
					return (
						<li key={profile.id} className="w-full min-w-0">
							<TreeExplorerRow
								actions={
									<TreeActionButton
										disabled={startingProfilesState[0].has(profile.id)}
										onClick={() => {
											void startAgent(profile)
										}}
										title={`Start ${profile.label}`}
									>
										{startingProfilesState[0].has(profile.id) ? (
											<Spinner className="size-2.5 border opacity-60" />
										) : (
											<PlayIcon className="size-3" />
										)}
									</TreeActionButton>
								}
								icon={<AgentIcon layer={profile.icon} />}
							>
								{profile.label}
							</TreeExplorerRow>
							{profileSessions.length > 0 && (
								<TreeExplorerGroup>
									{Array.map(profileSessions, session => (
										<AgentSessionRow
											key={session.uuid}
											session={session}
											onSelect={() => {
												input.selectAgent(session.uuid)
											}}
											onStop={() => {
												void stopAgent(session)
											}}
											stopping={stoppingSessionsState[0].has(session.uuid)}
										/>
									))}
								</TreeExplorerGroup>
							)}
						</li>
					)
				})}
			</TreeExplorerGroup>
		</li>
	)
}

function CreateWorktreeDialog(input: {
	readonly project: SidebarProject
	readonly selectWorktree: (worktreeId: string) => void
	readonly setProject: (project: SidebarProject | undefined) => void
}) {
	const [, createWorktree] = useAtom(RpcClient.mutation('projects.createWorktree'), {mode: 'promise'})
	const branchState = useState('')
	const creatingBranchState = useState('')
	const branchSnapshot = useAtomSuspense(branchesAtom(input.project.repository.root))
	const localBranchNames = pipe(
		branchSnapshot.value.branches,
		Array.filter(candidate => candidate.type === 'local'),
		Array.map(candidate => candidate.name)
	)
	const usedBranchNames = pipe(
		input.project.worktrees,
		Array.map(worktree => worktree.branch ?? ''),
		Array.filter(String.isNonEmpty)
	)
	const availableBranches = pipe(
		branchSnapshot.value.branches,
		Array.filter(candidate => String.isNonEmpty(candidate.name)),
		Array.filter(candidate => candidate.type === 'local' || !Array.contains(localBranchNames, candidate.name)),
		Array.dedupeWith(
			(left, right) => left.name === right.name && left.type === right.type && left.remote === right.remote
		),
		Array.filter(candidate => !Array.contains(usedBranchNames, candidate.name))
	)
	const newBranch = String.trim(branchState[0])
	const newBranchInvalid = String.isNonEmpty(newBranch) && !validNewWorktreeBranch(newBranch)
	const branchCandidate = pipe(
		availableBranches,
		Array.findFirst(candidate => candidate.name === newBranch),
		Option.match({
			onNone: () => {
				if (String.isEmpty(newBranch) || newBranchInvalid || Array.contains(usedBranchNames, newBranch)) return
				return {name: newBranch, source: new GitWorktreeNewSource({}), type: 'new' as const}
			},
			onSome: candidate => ({name: candidate.name, source: branchSource(candidate), type: 'existing' as const})
		})
	)
	const emptyBranchMessage = Match.value({
		invalid: newBranchInvalid,
		used: Array.contains(usedBranchNames, newBranch)
	}).pipe(
		Match.when({invalid: true}, () => 'Branch names cannot contain spaces.'),
		Match.when({used: true}, () => 'Branch already has a worktree.'),
		Match.orElse(() => 'No matching branch.')
	)

	async function createFastWorktree(candidate: {
		readonly name: string
		readonly source: GitWorktreeLocalSource | GitWorktreeNewSource | GitWorktreeRemoteSource
	}) {
		if (String.isNonEmpty(creatingBranchState[0])) return

		creatingBranchState[1](candidate.name)
		try {
			const worktree = await createWorktree({
				payload: {branch: candidate.name, cwd: input.project.repository.root, source: candidate.source}
			})
			input.setProject(undefined)
			branchState[1]('')
			input.selectWorktree(worktree.id)
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			creatingBranchState[1]('')
		}
	}

	return (
		<CommandDialog
			open
			onOpenChange={open => {
				if (!open) input.setProject(undefined)
			}}
			title="Create worktree"
			description="Create or open a worktree branch."
			className="sm:max-w-2xl"
		>
			<Command
				onKeyDown={event => {
					event.stopPropagation()
					if (event.key === 'Escape') input.setProject(undefined)
				}}
			>
				<CommandInput
					placeholder={`Find or create branch in ${pathLabel(input.project.repository.root)}...`}
					value={branchState[0]}
					onValueChange={branchState[1]}
					onKeyDown={event => {
						if (event.key === 'Enter' && branchCandidate !== undefined) {
							event.preventDefault()
							void createFastWorktree(branchCandidate)
						}
					}}
				/>
				<CommandList>
					<CommandEmpty>{emptyBranchMessage}</CommandEmpty>
					<CommandGroup>
						{branchCandidate?.type === 'new' && (
							<CommandItem
								value={branchCandidate.name}
								disabled={String.isNonEmpty(creatingBranchState[0])}
								onSelect={() => {
									void createFastWorktree(branchCandidate)
								}}
							>
								{creatingBranchState[0] === branchCandidate.name ? (
									<Spinner className="size-2.5 border opacity-60" />
								) : (
									<GitBranchPlus />
								)}
								<span className="min-w-0 truncate">Create {branchCandidate.name}</span>
								<CommandShortcut>origin/{branchSnapshot.value.defaultBranch}</CommandShortcut>
							</CommandItem>
						)}
						{Array.map(availableBranches, candidate => (
							<CommandItem
								key={`${candidate.type}:${candidate.remote ?? ''}:${candidate.name}`}
								value={candidate.name}
								disabled={String.isNonEmpty(creatingBranchState[0])}
								onSelect={() => {
									branchState[1](candidate.name)
									void createFastWorktree({name: candidate.name, source: branchSource(candidate)})
								}}
							>
								{creatingBranchState[0] === candidate.name ? (
									<Spinner className="size-2.5 border opacity-60" />
								) : (
									Match.value(candidate.type).pipe(
										Match.when('local', () => <GitBranch />),
										Match.orElse(() => <GlobeIcon />)
									)
								)}
								<span className="min-w-0 truncate">{candidate.name}</span>
								<CommandShortcut>{candidate.type}</CommandShortcut>
							</CommandItem>
						))}
					</CommandGroup>
				</CommandList>
			</Command>
		</CommandDialog>
	)
}

function WorktreeManager(input: {
	readonly sidebar: {
		readonly activeProject?: SidebarProject
		readonly activeWorktree?: SidebarWorktree
		readonly agentProfiles: readonly AgentCommandProfile[]
		readonly projects: readonly SidebarProject[]
	}
}) {
	const navigate = Route.useNavigate()
	const activeView = useRouterState({
		select: state =>
			pipe(
				pipe(state.matches, Array.last, Option.getOrThrow).routeId,
				Match.value,
				Match.when('/(home)/$worktree/terminal', () => 'terminal' as const),
				Match.when('/(home)/$worktree/portless', () => 'portless' as const),
				Match.when('/(home)/$worktree/run', () => 'run' as const),
				Match.when('/(home)/$worktree/agent', () => 'agent' as const),
				Match.orElse(() => 'diff' as const)
			)
	})
	const [, fixProject] = useAtom(RpcClient.mutation('projects.fix'), {mode: 'promise'})
	const [, deleteWorktree] = useAtom(RpcClient.mutation('projects.deleteWorktree'), {mode: 'promise'})
	const createWorktreeProjectState = useState<SidebarProject | undefined>()
	const deletingWorktreeState = useState(false)
	const deleteDialogOpenState = useState(false)
	const fixingProjectState = useState('')
	function selectWorktree(worktreeId: string) {
		startTransition(() => {
			void navigate({params: {worktree: worktreeId}, to: '/$worktree/diff'})
		})
	}
	function selectTerminal(worktreeId: string) {
		startTransition(() => {
			void navigate({params: {worktree: worktreeId}, to: '/$worktree/terminal'})
		})
	}
	function selectPortless(worktreeId: string, origin: string) {
		startTransition(() => {
			void navigate({params: {worktree: worktreeId}, search: {origin}, to: '/$worktree/portless'})
		})
	}
	function selectAgent(worktreeId: string, agentId: string) {
		startTransition(() => {
			void navigate({params: {worktree: worktreeId}, search: {agentId}, to: '/$worktree/agent'})
		})
	}
	function selectRun(worktreeId: string, run: SidebarPackageRun | SidebarPortlessRun) {
		startTransition(() => {
			void Match.value(run).pipe(
				Match.tag('package-script', packageRun =>
					navigate({
						params: {worktree: worktreeId},
						search: {sessionId: packageRun.sessionId, type: 'package-script'},
						to: '/$worktree/run'
					})
				),
				Match.tag('portless-script', portlessRun =>
					navigate({
						params: {worktree: worktreeId},
						search: {sessionId: portlessRun.sessionId, type: 'portless-script'},
						to: '/$worktree/run'
					})
				),
				Match.exhaustive
			)
		})
	}
	async function deleteActiveWorktree() {
		if (!input.sidebar.activeWorktree || deletingWorktreeState[0]) return

		deletingWorktreeState[1](true)
		try {
			await deleteWorktree({payload: {cwd: input.sidebar.activeWorktree.root}})
			deleteDialogOpenState[1](false)
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			deletingWorktreeState[1](false)
		}
	}

	async function fixActiveProject(project: SidebarProject) {
		if (fixingProjectState[0] === project.repository.root) return

		fixingProjectState[1](project.repository.root)
		try {
			await fixProject({payload: {cwd: project.repository.root}})
		} catch (error) {
			toast.error(formatError(error))
		}
		fixingProjectState[1]('')
	}

	return (
		<div className="flex h-full flex-col border-r">
			<div className="grid h-8 grid-cols-[minmax(0,1fr)_auto] items-center border-b">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="text-muted-foreground hover:text-foreground flex h-full w-full min-w-0 justify-start px-3 text-left"
					onClick={() => {
						if (input.sidebar.activeWorktree) {
							void navigator.clipboard.writeText(input.sidebar.activeWorktree.root).then(
								() => {},
								() => {}
							)
						}
					}}
				>
					<span className="min-w-0 truncate">
						{input.sidebar.activeWorktree ? shortPath(input.sidebar.activeWorktree.root) : 'No worktree selected'}
					</span>
				</Button>
				{input.sidebar.activeWorktree &&
					input.sidebar.activeWorktree.root !== input.sidebar.activeProject?.repository.root && (
						<Button
							type="button"
							variant="destructive"
							size="icon"
							className="h-8 w-8"
							disabled={deletingWorktreeState[0]}
							onClick={() => {
								deleteDialogOpenState[1](true)
							}}
							title="Delete worktree"
						>
							{deletingWorktreeState[0] ? (
								<Spinner className="size-2.5 border opacity-60" />
							) : (
								<Trash className="size-3" />
							)}
						</Button>
					)}
			</div>

			<Dialog open={deleteDialogOpenState[0]} onOpenChange={deleteDialogOpenState[1]}>
				<DialogContent showCloseButton={!deletingWorktreeState[0]}>
					<DialogHeader>
						<DialogTitle>Delete worktree</DialogTitle>
						<DialogDescription>
							{input.sidebar.activeWorktree
								? `Delete ${input.sidebar.activeWorktree.branch ?? pathLabel(input.sidebar.activeWorktree.root)}?`
								: 'No worktree selected.'}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={deletingWorktreeState[0]}
							onClick={() => {
								deleteDialogOpenState[1](false)
							}}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={!input.sidebar.activeWorktree || deletingWorktreeState[0]}
							onClick={() => {
								void deleteActiveWorktree()
							}}
						>
							{deletingWorktreeState[0] ? (
								<Spinner className="size-2.5 border opacity-60" />
							) : (
								<Trash className="size-3" />
							)}
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{createWorktreeProjectState[0] && (
				<CreateWorktreeDialog
					project={createWorktreeProjectState[0]}
					selectWorktree={selectWorktree}
					setProject={createWorktreeProjectState[1]}
				/>
			)}

			<TreeExplorer className="min-h-0 flex-1 overflow-y-auto px-0 py-1">
				<TreeExplorerSection>
					{Array.map(input.sidebar.projects, project => (
						<li key={project.repository.gitDirectory} className="min-w-0 py-1 first:pt-0">
							<TreeExplorerRow
								actions={
									<span className="flex items-center">
										<TreeActionButton
											disabled={fixingProjectState[0] === project.repository.root}
											onClick={() => {
												void fixActiveProject(project)
											}}
											title="Fix repo state"
										>
											{fixingProjectState[0] === project.repository.root ? (
												<Spinner className="size-2.5 border opacity-60" />
											) : (
												<RefreshCwIcon className="size-3" />
											)}
										</TreeActionButton>
										<TreeActionButton
											onClick={() => {
												createWorktreeProjectState[1](project)
											}}
											title="Create worktree"
										>
											<GitBranchPlus className="size-3" />
										</TreeActionButton>
									</span>
								}
								className="text-foreground hover:text-foreground hover:bg-transparent"
								icon={<Layers />}
								onClick={() => {
									selectWorktree(project.rootWorktree.id)
								}}
							>
								{pathLabel(project.repository.root)}
							</TreeExplorerRow>
							<TreeExplorerGroup>
								{Array.map(project.worktrees, worktree => (
									<li key={worktree.id} className="w-full min-w-0">
										<TreeExplorerRow
											icon={<WorktreeIcon root={worktree.root === project.repository.root} />}
											selected={activeView === 'diff' && input.sidebar.activeWorktree?.id === worktree.id}
											onClick={() => {
												selectWorktree(worktree.id)
											}}
										>
											{worktree.branch ?? pathLabel(worktree.root)}
										</TreeExplorerRow>
										<TreeExplorerGroup>
											<Suspense fallback={<Loading />}>
												<WorktreeAgents
													profiles={input.sidebar.agentProfiles}
													selectAgent={agentId => {
														selectAgent(worktree.id, agentId)
													}}
													worktree={worktree}
												/>
											</Suspense>
											<li className="w-full min-w-0">
												<TreeExplorerRow
													icon={<TerminalIcon />}
													selected={activeView === 'terminal' && input.sidebar.activeWorktree?.id === worktree.id}
													onClick={() => {
														selectTerminal(worktree.id)
													}}
												>
													terminal
												</TreeExplorerRow>
											</li>
											<Suspense fallback={<Loading />}>
												<PortlessGroup
													openPreview={run => {
														selectPortless(worktree.id, run.origin.origin)
													}}
													runs={worktree.portlessRuns}
													selectRun={run => {
														selectRun(worktree.id, run)
													}}
												/>
											</Suspense>
											<Suspense fallback={<Loading />}>
												<WorktreeScripts
													runs={worktree.packageRuns}
													selectRun={run => {
														selectRun(worktree.id, run)
													}}
												/>
											</Suspense>
										</TreeExplorerGroup>
									</li>
								))}
							</TreeExplorerGroup>
						</li>
					))}
				</TreeExplorerSection>
			</TreeExplorer>

			<UsageStrip />
		</div>
	)
}
