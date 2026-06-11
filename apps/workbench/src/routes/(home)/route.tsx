import {useAtom, useAtomRefresh, useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Effect, Match, Option, Predicate, Schema, String, pipe} from 'effect'

import {Outlet, createFileRoute, useRouterState} from '@tanstack/react-router'
import {AsyncResult, Atom} from 'effect/unstable/reactivity'
import {Suspense, startTransition, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {
	activeHomeAtom,
	agentProfilesAtom,
	agentsAtom,
	portlessRunsAtom,
	projectsAtom,
	scriptRunsAtom,
	terminalStatusAtom,
	worktreeRouteId
} from '#lib/state.ts'
import {UsageStrip} from '#routes/components/-usage-strip.tsx'
import type {AgentSession, ScriptRun} from '#rpcs/contracts.ts'
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
import type {GitBranch as GitBranchSchema, GitProject} from '@deslop/git/schema'
import {GitBranchesSnapshot} from '@deslop/git/schema'
import type {PortlessRun} from '@deslop/portless/schema'
import {terminalStatusActive} from '@deslop/terminal/schema'

export const Route = createFileRoute('/(home)')({
	component: HomeLayout,
	validateSearch: Schema.toStandardSchemaV1(Schema.Struct({}))
})

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
						selectRun={(worktreeRoot, sessionId, inactive) => {
							startTransition(() => {
								void navigate({
									params: {worktree: worktreeRouteId(worktreeRoot)},
									search: {inactive, sessionId},
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

function WorktreeIcon(input: {readonly dirty: boolean; readonly root: boolean}) {
	if (input.root) return <PanelTop className={input.dirty ? 'text-amber-500' : 'text-current'} />
	return <Square className={input.dirty ? 'text-amber-500' : 'text-current'} />
}

function scriptSession(cwd: string, run: ScriptRun) {
	return {cwd, sessionId: run.sessionId}
}

function portlessSession(run: PortlessRun) {
	return {cwd: run.script.cwd, sessionId: run.script.sessionId}
}

function validNewWorktreeBranch(branch: string) {
	return String.isNonEmpty(String.trim(branch)) && !/\s/u.test(branch)
}

function sortScriptRuns(runs: readonly ScriptRun[]) {
	return [...runs].toSorted((left, right) => left.taskId.localeCompare(right.taskId))
}

function sortPortlessRuns(runs: readonly PortlessRun[]) {
	return [...runs].toSorted((left, right) => left.script.taskId.localeCompare(right.script.taskId))
}

const portlessActiveAtom = Atom.family((runs: readonly PortlessRun[]) =>
	Atom.make(get =>
		pipe(
			pipe(
				runs,
				Array.map(run => get.result(terminalStatusAtom(portlessSession(run))))
			),
			Effect.all,
			Effect.map(Array.some(status => terminalStatusActive(status.state) && status.state !== 'idle'))
		)
	)
)

function WorktreeScripts(input: {
	readonly cwd: string
	readonly selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const scripts = useAtomSuspense(scriptRunsAtom(input.cwd))
	const expandedState = useState(false)
	const sortedRuns = sortScriptRuns(scripts.value)

	if (sortedRuns.length === 0) return null

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				icon={<Braces />}
				selected={false}
				onClick={() => {
					expandedState[1](expanded => !expanded)
				}}
			>
				scripts
			</TreeExplorerRow>
			{expandedState[0] && (
				<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
					{sortedRuns.map(run => (
						<Suspense key={run.sessionId} fallback={<Loading />}>
							<ScriptRunRow cwd={input.cwd} run={run} selectRun={input.selectRun} />
						</Suspense>
					))}
				</ul>
			)}
		</li>
	)
}

function ScriptRunRow(input: {
	readonly cwd: string
	readonly run: ScriptRun
	readonly selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const session = scriptSession(input.cwd, input.run)
	const status = useAtomSuspense(terminalStatusAtom(session))
	const restart = useAtomSet(RpcClient.mutation('terminal.restart'), {mode: 'promise'})
	const stop = useAtomSet(RpcClient.mutation('terminal.stop'), {mode: 'promise'})
	const actionState = useState(false)

	const active = terminalStatusActive(status.value.state) && status.value.state !== 'idle'
	let actionIcon = <PlayIcon className="size-3" />
	if (active) actionIcon = <Square className="size-3" />
	if (actionState[0]) actionIcon = <Spinner className="size-2.5 border opacity-60" />

	async function toggleRun() {
		if (actionState[0]) return

		actionState[1](true)
		try {
			await (active ? stop({payload: session}) : restart({payload: session}))
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			actionState[1](false)
		}
	}

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				actions={
					<span className="flex h-full items-center justify-end">
						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							className="text-muted-foreground hover:text-foreground"
							disabled={actionState[0]}
							onClick={event => {
								event.stopPropagation()
								void toggleRun()
							}}
							title={active ? `Stop ${input.run.taskId}` : `Start ${input.run.taskId}`}
						>
							{actionIcon}
						</Button>
					</span>
				}
				icon={<ProcessStateIcon state={status.value.state} />}
				selected={false}
				title={input.run.command}
				onClick={() => {
					input.selectRun(input.cwd, input.run.sessionId, status.value.state === 'idle')
				}}
			>
				{input.run.taskId}
			</TreeExplorerRow>
		</li>
	)
}

function WorktreePortless(input: {
	readonly cwd: string
	readonly selectPortless: (worktreeRoot: string, origin?: string) => void
	readonly selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const runs = useAtomSuspense(portlessRunsAtom(input.cwd))

	const sortedRuns = sortPortlessRuns(runs.value)

	if (sortedRuns.length === 0) return null

	return (
		<PortlessGroup
			cwd={input.cwd}
			runs={sortedRuns}
			selectPortless={input.selectPortless}
			selectRun={input.selectRun}
		/>
	)
}

function PortlessGroup(input: {
	readonly cwd: string
	readonly runs: readonly PortlessRun[]
	readonly selectPortless: (worktreeRoot: string, origin?: string) => void
	readonly selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const expandedState = useState(true)
	const active = useAtomSuspense(portlessActiveAtom(input.runs))
	const restart = useAtomSet(RpcClient.mutation('terminal.restart'), {mode: 'promise'})
	const stop = useAtomSet(RpcClient.mutation('terminal.stop'), {mode: 'promise'})
	const actionState = useState(false)

	let actionIcon = <PlayIcon className="size-3" />
	if (active.value) actionIcon = <Square className="size-3" />
	if (actionState[0]) actionIcon = <Spinner className="size-2.5 border opacity-60" />

	async function toggleRuns() {
		if (actionState[0]) return

		actionState[1](true)
		try {
			for (const run of input.runs) {
				const session = portlessSession(run)
				if (active.value) await stop({payload: session})
				else await restart({payload: session})
			}
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			actionState[1](false)
		}
	}

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				actions={
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						className="text-muted-foreground hover:text-foreground"
						disabled={actionState[0]}
						onClick={event => {
							event.stopPropagation()
							void toggleRuns()
						}}
						title={active.value ? 'Stop deslop' : 'Start deslop'}
					>
						{actionIcon}
					</Button>
				}
				icon={<GlobeIcon />}
				selected={false}
				onClick={() => {
					expandedState[1](expanded => !expanded)
				}}
			>
				deslop
			</TreeExplorerRow>
			{expandedState[0] && (
				<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
					{input.runs.map(run => (
						<Suspense key={run.script.sessionId} fallback={<Loading />}>
							<PortlessRunRow run={run} selectPortless={input.selectPortless} selectRun={input.selectRun} />
						</Suspense>
					))}
				</ul>
			)}
		</li>
	)
}

function PortlessRunRow(input: {
	readonly run: PortlessRun
	readonly selectPortless: (worktreeRoot: string, origin?: string) => void
	readonly selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const session = portlessSession(input.run)
	const status = useAtomSuspense(terminalStatusAtom(session))

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				actions={
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						className="text-muted-foreground hover:text-foreground"
						onClick={event => {
							event.stopPropagation()
							input.selectPortless(input.run.script.cwd, input.run.origin.origin)
						}}
						title={`Open ${input.run.script.taskId} preview`}
					>
						<GlobeIcon className="size-3" />
					</Button>
				}
				icon={<ProcessStateIcon state={status.value.state} />}
				selected={false}
				title={input.run.script.command ?? input.run.script.taskId}
				onClick={() => {
					input.selectRun(input.run.script.cwd, input.run.script.sessionId, status.value.state === 'idle')
				}}
			>
				{input.run.script.taskId}
			</TreeExplorerRow>
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
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						className="text-muted-foreground hover:text-foreground"
						disabled={input.stopping}
						onClick={event => {
							event.stopPropagation()
							input.onStop()
						}}
						title={`Stop ${input.session.label}`}
					>
						{input.stopping ? <Spinner className="size-2.5 border opacity-60" /> : <Square className="size-3" />}
					</Button>
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
	const profiles = useAtomSuspense(agentProfilesAtom)
	const sessions = useAtomSuspense(agentsAtom(input.cwd))
	const startingProfilesState = useState<ReadonlySet<string>>(new Set())
	const stoppingSessionsState = useState<ReadonlySet<string>>(new Set())

	async function startAgent(profile: (typeof profiles.value)[number]) {
		if (startingProfilesState[0].has(profile.id)) return

		startingProfilesState[1](current => new Set([...current, profile.id]))
		try {
			const session = await create({payload: {cwd: input.cwd, profileId: profile.id}})
			input.selectAgent(input.cwd, session.uuid)
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
			await remove({payload: {cwd: input.cwd, uuid: session.uuid}})
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
			<TreeExplorerRow icon={<BotIcon />} selected={false}>
				agents
			</TreeExplorerRow>
			<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
				{profiles.value.map(profile => {
					const profileSessions = pipe(
						sessions.value,
						Array.filter(session => session.profileId === profile.id)
					)
					return (
						<li key={profile.id} className="w-full min-w-0">
							<TreeExplorerRow
								actions={
									<Button
										type="button"
										variant="ghost"
										size="icon-xs"
										className="text-muted-foreground hover:text-foreground"
										disabled={startingProfilesState[0].has(profile.id)}
										onClick={event => {
											event.stopPropagation()
											void startAgent(profile)
										}}
										title={`Start ${profile.label}`}
									>
										{startingProfilesState[0].has(profile.id) ? (
											<Spinner className="size-2.5 border opacity-60" />
										) : (
											<PlayIcon className="size-3" />
										)}
									</Button>
								}
								icon={<AgentIcon layer={profile.icon} />}
								selected={false}
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
												void stopAgent(session)
											}}
											stopping={stoppingSessionsState[0].has(session.uuid)}
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
	readonly selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const refreshProjects = useAtomRefresh(projectsAtom)
	const [cleanupResult, cleanupProject] = useAtom(RpcClient.mutation('projects.cleanup'))
	const createWorktree = useAtomSet(RpcClient.mutation('projects.createWorktree'), {mode: 'promise'})
	const deleteWorktree = useAtomSet(RpcClient.mutation('projects.deleteWorktree'), {mode: 'promise'})
	const branchState = useState('')
	const actionsOpenState = useState(false)
	const createWorktreeProjectRootState = useState(input.activeProject?.repository.root)
	const creatingBranchState = useState('')
	const deletingWorktreeState = useState(false)
	const deleteDialogOpenState = useState(false)
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
	const newBranch = String.trim(branchState[0])
	const branchAvailable = pipe(
		availableBranches,
		Array.some(candidate => candidate.name === newBranch)
	)
	const canCreateNewBranch = String.isNonEmpty(newBranch) && validNewWorktreeBranch(newBranch) && !branchAvailable
	async function createFastWorktree(candidate?: GitBranchSchema) {
		const nextBranch = candidate?.name ?? newBranch
		if (String.isEmpty(nextBranch) || String.isNonEmpty(creatingBranchState[0])) return
		if (candidate === undefined && !validNewWorktreeBranch(nextBranch)) {
			toast.error('Branch names cannot contain spaces.')
			return
		}

		const source =
			candidate === undefined
				? {_tag: 'new' as const}
				: Match.value(candidate).pipe(
						Match.when({type: 'local'}, () => ({_tag: 'local' as const})),
						Match.orElse(remoteBranch => ({_tag: 'remote' as const, remote: remoteBranch.remote ?? 'origin'}))
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
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			creatingBranchState[1]('')
		}
	}
	async function deleteActiveWorktree() {
		if (!input.activeWorktree || deletingWorktreeState[0]) return

		deletingWorktreeState[1](true)
		try {
			await deleteWorktree({payload: {cwd: input.activeWorktree.root}})
			deleteDialogOpenState[1](false)
			refreshProjects()
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			deletingWorktreeState[1](false)
		}
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
						if (input.activeWorktree) void navigator.clipboard.writeText(input.activeWorktree.root)
					}}
				>
					<span className="min-w-0 truncate">
						{input.activeWorktree ? shortPath(input.activeWorktree.root) : 'No worktree selected'}
					</span>
				</Button>
				{input.activeWorktree && input.activeWorktree.root !== input.activeProject?.repository.root && (
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
							{input.activeWorktree
								? `Delete ${input.activeWorktree.branch ?? pathLabel(input.activeWorktree.root)}?`
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
							disabled={!input.activeWorktree || deletingWorktreeState[0]}
							onClick={() => {
								void deleteActiveWorktree()
								actionsOpenState[1](false)
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
						placeholder={`Find or create branch in ${createWorktreeProject ? pathLabel(createWorktreeProject.repository.root) : 'workspace'}...`}
						value={branchState[0]}
						onValueChange={branchState[1]}
						onKeyDown={event => {
							if (event.key === 'Enter' && String.isNonEmpty(newBranch) && createWorktreeProject) {
								event.preventDefault()
								void createFastWorktree(
									pipe(
										availableBranches,
										Array.findFirst(candidate => candidate.name === newBranch),
										Option.getOrUndefined
									)
								)
							}
						}}
					/>
					<CommandList>
						<CommandEmpty>
							{String.isNonEmpty(newBranch) && !validNewWorktreeBranch(newBranch)
								? 'Branch names cannot contain spaces.'
								: 'No matching branch.'}
						</CommandEmpty>
						{createWorktreeProject && (
							<CommandGroup>
								{canCreateNewBranch && (
									<CommandItem
										value={newBranch}
										disabled={String.isNonEmpty(creatingBranchState[0])}
										onSelect={() => {
											void createFastWorktree()
										}}
									>
										{creatingBranchState[0] === newBranch ? (
											<Spinner className="size-2.5 border opacity-60" />
										) : (
											<GitBranchPlus />
										)}
										<span className="min-w-0 truncate">Create {newBranch}</span>
										<CommandShortcut>origin/{branchSnapshot.value.defaultBranch}</CommandShortcut>
									</CommandItem>
								)}
								{Array.map(availableBranches, candidate => {
									const icon =
										creatingBranchState[0] === candidate.name ? (
											<Spinner className="size-2.5 border opacity-60" />
										) : (
											Match.value(candidate.type).pipe(
												Match.when('local', () => <GitBranch />),
												Match.orElse(() => <GlobeIcon />)
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
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</CommandDialog>

			<TreeExplorer className="min-h-0 flex-1 overflow-y-auto px-0 py-1">
				<TreeExplorerSection>
					{Array.map(input.projects, project => {
						const projectWorktree =
							Option.getOrUndefined(
								Array.findFirst(project.worktrees, candidate => candidate.root === project.repository.root)
							) ?? project.worktrees[0]

						return (
							<li key={project.repository.gitDirectory} className="min-w-0 py-1 first:pt-0">
								<div className="text-foreground grid h-7 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 pr-2 text-left font-normal hover:bg-transparent">
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
									<span className="flex items-center">
										<Button
											variant="ghost"
											size="icon-xs"
											className="h-5 w-5 rounded-none opacity-70 hover:opacity-100"
											disabled={AsyncResult.isWaiting(cleanupResult)}
											onClick={event => {
												event.stopPropagation()
												cleanupProject({payload: {cwd: project.repository.root}})
											}}
											title="Cleanup project"
										>
											{AsyncResult.isWaiting(cleanupResult) ? (
												<Spinner className="size-2.5 border opacity-60" />
											) : (
												<RefreshCwIcon className="size-3" />
											)}
										</Button>
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
									</span>
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
												<Suspense fallback={<Loading />}>
													<WorktreeAgents cwd={worktree.root} selectAgent={input.selectAgent} />
												</Suspense>
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
												<Suspense fallback={<Loading />}>
													<WorktreePortless
														cwd={worktree.root}
														selectPortless={input.selectPortless}
														selectRun={input.selectRun}
													/>
												</Suspense>
												<Suspense fallback={<Loading />}>
													<WorktreeScripts cwd={worktree.root} selectRun={input.selectRun} />
												</Suspense>
											</ul>
										</li>
									))}
								</ul>
							</li>
						)
					})}
				</TreeExplorerSection>
			</TreeExplorer>

			<UsageStrip />
		</div>
	)
}
