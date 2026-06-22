import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Effect, HashSet, Match, Option, Predicate, Schema, String, pipe} from 'effect'

import {Outlet, createFileRoute, useRouterState} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {Suspense, startTransition, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeSidebarAtom, worktreeRouteId} from '#lib/state.ts'
import {UsageStrip} from '#routes/components/-usage-strip.tsx'
import type {AgentSession, ScriptRun, SidebarProject, SidebarWorktree} from '#rpcs/contracts.ts'
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
import {GitBranchesSnapshot} from '@deslop/git/schema'
import type {PortlessRun} from '@deslop/portless/schema'
import {TerminalStatus} from '@deslop/terminal/schema'

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
	const activeHome = useAtomSuspense(activeSidebarAtom(homeRouteState.activeWorktreeId))

	return (
		<div className="bg-background h-full min-h-0 flex-1 overflow-hidden">
			<ResizablePanelGroup orientation="horizontal" className="h-full min-h-0 overflow-hidden">
				<ResizablePanel defaultSize="22%" minSize="16%" maxSize="34%">
					<WorktreeManager
						activeProject={activeHome.value.activeProject}
						activeWorktree={activeHome.value.activeWorktree}
						activeView={homeRouteState.activeView}
						agentProfiles={activeHome.value.agentProfiles}
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

function WorktreeScripts(input: {
	readonly cwd: string
	readonly runStatuses: Readonly<Record<string, AgentSession['state']>>
	readonly scripts: readonly ScriptRun[]
	readonly selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const expandedState = useState(false)
	const sortedRuns = sortScriptRuns(input.scripts)

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
							<ScriptRunRow
								cwd={input.cwd}
								run={run}
								status={input.runStatuses[run.sessionId] ?? {state: 'idle', title: ''}}
								selectRun={input.selectRun}
							/>
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
	readonly status: AgentSession['state']
	readonly selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const session = scriptSession(input.cwd, input.run)
	const restart = useAtomSet(RpcClient.mutation('terminal.restart'), {mode: 'promise'})
	const stop = useAtomSet(RpcClient.mutation('terminal.stop'), {mode: 'promise'})
	const actionState = useState(false)

	async function toggleRun() {
		if (actionState[0]) return

		actionState[1](true)
		try {
			await (TerminalStatus.active(input.status.state) && input.status.state !== 'idle'
				? stop({payload: session})
				: restart({payload: session}))
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
							title={
								TerminalStatus.active(input.status.state) && input.status.state !== 'idle'
									? `Stop ${input.run.taskId}`
									: `Start ${input.run.taskId}`
							}
						>
							{pipe(
								Match.value({
									active: TerminalStatus.active(input.status.state) && input.status.state !== 'idle',
									pending: actionState[0]
								}),
								Match.when({pending: true}, () => <Spinner className="size-2.5 border opacity-60" />),
								Match.when({active: true}, () => <Square className="size-3" />),
								Match.orElse(() => <PlayIcon className="size-3" />)
							)}
						</Button>
					</span>
				}
				icon={<ProcessStateIcon state={input.status.state} />}
				selected={false}
				title={input.run.command}
				onClick={() => {
					input.selectRun(input.cwd, input.run.sessionId, input.status.state === 'idle')
				}}
			>
				{input.run.taskId}
			</TreeExplorerRow>
		</li>
	)
}

function WorktreePortless(input: {
	readonly cwd: string
	readonly runStatuses: Readonly<Record<string, AgentSession['state']>>
	readonly runs: readonly PortlessRun[]
	readonly selectPortless: (worktreeRoot: string, origin?: string) => void
	readonly selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const sortedRuns = sortPortlessRuns(input.runs)

	if (sortedRuns.length === 0) return null

	return (
		<PortlessGroup
			cwd={input.cwd}
			runs={sortedRuns}
			runStatuses={input.runStatuses}
			selectPortless={input.selectPortless}
			selectRun={input.selectRun}
		/>
	)
}

function PortlessGroup(input: {
	readonly cwd: string
	readonly runStatuses: Readonly<Record<string, AgentSession['state']>>
	readonly runs: readonly PortlessRun[]
	readonly selectPortless: (worktreeRoot: string, origin?: string) => void
	readonly selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const expandedState = useState(true)
	const restart = useAtomSet(RpcClient.mutation('terminal.restart'), {mode: 'promise'})
	const stop = useAtomSet(RpcClient.mutation('terminal.stop'), {mode: 'promise'})
	const actionState = useState(false)

	async function toggleRuns() {
		if (actionState[0]) return

		actionState[1](true)
		try {
			for (const run of input.runs) {
				const session = portlessSession(run)
				if (
					Array.some(
						input.runs,
						candidate =>
							TerminalStatus.active(input.runStatuses[candidate.script.sessionId]?.state ?? 'idle') &&
							input.runStatuses[candidate.script.sessionId]?.state !== 'idle'
					)
				) {
					await stop({payload: session})
				} else {
					await restart({payload: session})
				}
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
						title={
							Array.some(
								input.runs,
								run =>
									TerminalStatus.active(input.runStatuses[run.script.sessionId]?.state ?? 'idle') &&
									input.runStatuses[run.script.sessionId]?.state !== 'idle'
							)
								? 'Stop deslop'
								: 'Start deslop'
						}
					>
						{pipe(
							Match.value({
								active: Array.some(
									input.runs,
									run =>
										TerminalStatus.active(input.runStatuses[run.script.sessionId]?.state ?? 'idle') &&
										input.runStatuses[run.script.sessionId]?.state !== 'idle'
								),
								pending: actionState[0]
							}),
							Match.when({pending: true}, () => <Spinner className="size-2.5 border opacity-60" />),
							Match.when({active: true}, () => <Square className="size-3" />),
							Match.orElse(() => <PlayIcon className="size-3" />)
						)}
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
					{Array.map(input.runs, run => (
						<Suspense key={run.script.sessionId} fallback={<Loading />}>
							<PortlessRunRow
								run={run}
								status={input.runStatuses[run.script.sessionId] ?? {state: 'idle', title: ''}}
								selectPortless={input.selectPortless}
								selectRun={input.selectRun}
							/>
						</Suspense>
					))}
				</ul>
			)}
		</li>
	)
}

function PortlessRunRow(input: {
	readonly run: PortlessRun
	readonly status: AgentSession['state']
	readonly selectPortless: (worktreeRoot: string, origin?: string) => void
	readonly selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
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
						onClick={event => {
							event.stopPropagation()
							input.selectPortless(input.run.script.cwd, input.run.origin.origin)
						}}
						title={`Open ${input.run.script.taskId} preview`}
					>
						<GlobeIcon className="size-3" />
					</Button>
				}
				icon={<ProcessStateIcon state={input.status.state} />}
				selected={false}
				title={input.run.script.command ?? input.run.script.taskId}
				onClick={() => {
					input.selectRun(input.run.script.cwd, input.run.script.sessionId, input.status.state === 'idle')
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

function WorktreeAgents(input: {
	readonly cwd: string
	readonly profiles: readonly AgentCommandProfile[]
	readonly sessions: readonly AgentSession[]
	readonly selectAgent: (cwd: string, agentId: string) => void
}) {
	const create = useAtomSet(RpcClient.mutation('agents.create'), {mode: 'promise'})
	const remove = useAtomSet(RpcClient.mutation('agents.remove'), {mode: 'promise'})
	const startingProfilesState = useState(HashSet.empty<string>())
	const stoppingSessionsState = useState(HashSet.empty<string>())

	async function startAgent(profile: (typeof input.profiles)[number]) {
		if (HashSet.has(startingProfilesState[0], profile.id)) return

		startingProfilesState[1](current => HashSet.add(current, profile.id))
		try {
			const session = await create({payload: {cwd: input.cwd, profileId: profile.id}})
			input.selectAgent(input.cwd, session.uuid)
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			startingProfilesState[1](current => HashSet.remove(current, profile.id))
		}
	}

	async function stopAgent(session: AgentSession) {
		if (HashSet.has(stoppingSessionsState[0], session.uuid)) return

		stoppingSessionsState[1](current => HashSet.add(current, session.uuid))
		try {
			await remove({payload: {cwd: input.cwd, uuid: session.uuid}})
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			stoppingSessionsState[1](current => HashSet.remove(current, session.uuid))
		}
	}

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow icon={<BotIcon />} selected={false}>
				agents
			</TreeExplorerRow>
			<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
				{Array.map(input.profiles, profile => {
					const profileSessions = pipe(
						input.sessions,
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
										disabled={HashSet.has(startingProfilesState[0], profile.id)}
										onClick={event => {
											event.stopPropagation()
											void startAgent(profile)
										}}
										title={`Start ${profile.label}`}
									>
										{HashSet.has(startingProfilesState[0], profile.id) ? (
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
									{Array.map(profileSessions, session => (
										<AgentSessionRow
											key={session.uuid}
											session={session}
											onSelect={() => {
												input.selectAgent(input.cwd, session.uuid)
											}}
											onStop={() => {
												void stopAgent(session)
											}}
											stopping={HashSet.has(stoppingSessionsState[0], session.uuid)}
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
	readonly activeProject?: SidebarProject
	readonly activeWorktree?: SidebarWorktree
	readonly activeView: 'agent' | 'diff' | 'terminal' | 'portless' | 'run'
	readonly agentProfiles: readonly AgentCommandProfile[]
	readonly projects: readonly SidebarProject[]
	readonly selectWorktree: (worktreeRoot: string) => void
	readonly selectTerminal: (worktreeRoot: string) => void
	readonly selectPortless: (worktreeRoot: string, origin?: string) => void
	readonly selectAgent: (worktreeRoot: string, agentId: string) => void
	readonly selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const fixProject = useAtomSet(RpcClient.mutation('projects.fix'), {mode: 'promise'})
	const createWorktree = useAtomSet(RpcClient.mutation('projects.createWorktree'), {mode: 'promise'})
	const deleteWorktree = useAtomSet(RpcClient.mutation('projects.deleteWorktree'), {mode: 'promise'})
	const branchState = useState('')
	const actionsOpenState = useState(false)
	const createWorktreeProjectRootState = useState(input.activeProject?.repository.root)
	const creatingBranchState = useState('')
	const deletingWorktreeState = useState(false)
	const deleteDialogOpenState = useState(false)
	const fixingProjectState = useState('')
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
	async function createFastWorktree(candidate?: (typeof availableBranches)[number]) {
		const nextBranch = candidate?.name ?? newBranch
		if (String.isEmpty(nextBranch) || String.isNonEmpty(creatingBranchState[0])) return
		if (Predicate.isUndefined(candidate) && !validNewWorktreeBranch(nextBranch)) {
			toast.error('Branch names cannot contain spaces.')
			return
		}

		const source = Predicate.isUndefined(candidate)
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
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			deletingWorktreeState[1](false)
		}
	}
	async function fixRepository(cwd: string) {
		fixingProjectState[1](cwd)
		try {
			await fixProject({payload: {cwd}})
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			fixingProjectState[1]('')
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
								{String.isNonEmpty(newBranch) && validNewWorktreeBranch(newBranch) && !branchAvailable && (
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
											disabled={fixingProjectState[0] === project.repository.root}
											onClick={event => {
												event.stopPropagation()
												void fixRepository(project.repository.root)
											}}
											title="Fix repo state"
										>
											{fixingProjectState[0] === project.repository.root ? (
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
												icon={<WorktreeIcon dirty={false} root={worktree.root === project.repository.root} />}
												selected={input.activeView === 'diff' && input.activeWorktree?.root === worktree.root}
												onClick={() => {
													input.selectWorktree(worktree.root)
												}}
											>
												{worktree.branch ?? pathLabel(worktree.root)}
											</TreeExplorerRow>
											<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
												<Suspense fallback={<Loading />}>
													<WorktreeAgents
														cwd={worktree.root}
														profiles={input.agentProfiles}
														sessions={worktree.agents}
														selectAgent={input.selectAgent}
													/>
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
														runStatuses={worktree.runStatuses}
														runs={worktree.portlessRuns}
														selectPortless={input.selectPortless}
														selectRun={input.selectRun}
													/>
												</Suspense>
												<Suspense fallback={<Loading />}>
													<WorktreeScripts
														cwd={worktree.root}
														runStatuses={worktree.runStatuses}
														scripts={worktree.scriptRuns}
														selectRun={input.selectRun}
													/>
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
