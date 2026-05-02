import {useAtomRefresh, useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, Option, Predicate, pipe, Schema, Stream, String} from 'effect'

import type {AgentId, ModelId, ProviderId} from '@ai-toolkit/ai/catalog'
import {models} from '@ai-toolkit/ai/catalog'
import {
	AgentIcon,
	Archive,
	ArrowUpIcon,
	Brain,
	ChevronRight,
	FileIcon,
	GitBranch,
	Layers,
	PanelTop,
	Plus,
	SparklesIcon,
	Square,
	Trash,
	UserIcon,
	Wrench
} from '@ai-toolkit/components/icons'
import {PatchReview} from '@ai-toolkit/components/render/diff'
import {Markdown} from '@ai-toolkit/components/render/markdown'
import {RichTextArea} from '@ai-toolkit/components/rich-text-area'
import {
	TreeExplorer,
	TreeExplorerGroup,
	TreeExplorerRow,
	TreeExplorerSection
} from '@ai-toolkit/components/tree-explorer'
import {Button} from '@ai-toolkit/components/ui/button'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@ai-toolkit/components/ui/collapsible'
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
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@ai-toolkit/components/ui/dialog'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@ai-toolkit/components/ui/select'
import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute, Outlet, useRouterState} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition, useEffect, useRef, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import type {AgentEntry, AgentEvent, AgentStreamPart, ProjectEntry} from '#rpcs/contracts.ts'
import {BranchesSnapshot, ProjectsSnapshot, ReviewSnapshot} from '#rpcs/contracts.ts'

const HomeSearchSchema = Schema.Struct({
	projectRoot: Schema.optional(Schema.String),
	worktreeRoot: Schema.optional(Schema.String),
	agentId: Schema.optional(Schema.String),
	agentModel: Schema.optional(Schema.String),
	reviewFile: Schema.optional(Schema.String),
	reviewScope: Schema.optional(Schema.String)
})

export const Route = createFileRoute('/(home)')({
	validateSearch: Schema.toStandardSchemaV1(HomeSearchSchema),
	component: HomeLayout
})

type HomeSearch = typeof HomeSearchSchema.Type

const projectAccentClassNames = [
	'[&_svg]:text-[oklch(0.74_0.085_50)] [&_.tree-label]:text-[oklch(0.8_0.085_50)]',
	'[&_svg]:text-[oklch(0.72_0.075_150)] [&_.tree-label]:text-[oklch(0.78_0.075_150)]',
	'[&_svg]:text-[oklch(0.72_0.075_220)] [&_.tree-label]:text-[oklch(0.78_0.075_220)]',
	'[&_svg]:text-[oklch(0.72_0.075_285)] [&_.tree-label]:text-[oklch(0.78_0.075_285)]',
	'[&_svg]:text-[oklch(0.72_0.075_20)] [&_.tree-label]:text-[oklch(0.78_0.075_20)]',
	'[&_svg]:text-[oklch(0.74_0.065_95)] [&_.tree-label]:text-[oklch(0.8_0.065_95)]'
] as const

type ReviewScope = 'staged-to-worktree' | 'head-to-staged'
type Worktree = ProjectEntry['worktrees'][number]
type AgentRun = {prompt: string; runId: string; parts: readonly AgentEvent[]}
type AgentInputValue = {label: string}
type ActionPaletteMode = 'actions' | 'create-thread' | 'create-worktree'
type SavedPrompt = {
	id: string
	model: ModelId
	provider: ProviderId
	snapshot: RichTextArea.Snapshot<AgentInputValue>
	text: string
}
const agentLayers = ['effect', 'opencode', 'codex'] as const satisfies readonly AgentId[]
const agentInputStates = new Map<string, RichTextArea.Snapshot<AgentInputValue>>()
const agentStashedPrompts = new Map<string, readonly SavedPrompt[]>()

const projectsAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('projects.watch', void 0)),
			Stream.unwrap
		),
		{initialValue: new ProjectsSnapshot({fetchFailed: false, projects: [], scanRoot: ''})}
	)
)

export const agentsAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('agents.watch', void 0)),
			Stream.unwrap
		),
		{initialValue: Array.empty<AgentEntry>()}
	)
)

function HomeLayout() {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const pathname = useRouterState({select: state => state.location.pathname})
	const {activeProject, activeWorktree, projects} = useHomeSelection(search)
	const agents = useAtomSuspense(agentsAtom).value

	useEffect(() => {
		if (!(activeProject && activeWorktree)) return
		if (search.projectRoot === activeProject.repository.root && search.worktreeRoot === activeWorktree.root) return

		startTransition(() => {
			navigate({
				replace: true,
				to: '/diff',
				search: {
					...search,
					projectRoot: activeProject.repository.root,
					reviewFile: undefined,
					worktreeRoot: activeWorktree.root
				}
			})
		})
	}, [activeProject, activeWorktree, navigate, search])

	return (
		<div className="min-h-0 flex-1 overflow-hidden bg-background font-mono">
			<ResizablePanelGroup orientation="horizontal">
				<ResizablePanel defaultSize="22%" minSize="16%" maxSize="34%">
					<WorktreeManager
						agents={agents}
						activeProject={activeProject}
						activeWorktree={activeWorktree}
						activeAgentId={pathname === '/agent' ? search.agentId : undefined}
						projects={projects}
						selectWorktree={(projectRoot, worktreeRoot) =>
							startTransition(() => {
								navigate({
									to: '/diff',
									search: {...search, projectRoot, reviewFile: undefined, worktreeRoot}
								})
							})
						}
						selectAgent={(projectRoot, worktreeRoot, agentId) =>
							startTransition(() => {
								navigate({
									to: '/agent',
									search: {...search, agentId, projectRoot, reviewFile: undefined, worktreeRoot}
								})
							})
						}
					/>
				</ResizablePanel>

				<ResizableHandle />

				<ResizablePanel defaultSize="86%" minSize="60%">
					<Outlet />
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	)
}

const filesAtom = Atom.family((cwd: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient.asEffect(),
				Effect.flatMap(client => client('files.search', {cwd}))
			),
			{initialValue: Array.empty<string>()}
		)
	)
)

const agentEventsAtom = Atom.family((agentId: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient.asEffect(),
				Effect.map(client => client('agent.events', {agentId})),
				Stream.unwrap,
				Stream.scan(Array.empty<AgentEvent>(), (events, event) => [...events, event])
			),
			{initialValue: Array.empty<AgentEvent>()}
		)
	)
)

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

function agentCommandValue(agentId: string) {
	return `agent:${agentId}`
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

function commandBarHasFocus() {
	return Predicate.isNotNull(document.activeElement?.closest('[data-slot="command"]'))
}

export function useHomeSelection(search: HomeSearch) {
	const snapshot = useAtomSuspense(projectsAtom).value
	const activeProject =
		pipe(
			snapshot.projects,
			Array.findFirst(project => project['repository']['root'] === search.projectRoot),
			Option.getOrUndefined
		) ?? snapshot.projects[0]
	const activeWorktree =
		pipe(
			activeProject?.['worktrees'] ?? [],
			Array.findFirst(worktree => worktree['root'] === search.worktreeRoot),
			Option.getOrUndefined
		) ??
		pipe(
			activeProject?.['worktrees'] ?? [],
			Array.findFirst(worktree => worktree['root'] === activeProject?.['repository']['root']),
			Option.getOrUndefined
		) ??
		activeProject?.['worktrees'][0]

	return {activeProject, activeWorktree, projects: snapshot.projects, snapshot}
}

export function ReviewViewPanel(input: {
	activeReviewScope: ReviewScope
	activeWorktree: Worktree
	reviewFile: string | undefined
	selectReviewEntry: (scope: ReviewScope, filePath: string) => void
}) {
	const changesAtom = Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient.asEffect(),
				Effect.map(client => client('review.watch', {cwd: input.activeWorktree['root'], scope: 'staged-to-worktree'})),
				Stream.unwrap
			),
			{
				initialValue: new ReviewSnapshot({cwd: input.activeWorktree['root'], scope: 'staged-to-worktree', diffs: []})
			}
		)
	)
	const stagedAtom = Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient.asEffect(),
				Effect.map(client => client('review.watch', {cwd: input.activeWorktree['root'], scope: 'head-to-staged'})),
				Stream.unwrap
			),
			{initialValue: new ReviewSnapshot({cwd: input.activeWorktree['root'], scope: 'head-to-staged', diffs: []})}
		)
	)
	const refreshChanges = useAtomRefresh(changesAtom)
	const refreshStaged = useAtomRefresh(stagedAtom)
	const stageFile = useAtomSet(RpcClient.mutation('review.stageFile'), {mode: 'promise'})
	const unstageFile = useAtomSet(RpcClient.mutation('review.unstageFile'), {mode: 'promise'})
	const discardFile = useAtomSet(RpcClient.mutation('review.discardFile'), {mode: 'promise'})
	const [shortcutsOpen, setShortcutsOpen] = useState(false)
	const changesDiffs = useAtomSuspense(changesAtom).value.diffs
	const stagedDiffs = useAtomSuspense(stagedAtom).value.diffs
	const entries = pipe(
		changesDiffs,
		Array.map(diff => ({diff, scope: 'staged-to-worktree' as const})),
		Array.appendAll(
			pipe(
				stagedDiffs,
				Array.map(diff => ({diff, scope: 'head-to-staged' as const}))
			)
		)
	)
	const selectedEntry =
		pipe(
			entries,
			Array.findFirst(entry => entry.scope === input.activeReviewScope && entry.diff.filePath === input.reviewFile),
			Option.getOrUndefined
		) ?? entries[0]

	function moveSelection(offset: number) {
		if (commandBarHasFocus()) return

		const nextIndex = Math.max(
			0,
			Math.min(
				pipe(
					entries,
					Array.findFirstIndex(
						entry => entry.scope === selectedEntry?.scope && entry.diff.filePath === selectedEntry?.diff.filePath
					),
					Option.getOrElse(() => 0)
				) + offset,
				entries.length - 1
			)
		)
		const nextEntry = entries[nextIndex] ?? selectedEntry ?? entries[0]

		if (Predicate.isUndefined(nextEntry)) {
			return
		}

		input.selectReviewEntry(nextEntry.scope, nextEntry.diff.filePath)
	}

	async function toggleStageSelectedFile() {
		if (commandBarHasFocus()) return

		if (Predicate.isUndefined(selectedEntry)) {
			return
		}

		if (selectedEntry.scope === 'head-to-staged') {
			await unstageFile({payload: {cwd: input.activeWorktree['root'], filePath: selectedEntry.diff.filePath}})
			input.selectReviewEntry('staged-to-worktree', selectedEntry.diff.filePath)
			refreshChanges()
			refreshStaged()
			return
		}

		await stageFile({payload: {cwd: input.activeWorktree['root'], filePath: selectedEntry.diff.filePath}})
		input.selectReviewEntry('head-to-staged', selectedEntry.diff.filePath)

		refreshChanges()
		refreshStaged()
	}

	async function discardSelectedFile() {
		if (commandBarHasFocus()) return

		if (Predicate.isUndefined(selectedEntry)) {
			return
		}

		if (selectedEntry.scope === 'head-to-staged') {
			await unstageFile({payload: {cwd: input.activeWorktree['root'], filePath: selectedEntry.diff.filePath}})
		}

		await discardFile({payload: {cwd: input.activeWorktree['root'], filePath: selectedEntry.diff.filePath}})
		refreshChanges()
		refreshStaged()
	}

	useHotkey('ArrowDown', () => moveSelection(1), {enabled: !Array.isReadonlyArrayEmpty(entries)})
	useHotkey('ArrowUp', () => moveSelection(-1), {enabled: !Array.isReadonlyArrayEmpty(entries)})
	useHotkey('Enter', toggleStageSelectedFile, {enabled: Predicate.isNotUndefined(selectedEntry)})
	useHotkey({key: 'D', shift: true}, discardSelectedFile, {
		enabled: Predicate.isNotUndefined(selectedEntry),
		preventDefault: true
	})
	useHotkey({key: '?', shift: true}, () => setShortcutsOpen(true))

	return (
		<>
			<Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Shortcuts</DialogTitle>
					</DialogHeader>
					<div className="grid gap-2 text-xs">
						<div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
							<kbd className="border px-1.5 py-0.5 text-center">?</kbd>
							<span>Show shortcuts</span>
						</div>
						<div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
							<kbd className="border px-1.5 py-0.5 text-center">↑ / ↓</kbd>
							<span>Move file selection</span>
						</div>
						<div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
							<kbd className="border px-1.5 py-0.5 text-center">Enter</kbd>
							<span>Stage or unstage selected file</span>
						</div>
						<div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
							<kbd className="border px-1.5 py-0.5 text-center">Shift+D</kbd>
							<span>Discard selected file</span>
						</div>
					</div>
				</DialogContent>
			</Dialog>
			<ResizablePanelGroup orientation="horizontal">
				<ResizablePanel defaultSize="24%" minSize="18%" maxSize="36%">
					<div className="flex h-full flex-col border-r">
						<ResizablePanelGroup orientation="vertical">
							<ResizablePanel defaultSize="50%" minSize="20%">
								<TreeExplorer className="h-full overflow-y-auto px-0 py-1">
									<TreeExplorerSection label="Unstaged changes" className="min-h-0 flex-1 [&>ul]:min-h-0 [&>ul]:flex-1">
										{Array.isReadonlyArrayEmpty(changesDiffs) ? (
											<li className="flex flex-1 items-center justify-center px-2 py-2 text-muted-foreground text-xs">
												No changes.
											</li>
										) : (
											Array.map(changesDiffs, diff => {
												let statusClassName = 'text-amber-600 dark:text-amber-400'
												let statusLabel = 'M'

												if (diff.status === 'added') {
													statusClassName = 'text-emerald-600 dark:text-emerald-400'
													statusLabel = 'A'
												}

												if (diff.status === 'deleted') {
													statusClassName = 'text-red-600 dark:text-red-400'
													statusLabel = 'D'
												}

												if (diff.status === 'renamed') {
													statusClassName = 'text-sky-600 dark:text-sky-400'
													statusLabel = 'R'
												}

												return (
													<li key={diff.filePath} className="w-full min-w-0">
														<button
															type="button"
															aria-current={
																input.activeReviewScope === 'staged-to-worktree' &&
																selectedEntry?.diff.filePath === diff.filePath
																	? 'page'
																	: undefined
															}
															onClick={() => input.selectReviewEntry('staged-to-worktree', diff.filePath)}
															className={`grid h-6 w-full grid-cols-[18px_14px_minmax(0,1fr)] items-center gap-1.5 px-2 text-left text-muted-foreground text-xs hover:bg-muted hover:text-foreground ${input.activeReviewScope === 'staged-to-worktree' && selectedEntry?.diff.filePath === diff.filePath ? 'bg-primary/15 text-primary' : ''}`}
														>
															<span className={`text-center font-semibold text-[10px] ${statusClassName}`}>
																{statusLabel}
															</span>
															<FileIcon filePath={diff.filePath} className="size-3" />
															<span className="min-w-0 truncate">{diff.filePath}</span>
														</button>
													</li>
												)
											})
										)}
									</TreeExplorerSection>
								</TreeExplorer>
							</ResizablePanel>

							<ResizableHandle />

							<ResizablePanel defaultSize="50%" minSize="20%">
								<TreeExplorer className="h-full overflow-y-auto px-0 py-1">
									<TreeExplorerSection label="Staged changes" className="min-h-0 flex-1 [&>ul]:min-h-0 [&>ul]:flex-1">
										{Array.isReadonlyArrayEmpty(stagedDiffs) ? (
											<li className="flex flex-1 items-center justify-center px-2 py-2 text-muted-foreground text-xs">
												No staged changes.
											</li>
										) : (
											Array.map(stagedDiffs, diff => {
												let statusClassName = 'text-amber-600 dark:text-amber-400'
												let statusLabel = 'M'

												if (diff.status === 'added') {
													statusClassName = 'text-emerald-600 dark:text-emerald-400'
													statusLabel = 'A'
												}

												if (diff.status === 'deleted') {
													statusClassName = 'text-red-600 dark:text-red-400'
													statusLabel = 'D'
												}

												if (diff.status === 'renamed') {
													statusClassName = 'text-sky-600 dark:text-sky-400'
													statusLabel = 'R'
												}

												return (
													<li key={diff.filePath} className="w-full min-w-0">
														<button
															type="button"
															aria-current={
																input.activeReviewScope === 'head-to-staged' &&
																selectedEntry?.diff.filePath === diff.filePath
																	? 'page'
																	: undefined
															}
															onClick={() => input.selectReviewEntry('head-to-staged', diff.filePath)}
															className={`grid h-6 w-full grid-cols-[18px_14px_minmax(0,1fr)] items-center gap-1.5 px-2 text-left text-muted-foreground text-xs hover:bg-muted hover:text-foreground ${input.activeReviewScope === 'head-to-staged' && selectedEntry?.diff.filePath === diff.filePath ? 'bg-primary/15 text-primary' : ''}`}
														>
															<span className={`text-center font-semibold text-[10px] ${statusClassName}`}>
																{statusLabel}
															</span>
															<FileIcon filePath={diff.filePath} className="size-3" />
															<span className="min-w-0 truncate">{diff.filePath}</span>
														</button>
													</li>
												)
											})
										)}
									</TreeExplorerSection>
								</TreeExplorer>
							</ResizablePanel>
						</ResizablePanelGroup>
					</div>
				</ResizablePanel>

				<ResizableHandle />

				<ResizablePanel defaultSize="76%" minSize="36%">
					<div className="flex h-full min-w-0 flex-col overflow-hidden">
						<div className="relative min-h-0 flex-1 overflow-hidden bg-background">
							{!selectedEntry && (
								<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
									No changed files.
								</div>
							)}
							{selectedEntry && (
								<div
									key={`${selectedEntry.scope}\n${selectedEntry.diff.filePath}`}
									className="h-full min-h-0"
									data-review-key={`${selectedEntry.scope}\n${selectedEntry.diff.filePath}`}
								>
									<PatchReview filePath={selectedEntry.diff.filePath} patch={selectedEntry.diff.patch} />
								</div>
							)}
						</div>
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
		</>
	)
}

function WorktreeManager(input: {
	agents: readonly AgentEntry[]
	activeProject: ProjectEntry | undefined
	activeWorktree: Worktree | undefined
	activeAgentId: string | undefined
	projects: readonly ProjectEntry[]
	selectWorktree: (projectRoot: string, worktreeRoot: string) => void
	selectAgent: (projectRoot: string, worktreeRoot: string, agentId: string) => void
}) {
	const refreshProjects = useAtomRefresh(projectsAtom)
	const createWorktree = useAtomSet(RpcClient.mutation('projects.createWorktree'), {mode: 'promise'})
	const createAgent = useAtomSet(RpcClient.mutation('agents.create'), {mode: 'promise'})
	const [branch, setBranch] = useState('')
	const [switcherValue, setSwitcherValue] = useState('')
	const [switcherOpen, setSwitcherOpen] = useState(false)
	const [actionsOpen, setActionsOpen] = useState(false)
	const [actionPaletteMode, setActionPaletteMode] = useState<ActionPaletteMode>('actions')
	const [modifierPressed, setModifierPressed] = useState(false)
	const switcherInputRef = useRef<HTMLInputElement>(null)
	const actionInputRef = useRef<HTMLInputElement>(null)
	const branchesAtom = Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient.asEffect(),
				Effect.flatMap(client =>
					input.activeProject
						? client('projects.branches', {cwd: input.activeProject.repository.root})
						: Effect.succeed(new BranchesSnapshot({branches: [], defaultBranch: 'main'}))
				)
			),
			{initialValue: new BranchesSnapshot({branches: [], defaultBranch: 'main'})}
		)
	)
	const branchSnapshot = useAtomSuspense(branchesAtom).value
	const availableBranches = pipe(
		branchSnapshot.branches,
		Array.filter(candidate => pipe(candidate.name, String.isNonEmpty)),
		Array.dedupeWith((left, right) => left.name === right.name),
		Array.filter(
			candidate =>
				!pipe(
					input.activeProject?.worktrees ?? [],
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
		function openCommandPalette(event: KeyboardEvent) {
			if (event.key === 'Control' || event.key === 'Meta') setModifierPressed(true)
			if (!(event.ctrlKey || event.metaKey)) return
			const projectIndex = pipe(
				'123456789',
				String.indexOf(event.key),
				Option.getOrElse(() => -1)
			)
			const project = input.projects[projectIndex]

			if (projectIndex >= 0 && projectIndex < 9 && project) {
				event.preventDefault()
				const worktree =
					pipe(
						project.worktrees,
						Array.findFirst(candidate => candidate.root === project.repository.root),
						Option.getOrUndefined
					) ?? project.worktrees[0]

				if (worktree) input.selectWorktree(project.repository.root, worktree.root)
				return
			}

			if (pipe(event.key, String.toLowerCase) === 'p' && event.shiftKey) {
				event.preventDefault()
				setActionPaletteMode('actions')
				setActionsOpen(open => !open)
				return
			}

			if (pipe(event.key, String.toLowerCase) === 'p') {
				event.preventDefault()
				setSwitcherOpen(open => !open)
			}
		}
		function hideProjectHints(event: KeyboardEvent) {
			if (event.key === 'Control' || event.key === 'Meta') setModifierPressed(false)
		}
		function hideProjectHintsOnBlur() {
			setModifierPressed(false)
		}

		window.addEventListener('keydown', openCommandPalette)
		window.addEventListener('keyup', hideProjectHints)
		window.addEventListener('blur', hideProjectHintsOnBlur)

		return () => {
			window.removeEventListener('keydown', openCommandPalette)
			window.removeEventListener('keyup', hideProjectHints)
			window.removeEventListener('blur', hideProjectHintsOnBlur)
		}
	}, [input.projects, input.selectWorktree])

	useEffect(() => {
		if (!switcherOpen) return
		setSwitcherValue('')

		window.requestAnimationFrame(() => switcherInputRef.current?.focus())
	}, [switcherOpen])

	useEffect(() => {
		if (!actionsOpen) return

		window.requestAnimationFrame(() => actionInputRef.current?.focus())
	}, [actionsOpen])

	async function createFastWorktree(nextBranch = branch) {
		if (!input.activeProject || nextBranch === '') return
		const nextSelectedBranch = pipe(
			availableBranches,
			Array.findFirst(candidate => candidate.name === nextBranch),
			Option.getOrUndefined
		)
		let mode: 'existing-local' | 'existing-remote' | 'new-local' = 'new-local'
		if (nextSelectedBranch?.type === 'local') mode = 'existing-local'
		if (nextSelectedBranch?.type === 'remote') mode = 'existing-remote'

		await createWorktree({
			payload: {
				baseBranch:
					nextSelectedBranch?.type === 'remote'
						? `${nextSelectedBranch.remote}/${nextSelectedBranch.name}`
						: `origin/${branchSnapshot.defaultBranch}`,
				branch: nextBranch,
				cwd: input.activeProject.repository.root,
				mode
			}
		})
		setActionPaletteMode('actions')
		setActionsOpen(false)
		setBranch('')
		refreshProjects()
	}

	async function createFastAgent(layer: AgentId) {
		if (!(input.activeProject && input.activeWorktree)) return

		const agent = await createAgent({
			payload: {
				layer,
				projectRoot: input.activeProject.repository.root,
				worktreeRoot: input.activeWorktree.root
			}
		})

		setActionPaletteMode('actions')
		setActionsOpen(false)
		input.selectAgent(input.activeProject.repository.root, input.activeWorktree.root, agent.agentId)
	}

	return (
		<div className="flex h-full flex-col border-r text-xs">
			<button
				type="button"
				className="flex h-8 min-w-0 items-center border-b px-2 text-left text-muted-foreground hover:text-foreground"
				onClick={() => {
					if (input.activeWorktree) void navigator.clipboard.writeText(input.activeWorktree.root)
				}}
			>
				<span className="min-w-0 truncate">
					{input.activeWorktree ? shortPath(input.activeWorktree.root) : 'No worktree selected'}
				</span>
			</button>

			<CommandDialog
				open={switcherOpen}
				onOpenChange={setSwitcherOpen}
				title="Go to thread"
				description="Switch threads in the current project."
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
					<CommandInput ref={switcherInputRef} placeholder="Go to thread..." />
					<CommandList>
						<CommandEmpty>No thread found.</CommandEmpty>
						{input.activeAgentId && (
							<CommandGroup heading="Current">
								{pipe(
									input.agents,
									Array.findFirst(agent => agent.agentId === input.activeAgentId),
									Option.match({
										onNone: () => null,
										onSome: agent => {
											const worktree = pipe(
												input.activeProject?.worktrees ?? [],
												Array.findFirst(candidate => candidate.root === agent.worktreeRoot),
												Option.getOrUndefined
											)
											const worktreeLabel = worktree?.branch ?? pathLabel(agent.worktreeRoot)

											return (
												<CommandItem
													value={agentCommandValue(agent.agentId)}
													keywords={[worktreeLabel, agent.layer, agent.agentId]}
													onSelect={() => {
														setSwitcherOpen(false)
														input.selectAgent(agent.projectRoot, agent.worktreeRoot, agent.agentId)
													}}
												>
													<AgentIcon layer={agent.layer} className="size-3.5" />
													<span className="min-w-0 truncate">{worktreeLabel}</span>
													<CommandShortcut className="max-w-64 truncate normal-case tracking-normal">
														{shortPath(agent.worktreeRoot)}
													</CommandShortcut>
												</CommandItem>
											)
										}
									})
								)}
							</CommandGroup>
						)}
						<CommandGroup heading={input.activeProject ? pathLabel(input.activeProject.repository.root) : 'Threads'}>
							{pipe(
								input.agents,
								Array.filter(
									agent =>
										agent.projectRoot === input.activeProject?.repository.root && agent.agentId !== input.activeAgentId
								),
								Array.map(agent => {
									const worktree = pipe(
										input.activeProject?.worktrees ?? [],
										Array.findFirst(candidate => candidate.root === agent.worktreeRoot),
										Option.getOrUndefined
									)
									const worktreeLabel = worktree?.branch ?? pathLabel(agent.worktreeRoot)

									return (
										<CommandItem
											key={agent.agentId}
											value={agentCommandValue(agent.agentId)}
											keywords={[worktreeLabel, agent.layer, agent.agentId]}
											onSelect={() => {
												setSwitcherOpen(false)
												input.selectAgent(agent.projectRoot, agent.worktreeRoot, agent.agentId)
											}}
										>
											<AgentIcon layer={agent.layer} className="size-3.5" />
											<span className="min-w-0 truncate">{worktreeLabel}</span>
											<CommandShortcut className="max-w-64 truncate normal-case tracking-normal">
												{shortPath(agent.worktreeRoot)}
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
					if (!open) setActionPaletteMode('actions')
				}}
				title="Run command"
				description="Create worktrees and threads."
				className="sm:max-w-2xl"
			>
				<Command
					onKeyDown={event => {
						event.stopPropagation()
						if (event.key === 'Escape') setActionsOpen(false)
					}}
				>
					<CommandInput
						ref={actionInputRef}
						placeholder={(() => {
							if (actionPaletteMode === 'create-worktree') return 'New branch/worktree name...'
							if (actionPaletteMode === 'create-thread') return 'Pick thread runtime...'
							return 'Run workspace command...'
						})()}
						value={actionPaletteMode === 'create-worktree' ? branch : undefined}
						onValueChange={value => {
							if (actionPaletteMode === 'create-worktree') setBranch(value)
						}}
						onKeyDown={event => {
							if (event.key === 'Escape' && actionPaletteMode !== 'actions') {
								event.preventDefault()
								setActionPaletteMode('actions')
								return
							}

							if (event.key === 'Enter' && actionPaletteMode === 'create-worktree' && branch !== '') {
								event.preventDefault()
								void createFastWorktree()
							}
						}}
					/>
					<CommandList>
						<CommandEmpty>No command found.</CommandEmpty>
						{actionPaletteMode === 'actions' && (
							<CommandGroup heading="Current context">
								<CommandItem
									value="create worktree new branch"
									disabled={Predicate.isUndefined(input.activeProject)}
									onSelect={() => {
										setBranch('')
										setActionPaletteMode('create-worktree')
									}}
								>
									<Plus className="size-3.5" />
									Create worktree
								</CommandItem>
								<CommandItem
									value="create thread"
									disabled={Predicate.isUndefined(input.activeProject) || Predicate.isUndefined(input.activeWorktree)}
									onSelect={() => setActionPaletteMode('create-thread')}
								>
									<SparklesIcon className="size-3.5" />
									Create thread
								</CommandItem>
							</CommandGroup>
						)}
						{actionPaletteMode === 'create-worktree' && (
							<CommandGroup
								heading={`Create in ${input.activeProject ? pathLabel(input.activeProject.repository.root) : 'project'}`}
							>
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
										<Plus className="size-3.5" />
										Create {branch}
										<CommandShortcut>origin/{branchSnapshot.defaultBranch}</CommandShortcut>
									</CommandItem>
								)}
							</CommandGroup>
						)}
						{actionPaletteMode === 'create-thread' && (
							<CommandGroup
								heading={`Create thread in ${input.activeWorktree ? (input.activeWorktree.branch ?? pathLabel(input.activeWorktree.root)) : 'worktree'}`}
							>
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
				<TreeExplorerSection label="Workspaces">
					{Array.map(input.projects, (project, index) => (
						<TreeExplorerGroup
							key={project.repository.gitDirectory}
							className="border-muted-foreground/20"
							contentClassName={projectAccentClassNames[index % projectAccentClassNames.length]}
							icon={<Layers className="size-3.5" />}
							label={
								<span className="tree-label flex min-w-0 items-center gap-1.5">
									{modifierPressed && index < 9 && <span className="border px-1 text-[10px]">{index + 1}</span>}
									<span className="min-w-0 truncate">{pathLabel(project.repository.root)}</span>
								</span>
							}
						>
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
												selected={
													input.activeWorktree?.root === worktree.root && Predicate.isUndefined(input.activeAgentId)
												}
												onClick={() => input.selectWorktree(project.repository.root, worktree.root)}
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
																selected={input.activeAgentId === agent.agentId}
																onClick={() => input.selectAgent(project.repository.root, worktree.root, agent.agentId)}
															>
																thread
															</TreeExplorerRow>
														</li>
													))}
												</ul>
											)}
										</li>
									)
								})
							)}
						</TreeExplorerGroup>
					))}
				</TreeExplorerSection>
			</TreeExplorer>
		</div>
	)
}

function AgentResponse(input: {parts: readonly AgentEvent[]}) {
	const effectiveParts = pipe(
		input.parts,
		Array.filter(event => event.type === 'agent-part'),
		Array.map(event => event.part),
		Array.reduce(Array.empty<AgentStreamPart>(), (parts, part) => {
			if (part.type === 'reasoning-start' || part.type === 'reasoning-end') return parts
			if (part.type === 'text-start' || part.type === 'text-end') return parts
			if (part.type === 'tool-params-start' || part.type === 'tool-params-end') return parts
			if (part.type === 'tool-params-delta') return parts
			if (!Array.isArrayNonEmpty(parts)) return Array.append(parts, part)
			const [previousParts, lastPart] = Array.unappend(parts)
			if (part.type === 'text-delta' && lastPart.type === 'text-delta') {
				return [...previousParts, {...lastPart, delta: `${lastPart.delta}${part.delta}`}]
			}
			if (part.type === 'reasoning-delta' && lastPart.type === 'reasoning-delta') {
				return [...previousParts, {...lastPart, delta: `${lastPart.delta}${part.delta}`}]
			}
			return Array.append(parts, part)
		})
	)
	const reasoningParts = pipe(
		effectiveParts,
		Array.filter(part => part.type === 'reasoning-delta')
	)
	const responseParts = pipe(
		effectiveParts,
		Array.filter(part => part.type !== 'reasoning-delta')
	)
	const metadata = pipe(
		effectiveParts,
		Array.findFirst(part => part.type === 'response-metadata'),
		Option.getOrUndefined
	)
	const finish = pipe(
		effectiveParts,
		Array.findFirst(part => part.type === 'finish'),
		Option.getOrUndefined
	)
	if (Array.isReadonlyArrayEmpty(effectiveParts)) return

	return (
		<div className="flex flex-col gap-3">
			{Array.map(reasoningParts, (part, index) => (
				<article key={index} className="flex gap-2">
					<div className="w-0.5 shrink-0 bg-muted-foreground/40" />
					<div className="min-w-0 flex-1 border border-muted-foreground/25 bg-muted/20 px-3 text-muted-foreground text-xs leading-5">
						<div className="flex items-center gap-1.5 border-border/60 border-b py-2 font-mono text-[11px] leading-none">
							<Brain className="size-3.5 shrink-0" />
							<span>reasoning</span>
							{finish?.type === 'finish' && (
								<span className="ml-auto">reasoning {finish.usage.outputTokens.reasoning}</span>
							)}
						</div>
						<div className="py-2">
							<Markdown>{part.delta}</Markdown>
						</div>
					</div>
				</article>
			))}
			<article className="flex gap-2">
				<div className="w-0.5 shrink-0 bg-blue-500/30" />
				<div className="min-w-0 flex-1 border-2 border-blue-500/12 bg-blue-500/[0.003] px-3">
					<div className="flex items-center gap-1.5 border-border/60 border-b py-2 font-mono text-[11px] text-muted-foreground leading-none">
						<SparklesIcon className="size-3 shrink-0" />
						<span className="min-w-0 truncate">
							{metadata?.type === 'response-metadata' ? metadata.modelId : 'thread'}
						</span>
						{finish?.type === 'finish' && (
							<span className="ml-auto flex shrink-0 items-center gap-3">
								<span>in {finish.usage.inputTokens.total}</span>
								<span>out {finish.usage.outputTokens.total}</span>
								<span>reasoning {finish.usage.outputTokens.reasoning}</span>
							</span>
						)}
					</div>
					<div className="flex flex-col gap-2 py-2 text-[13px] leading-relaxed">
						{Array.map(responseParts, (part, index) => {
							if (part.type === 'text-delta') return <Markdown key={index}>{part.delta}</Markdown>
							if (part.type === 'tool-call' || part.type === 'tool-result') {
								return (
									<Collapsible key={`${part.type}-${part.id}`} className="group border">
										<CollapsibleTrigger className="flex min-h-7 w-full items-center gap-2 px-2 py-0.5 text-left text-[11px] text-muted-foreground">
											<Wrench className="size-3.5 shrink-0" />
											<span className="text-foreground">{part.type}</span>
											<span>{part.name}</span>
											<ChevronRight className="ml-auto size-3 shrink-0 transition-transform duration-150 group-data-open:rotate-90" />
										</CollapsibleTrigger>
										<CollapsibleContent>
											<pre className="overflow-x-auto border-t p-2 text-[11px] leading-5">
												{JSON.stringify(part.type === 'tool-call' ? part.params : part.result, null, 2)}
											</pre>
										</CollapsibleContent>
									</Collapsible>
								)
							}
							if (part.type === 'response-metadata' || part.type === 'finish') return
							return (
								<pre key={index} className="overflow-x-auto border p-2 text-[11px] leading-5">
									{JSON.stringify(part, null, 2)}
								</pre>
							)
						})}
					</div>
				</div>
			</article>
		</div>
	)
}

export function AgentPanel(input: {
	agentId: string
	activeWorktree: Worktree
	layer: AgentId
	model: ModelId
	provider: ProviderId
	setModel: (model: string) => void
}) {
	const inputRef = useRef<RichTextArea.Handle<AgentInputValue>>(null)
	const files = useAtomSuspense(filesAtom(input.activeWorktree.root)).value
	const events = useAtomSuspense(agentEventsAtom(input.agentId)).value
	const [stashedPrompts, setStashedPrompts] = useState(
		agentStashedPrompts.get(input.agentId) ?? Array.empty<SavedPrompt>()
	)
	const runs = pipe(
		events,
		Array.reduce(Array.empty<AgentRun>(), (runs, event) => {
			if (event.type === 'user-message')
				return Array.append(runs, {parts: [], prompt: event.prompt, runId: event.runId})
			if (!Array.isArrayNonEmpty(runs)) return runs
			const [previousRuns, currentRun] = Array.unappend(runs)
			if (currentRun.runId !== event.runId) return runs
			return [...previousRuns, {...currentRun, parts: [...currentRun.parts, event]}]
		})
	)
	const promptAgent = useAtomSet(RpcClient.mutation('agent.prompt'), {mode: 'promise'})
	const stopAgent = useAtomSet(RpcClient.mutation('agent.stop'), {mode: 'promise'})
	function setAgentStash(prompts: readonly SavedPrompt[]) {
		agentStashedPrompts.set(input.agentId, prompts)
		setStashedPrompts(prompts)
	}

	function savePrompt(snapshot = inputRef.current?.getSnapshot()) {
		if (!snapshot || String.isEmpty(snapshot.text)) return

		return {id: crypto.randomUUID(), model: input.model, provider: input.provider, snapshot, text: snapshot.text}
	}

	function submitPrompt(snapshot = inputRef.current?.getSnapshot()) {
		const prompt = savePrompt(snapshot)
		if (!prompt) return

		void promptAgent({
			payload: {
				agentId: input.agentId,
				model: prompt.model,
				prompt: prompt.text,
				provider: prompt.provider,
				runId: crypto.randomUUID()
			}
		})
		inputRef.current?.clear()
	}

	function stashPrompt() {
		const prompt = savePrompt()
		if (!prompt) return

		setAgentStash([...stashedPrompts, prompt])
		inputRef.current?.clear()
	}

	function editStashedPrompt(prompt: SavedPrompt) {
		const currentPrompt = savePrompt()
		const nextPrompts = Array.filter(stashedPrompts, savedPrompt => savedPrompt.id !== prompt.id)

		setAgentStash(currentPrompt ? [...nextPrompts, currentPrompt] : nextPrompts)
		agentInputStates.set(input.agentId, prompt.snapshot)
		inputRef.current?.restore(prompt.snapshot)
		input.setModel(`${prompt.provider}:${prompt.model}`)
	}

	useEffect(() => {
		return () => {
			const snapshot = inputRef.current?.getSnapshot()
			if (snapshot && String.isNonEmpty(snapshot.text)) agentInputStates.set(input.agentId, snapshot)
		}
	}, [input.agentId])

	return (
		<div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				<div className="mx-auto flex max-w-4xl flex-col gap-3">
					{Array.isReadonlyArrayEmpty(runs) && (
						<div className="flex min-h-48 items-center justify-center text-muted-foreground text-sm">
							Send a message to start the thread.
						</div>
					)}
					{Array.map(runs, run => (
						<div key={run.runId} className="flex flex-col gap-3">
							<article className="flex gap-2">
								<div className="w-0.5 shrink-0 bg-orange-500/50" />
								<div className="min-w-0 flex-1 border-2 border-orange-500/20 bg-orange-500/[0.003] px-3">
									<div className="flex items-center gap-1.5 border-border/60 border-b py-2 font-mono text-[11px] text-muted-foreground leading-none">
										<UserIcon className="size-3 shrink-0 text-orange-500" />
										<span>prompt</span>
									</div>
									<div className="py-2 text-[13px] leading-relaxed">
										<Markdown>{run.prompt}</Markdown>
									</div>
								</div>
							</article>
							<AgentResponse parts={run.parts} />
						</div>
					))}
				</div>
			</div>
			<div className="border-t p-3">
				<div className="relative mx-auto max-w-4xl">
					{!Array.isReadonlyArrayEmpty(stashedPrompts) && (
						<RichTextArea.Actions>
							<div className="flex items-center gap-2 border-input border-b px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
								<Archive className="size-3.5" />
								<span>{stashedPrompts.length} stashed</span>
							</div>
							<div className="flex max-h-48 flex-col overflow-y-auto">
								{Array.map(stashedPrompts, prompt => (
									<div
										key={prompt.id}
										className="flex min-w-0 items-center gap-2 border-input border-b px-2 py-1.5 last:border-b-0 hover:bg-muted/70"
									>
										<button
											type="button"
											className="min-w-0 flex-1 text-left"
											onMouseDown={event => event.preventDefault()}
											onClick={() => editStashedPrompt(prompt)}
										>
											<div className="truncate text-[12px] text-muted-foreground">{prompt.text}</div>
											<div className="truncate font-mono text-[10px] text-muted-foreground/70">
												{prompt.provider}/{prompt.model}
											</div>
										</button>
										<Button
											variant="ghost"
											size="icon-xs"
											className="rounded-none"
											onMouseDown={event => event.preventDefault()}
											onClick={event => {
												event.stopPropagation()
												setAgentStash(Array.filter(stashedPrompts, savedPrompt => savedPrompt.id !== prompt.id))
											}}
										>
											<Trash className="size-3" />
										</Button>
									</div>
								))}
							</div>
						</RichTextArea.Actions>
					)}
					<RichTextArea
						ref={inputRef}
						initialSnapshot={agentInputStates.get(input.agentId)}
						onSubmit={submitPrompt}
						placeholder="Send a message, type @ to attach files..."
						options={{
							'@': {
								color: 'oklch(0.74 0.12 220)',
								values: pipe(
									files,
									Array.map(label => ({label}))
								)
							}
						}}
					>
						{entry => (
							<>
								<FileIcon filePath={entry.value.label} className="size-3.5" />
								<span className="min-w-0 truncate">{entry.value.label}</span>
							</>
						)}
					</RichTextArea>
					<RichTextArea.ToolBar>
						<div className="flex w-full items-center gap-2">
							<Select
								value={`${input.provider}:${input.model}`}
								onValueChange={modelId => {
									if (Predicate.isString(modelId)) input.setModel(modelId)
								}}
							>
								<SelectTrigger className="h-7 w-64 rounded-none text-xs">
									<SelectValue placeholder="Model" />
								</SelectTrigger>
								<SelectContent>
									{pipe(
										models,
										Array.filter(model => pipe(model.agents, Array.contains(input.layer))),
										Array.map(model => (
											<SelectItem key={`${model.provider}:${model.model}`} value={`${model.provider}:${model.model}`}>
												{model.provider}/{model.model}
											</SelectItem>
										))
									)}
								</SelectContent>
							</Select>
							<div className="ml-auto flex items-center gap-2">
								<Button variant="outline" size="icon-xs" className="rounded-none" onClick={stashPrompt}>
									<Archive className="size-3.5" />
								</Button>
								<Button
									variant="outline"
									size="icon-xs"
									className="rounded-none"
									onClick={() => {
										void stopAgent({payload: {agentId: input.agentId}})
									}}
								>
									<Square className="size-3.5 fill-current" />
								</Button>
								<Button size="icon-xs" className="rounded-none" onClick={() => submitPrompt()}>
									<ArrowUpIcon className="size-3.5" />
								</Button>
							</div>
						</div>
					</RichTextArea.ToolBar>
				</div>
			</div>
		</div>
	)
}
