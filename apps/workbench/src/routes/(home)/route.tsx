import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Effect, HashSet, Match, Option, Order, Predicate, Schema, String, pipe} from 'effect'

import {
	Outlet,
	createFileRoute,
	retainSearchParams,
	stripSearchParams,
	useLocation,
	useNavigate,
	useRouterState
} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {Suspense, startTransition, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeSidebarAtom, worktreeRouteId} from '#lib/state.ts'
import {UsageStrip, UsageStripFallback} from '#routes/components/-usage-strip.tsx'
import type {
	AgentProfile,
	AgentSession,
	HomeSidebar,
	ScriptRun,
	SidebarProject,
	SidebarWorktree
} from '#rpcs/contracts.ts'
import {Loading} from '@deslop/components/fallbacks'
import {
	AgentIcon,
	BotIcon,
	Braces,
	ExternalLinkIcon,
	GitBranch,
	GitBranchPlus,
	GlobeIcon,
	Layers,
	ListTree,
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
import {
	GitBranchesSnapshot,
	GitWorktreeLocalSource,
	GitWorktreeNewSource,
	GitWorktreeRemoteSource
} from '@deslop/git/schema'
import type {PortlessRun} from '@deslop/portless/schema'
import {terminalStatusActive} from '@deslop/terminal/schema'

export const Route = createFileRoute('/(home)')({
	component: HomeLayout,
	search: {
		middlewares: [retainSearchParams(['filterActiveWorktrees']), stripSearchParams({filterActiveWorktrees: false})]
	},
	validateSearch: Schema.toStandardSchemaV1(
		Schema.Struct({filterActiveWorktrees: pipe(Schema.Boolean, Schema.withDecodingDefaultKey(Effect.succeed(false)))})
	)
})

const branchesAtom = Atom.family((cwd: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			Effect.flatMap(RpcClient, client =>
				String.isNonEmpty(cwd)
					? client('projects.branches', {cwd})
					: Effect.succeed(GitBranchesSnapshot.make({branches: [], defaultBranch: 'main'}))
			),
			{initialValue: GitBranchesSnapshot.make({branches: [], defaultBranch: 'main'})}
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
				Match.when(String.endsWith('/agent-browser'), () => 'agent-browser' as const),
				Match.when(String.endsWith('/run'), () => 'run' as const),
				Match.when(String.endsWith('/agent'), () => 'agent' as const),
				Match.orElse(() => 'diff' as const)
			),
			activeWorktreeId: String.split('/')(state.location.pathname)[1] ?? ''
		})
	})
	const activeHome = useAtomSuspense(activeSidebarAtom(homeRouteState.activeWorktreeId))

	return (
		<div className="bg-background h-full min-h-0 flex-1 overflow-hidden">
			<ResizablePanelGroup orientation="horizontal" className="h-full min-h-0 overflow-hidden">
				<ResizablePanel defaultSize="26%" minSize="20%" maxSize="38%">
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
						selectPortless={worktreeRoot => {
							startTransition(() => {
								void navigate({params: {worktree: worktreeRouteId(worktreeRoot)}, to: '/$worktree/agent-browser'})
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

function UsageStripBoundary() {
	return (
		<Suspense fallback={<UsageStripFallback />}>
			<UsageStrip />
		</Suspense>
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

function WorktreeIcon(input: {dirty: boolean; root: boolean}) {
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

function sortScriptRuns(runs: SidebarWorktree['scriptRuns']) {
	return Array.sortWith(runs, run => run.taskId, Order.String)
}

function sortPortlessRuns(runs: SidebarWorktree['portlessRuns']) {
	return Array.sortWith(runs, run => run.script.taskId, Order.String)
}

function nativeBrowserUrl(origin: string) {
	try {
		const url = new URL(origin)
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
	} catch {}
	return null
}

function WorktreeScripts(input: {
	cwd: string
	runStatuses: Record<string, AgentSession['state']>
	scripts: SidebarWorktree['scriptRuns']
	selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
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
					{Array.map(sortedRuns, run => (
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
	cwd: string
	run: ScriptRun
	status: AgentSession['state']
	selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const session = scriptSession(input.cwd, input.run)
	const restart = useAtomSet(RpcClient.mutation('terminal.restart'), {mode: 'promise'})
	const stop = useAtomSet(RpcClient.mutation('terminal.stop'), {mode: 'promise'})
	const actionState = useState(false)

	async function toggleRun() {
		if (actionState[0]) return

		actionState[1](true)
		try {
			await (terminalStatusActive(input.status.state) && input.status.state !== 'idle'
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
								terminalStatusActive(input.status.state) && input.status.state !== 'idle'
									? `Stop ${input.run.taskId}`
									: `Start ${input.run.taskId}`
							}
						>
							{pipe(
								Match.value({
									active: terminalStatusActive(input.status.state) && input.status.state !== 'idle',
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
	cwd: string
	runStatuses: Record<string, AgentSession['state']>
	runs: SidebarWorktree['portlessRuns']
	selectPortless: (worktreeRoot: string) => void
	selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
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
	cwd: string
	runStatuses: Record<string, AgentSession['state']>
	runs: SidebarWorktree['portlessRuns']
	selectPortless: (worktreeRoot: string) => void
	selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const restart = useAtomSet(RpcClient.mutation('terminal.restart'), {mode: 'promise'})
	const stop = useAtomSet(RpcClient.mutation('terminal.stop'), {mode: 'promise'})
	const actionState = useState(false)

	async function toggleRuns() {
		if (actionState[0]) return

		actionState[1](true)
		try {
			const active = Array.some(
				input.runs,
				candidate =>
					terminalStatusActive(input.runStatuses[candidate.script.sessionId]?.state ?? 'idle') &&
					input.runStatuses[candidate.script.sessionId]?.state !== 'idle'
			)
			for (const run of input.runs) {
				const session = portlessSession(run)
				if (active) await stop({payload: session})
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
						title={
							Array.some(
								input.runs,
								run =>
									terminalStatusActive(input.runStatuses[run.script.sessionId]?.state ?? 'idle') &&
									input.runStatuses[run.script.sessionId]?.state !== 'idle'
							)
								? 'Stop agent-browser'
								: 'Start agent-browser'
						}
					>
						{pipe(
							Match.value({
								active: Array.some(
									input.runs,
									run =>
										terminalStatusActive(input.runStatuses[run.script.sessionId]?.state ?? 'idle') &&
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
					input.selectPortless(input.cwd)
				}}
			>
				agent-browser
			</TreeExplorerRow>
			<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
				{Array.map(input.runs, run => (
					<Suspense key={run.script.sessionId} fallback={<Loading />}>
						<PortlessRunRow
							run={run}
							status={input.runStatuses[run.script.sessionId] ?? {state: 'idle', title: ''}}
							selectRun={input.selectRun}
						/>
					</Suspense>
				))}
			</ul>
		</li>
	)
}

function PortlessRunRow(input: {
	run: PortlessRun
	status: AgentSession['state']
	selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const browserUrl = nativeBrowserUrl(input.run.origin.origin)

	return (
		<li className="w-full min-w-0">
			<TreeExplorerRow
				actions={
					<span className="flex h-full items-center justify-end">
						<Button
							render={
								<a
									href={
										Predicate.isNull(browserUrl) ||
										!(terminalStatusActive(input.status.state) && input.status.state !== 'idle')
											? undefined
											: browserUrl
									}
									target="_blank"
									rel="noopener noreferrer"
									onClick={event => {
										event.stopPropagation()
										if (
											Predicate.isNull(browserUrl) ||
											!(terminalStatusActive(input.status.state) && input.status.state !== 'idle')
										) {
											event.preventDefault()
										}
									}}
								/>
							}
							variant="ghost"
							size="icon-xs"
							className="text-muted-foreground hover:text-foreground"
							disabled={
								Predicate.isNull(browserUrl) ||
								!(terminalStatusActive(input.status.state) && input.status.state !== 'idle')
							}
							title={`Open ${input.run.script.taskId} in browser`}
						>
							<ExternalLinkIcon className="size-3" />
						</Button>
					</span>
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

function AgentSessionRow(input: {onSelect: () => void; onStop: () => void; session: AgentSession; stopping: boolean}) {
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
						title={`${terminalStatusActive(input.session.state.state) && input.session.state.state !== 'idle' ? 'Stop' : 'Remove'} ${input.session.label}`}
					>
						{pipe(
							Match.value({
								active: terminalStatusActive(input.session.state.state) && input.session.state.state !== 'idle',
								stopping: input.stopping
							}),
							Match.when({stopping: true}, () => <Spinner className="size-2.5 border opacity-60" />),
							Match.when({active: true}, () => <Square className="size-3" />),
							Match.orElse(() => <Trash className="size-3" />)
						)}
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
	cwd: string
	profiles: HomeSidebar['agentProfiles']
	sessions: SidebarWorktree['agents']
	selectAgent: (cwd: string, agentId: string) => void
}) {
	const create = useAtomSet(RpcClient.mutation('agents.create'), {mode: 'promise'})
	const remove = useAtomSet(RpcClient.mutation('agents.remove'), {mode: 'promise'})
	const startingProfilesState = useState(() => HashSet.empty<string>())
	const stoppingSessionsState = useState(() => HashSet.empty<string>())

	async function startAgent(profile: AgentProfile) {
		if (HashSet.has(startingProfilesState[0], profile.id)) return

		startingProfilesState[1](current => HashSet.add(current, profile.id))
		try {
			const session = await create({payload: {cwd: input.cwd, provider: profile.id}})
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

function worktreeHasAgent(worktree: SidebarWorktree) {
	return worktree.agents.length > 0
}

function WorktreeManager(input: {
	activeProject?: SidebarProject
	activeWorktree?: SidebarWorktree
	activeView: 'agent' | 'agent-browser' | 'diff' | 'terminal' | 'portless' | 'run'
	agentProfiles: HomeSidebar['agentProfiles']
	projects: HomeSidebar['projects']
	selectWorktree: (worktreeRoot: string) => void
	selectTerminal: (worktreeRoot: string) => void
	selectPortless: (worktreeRoot: string) => void
	selectAgent: (worktreeRoot: string, agentId: string) => void
	selectRun: (worktreeRoot: string, sessionId: string, inactive?: boolean) => void
}) {
	const maintenanceProject = useAtomSet(RpcClient.mutation('projects.maintenance'), {mode: 'promise'})
	const createWorktree = useAtomSet(RpcClient.mutation('projects.createWorktree'), {mode: 'promise'})
	const deleteWorktree = useAtomSet(RpcClient.mutation('projects.deleteWorktree'), {mode: 'promise'})
	const navigate = useNavigate()
	const search = Route.useSearch()
	const pathname = useLocation({select: location => location.pathname})
	const [state, setState] = useState(() => ({
		actionsOpen: false,
		branch: '',
		createWorktreeProjectRoot: input.activeProject?.repository.root,
		creatingBranch: '',
		deleteDialogOpen: false,
		deletingWorktree: false,
		maintainingProject: ''
	}))
	const createWorktreeProject =
		pipe(
			input.projects,
			Array.findFirst(project => project.repository.root === state.createWorktreeProjectRoot),
			Option.getOrUndefined
		) ?? input.activeProject
	const branchSnapshot = useAtomSuspense(
		branchesAtom(state.actionsOpen ? (createWorktreeProject?.repository.root ?? '') : '')
	)
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
	const newBranch = String.trim(state.branch)
	const branchAvailable = pipe(
		availableBranches,
		Array.some(candidate => candidate.name === newBranch)
	)
	async function createFastWorktree(candidate?: (typeof availableBranches)[number]) {
		const nextBranch = candidate?.name ?? newBranch
		if (String.isEmpty(nextBranch) || String.isNonEmpty(state.creatingBranch)) return
		if (Predicate.isUndefined(candidate) && !validNewWorktreeBranch(nextBranch)) {
			toast.error('Branch names cannot contain spaces.')
			return
		}

		const source = Predicate.isUndefined(candidate)
			? GitWorktreeNewSource.make({})
			: pipe(
					Match.value(candidate),
					Match.when({type: 'local'}, () => GitWorktreeLocalSource.make({})),
					Match.orElse(remoteBranch => GitWorktreeRemoteSource.make({remote: remoteBranch.remote ?? 'origin'}))
				)

		setState(current => ({...current, creatingBranch: nextBranch}))
		try {
			const worktreeRoot = await createWorktree({
				payload: {
					branch: nextBranch,
					cwd: (createWorktreeProject ?? input.activeProject)?.repository.root ?? '',
					source
				}
			})
			setState(current => ({...current, actionsOpen: false, branch: ''}))
			input.selectWorktree(worktreeRoot)
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			setState(current => ({...current, creatingBranch: ''}))
		}
	}
	async function deleteActiveWorktree() {
		if (!input.activeWorktree || state.deletingWorktree) return

		setState(current => ({...current, deletingWorktree: true}))
		try {
			await deleteWorktree({payload: {cwd: input.activeWorktree.root}})
			setState(current => ({...current, deleteDialogOpen: false}))
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			setState(current => ({...current, deletingWorktree: false}))
		}
	}
	async function maintainRepository(cwd: string) {
		setState(current => ({...current, maintainingProject: cwd}))
		try {
			await maintenanceProject({payload: {cwd}})
		} catch (error) {
			toast.error(formatError(error))
		} finally {
			setState(current => ({...current, maintainingProject: ''}))
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
				<span className="flex items-center">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-pressed={search.filterActiveWorktrees}
						aria-label={search.filterActiveWorktrees ? 'Showing agent worktrees' : 'Showing all worktrees'}
						className={search.filterActiveWorktrees ? 'bg-muted text-foreground h-8 w-8' : 'h-8 w-8'}
						onClick={() => {
							startTransition(() => {
								void navigate({
									replace: true,
									search: current => ({...current, filterActiveWorktrees: !search.filterActiveWorktrees}),
									to: pathname
								})
							})
						}}
						title={search.filterActiveWorktrees ? 'Show all worktrees' : 'Show agent worktrees'}
					>
						{search.filterActiveWorktrees ? <BotIcon className="size-3" /> : <ListTree className="size-3" />}
					</Button>
					{input.activeWorktree && input.activeWorktree.root !== input.activeProject?.repository.root && (
						<Button
							type="button"
							variant="destructive"
							size="icon"
							className="h-8 w-8"
							disabled={state.deletingWorktree}
							onClick={() => {
								setState(current => ({...current, deleteDialogOpen: true}))
							}}
							title="Delete worktree"
						>
							{state.deletingWorktree ? (
								<Spinner className="size-2.5 border opacity-60" />
							) : (
								<Trash className="size-3" />
							)}
						</Button>
					)}
				</span>
			</div>

			<Dialog
				open={state.deleteDialogOpen}
				onOpenChange={deleteDialogOpen => {
					setState(current => ({...current, deleteDialogOpen}))
				}}
			>
				<DialogContent showCloseButton={!state.deletingWorktree}>
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
							disabled={state.deletingWorktree}
							onClick={() => {
								setState(current => ({...current, deleteDialogOpen: false}))
							}}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={!input.activeWorktree || state.deletingWorktree}
							onClick={() => {
								void deleteActiveWorktree()
								setState(current => ({...current, actionsOpen: false}))
							}}
						>
							{state.deletingWorktree ? (
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
				open={state.actionsOpen}
				onOpenChange={actionsOpen => {
					setState(current => ({...current, actionsOpen}))
				}}
				title="Create worktree"
				description="Create or open a worktree branch."
				className="sm:max-w-2xl"
			>
				<Command
					onKeyDown={event => {
						event.stopPropagation()
						if (event.key === 'Escape') setState(current => ({...current, actionsOpen: false}))
					}}
				>
					<CommandInput
						placeholder={`Find or create branch in ${createWorktreeProject ? pathLabel(createWorktreeProject.repository.root) : 'workspace'}...`}
						value={state.branch}
						onValueChange={branch => {
							setState(current => ({...current, branch}))
						}}
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
										disabled={String.isNonEmpty(state.creatingBranch)}
										onSelect={() => {
											void createFastWorktree()
										}}
									>
										{state.creatingBranch === newBranch ? (
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
										state.creatingBranch === candidate.name ? (
											<Spinner className="size-2.5 border opacity-60" />
										) : (
											pipe(
												Match.value(candidate.type),
												Match.when('local', () => <GitBranch />),
												Match.orElse(() => <GlobeIcon />)
											)
										)

									return (
										<CommandItem
											key={`${candidate.type}:${candidate.remote ?? ''}:${candidate.name}`}
											value={candidate.name}
											onSelect={() => {
												setState(current => ({...current, branch: candidate.name}))
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
						const worktrees = search.filterActiveWorktrees
							? pipe(project.worktrees, Array.filter(worktreeHasAgent))
							: project.worktrees

						if (worktrees.length === 0) return null

						const projectWorktree =
							Option.getOrUndefined(
								Array.findFirst(worktrees, candidate => candidate.root === project.repository.root)
							) ?? worktrees[0]

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
											disabled={state.maintainingProject === project.repository.root}
											onClick={event => {
												event.stopPropagation()
												void maintainRepository(project.repository.root)
											}}
											title="Repository maintenance"
										>
											{state.maintainingProject === project.repository.root ? (
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
												setState(current => ({
													...current,
													actionsOpen: true,
													branch: '',
													createWorktreeProjectRoot: project.repository.root
												}))
											}}
											title="Create worktree"
										>
											<GitBranchPlus className="size-3" />
										</Button>
									</span>
								</div>
								<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
									{Array.map(worktrees, worktree => (
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

			<UsageStripBoundary />
		</div>
	)
}
