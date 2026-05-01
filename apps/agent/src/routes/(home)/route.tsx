import {useAtomRefresh, useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, Option, Order, Predicate, pipe, Schema, Stream, String} from 'effect'

import type {ModelId, ProviderId} from '@ai-toolkit/ai/catalog'
import {models} from '@ai-toolkit/ai/catalog'
import {
	ArrowUpIcon,
	Brain,
	ChevronRight,
	Copy,
	FileIcon,
	GitBranch,
	Layers,
	MoreVertical,
	PanelTop,
	Plus,
	RefreshCw,
	SparklesIcon,
	Square,
	Trash2,
	UserIcon,
	Wrench
} from '@ai-toolkit/components/icons'
import {AutocompleteInput} from '@ai-toolkit/components/input'
import {PatchReview} from '@ai-toolkit/components/render/diff'
import {Markdown} from '@ai-toolkit/components/render/markdown'
import {
	TreeExplorer,
	TreeExplorerGroup,
	TreeExplorerRow,
	TreeExplorerSection
} from '@ai-toolkit/components/tree-explorer'
import {Button} from '@ai-toolkit/components/ui/button'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@ai-toolkit/components/ui/collapsible'
import {Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList} from '@ai-toolkit/components/ui/combobox'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from '@ai-toolkit/components/ui/dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger
} from '@ai-toolkit/components/ui/dropdown-menu'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@ai-toolkit/components/ui/select'
import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute, Outlet, useRouterState} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition, useEffect, useRef, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import type {AgentEvent, AgentStreamPart, ProjectEntry} from '#rpcs/contracts.ts'
import {BranchesSnapshot, ProjectsSnapshot, ReviewSnapshot} from '#rpcs/contracts.ts'

const HomeSearchSchema = Schema.Struct({
	projectRoot: Schema.optional(Schema.String),
	worktreeRoot: Schema.optional(Schema.String),
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
export type Worktree = ProjectEntry['worktrees'][number]
type AgentRun = {prompt: string; runId: string; parts: readonly AgentEvent[]}

export const defaultModel = models[2]

export function agentId(projectRoot: string, worktreeRoot: string) {
	let hash = 0x811c9dc5
	for (const byte of new TextEncoder().encode(pipe([projectRoot, worktreeRoot], Array.join('\n')))) {
		hash ^= byte
		hash = Math.imul(hash, 0x01000193)
	}
	return `agent-${pipe((hash >>> 0).toString(36), String.slice(0, 8))}`
}

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

function HomeLayout() {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const pathname = useRouterState({select: state => state.location.pathname})
	const {activeProject, activeWorktree, projects, snapshot} = useHomeSelection(search)

	return (
		<div className="min-h-0 flex-1 overflow-hidden bg-background font-mono">
			<ResizablePanelGroup orientation="horizontal">
				<ResizablePanel defaultSize="22%" minSize="16%" maxSize="34%">
					<WorktreeManager
						activeProject={activeProject}
						activeWorktree={activeWorktree}
						activeAgentId={
							pathname === '/agent' && activeProject && activeWorktree
								? agentId(activeProject.repository.root, activeWorktree.root)
								: undefined
						}
						fetchFailed={snapshot.fetchFailed}
						fetchedAt={snapshot.fetchedAt}
						projects={projects}
						selectWorktree={(projectRoot, worktreeRoot) =>
							startTransition(() => {
								navigate({
									to: '/diff',
									search: {...search, projectRoot, reviewFile: undefined, worktreeRoot}
								})
							})
						}
						selectAgent={(projectRoot, worktreeRoot) =>
							startTransition(() => {
								navigate({
									to: '/agent',
									search: {...search, projectRoot, reviewFile: undefined, worktreeRoot}
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
		) ?? activeProject?.['worktrees'][0]

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
	activeProject: ProjectEntry | undefined
	activeWorktree: Worktree | undefined
	activeAgentId: string | undefined
	projects: readonly ProjectEntry[]
	fetchFailed: boolean
	fetchedAt: number | undefined
	selectWorktree: (projectRoot: string, worktreeRoot: string) => void
	selectAgent: (projectRoot: string, worktreeRoot: string, agentId: string) => void
}) {
	const refreshProjects = useAtomRefresh(projectsAtom)
	const refresh = useAtomSet(RpcClient.mutation('projects.refresh'), {mode: 'promise'})
	const createWorktree = useAtomSet(RpcClient.mutation('projects.createWorktree'), {mode: 'promise'})
	const deleteWorktree = useAtomSet(RpcClient.mutation('projects.deleteWorktree'), {mode: 'promise'})
	const [branch, setBranch] = useState('')
	const [sourceBranch, setSourceBranch] = useState('')
	const [createOpen, setCreateOpen] = useState(false)
	const [createProject, setCreateProject] = useState<ProjectEntry>()
	const [branchPickerOpen, setBranchPickerOpen] = useState(false)
	const [deleteTarget, setDeleteTarget] = useState<Worktree>()
	const targetProject = createProject ?? input.activeProject
	const branchesAtom = Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient.asEffect(),
				Effect.flatMap(client =>
					targetProject
						? client('projects.branches', {cwd: targetProject.repository.root})
						: Effect.succeed(new BranchesSnapshot({branches: [], defaultBranch: 'main'}))
				)
			),
			{initialValue: new BranchesSnapshot({branches: [], defaultBranch: 'main'})}
		)
	)
	const branchSnapshot = useAtomSuspense(branchesAtom).value
	const checkedOutBranches = pipe(
		targetProject?.worktrees ?? [],
		Array.map(worktree => worktree.branch ?? ''),
		Array.filter(String.isNonEmpty)
	)
	const uniqueBranches = pipe(
		branchSnapshot.branches,
		Array.filter(candidate => pipe(candidate.name, String.isNonEmpty)),
		Array.sortWith(candidate => `${candidate.name}:${candidate.type === 'local' ? '0' : '1'}`, Order.String),
		Array.dedupeWith((left, right) => left.name === right.name)
	)
	const availableBranches = pipe(
		uniqueBranches,
		Array.filter(candidate => !pipe(checkedOutBranches, Array.contains(candidate.name)))
	)
	const selectedBranch = pipe(
		availableBranches,
		Array.findFirst(candidate => candidate.name === branch),
		Option.getOrUndefined
	)
	const branchHasMatches =
		branch === '' ||
		pipe(
			availableBranches,
			Array.some(candidate => pipe(candidate.name, String.includes(branch)))
		)
	const effectiveSourceBranch = sourceBranch || branchSnapshot.defaultBranch

	useEffect(() => {
		const id = window.setInterval(() => {
			void (async () => {
				await refresh({payload: undefined})
				refreshProjects()
			})()
		}, 60_000)

		return () => window.clearInterval(id)
	}, [refresh, refreshProjects])

	useEffect(() => {
		if (!branchHasMatches) {
			setBranchPickerOpen(false)
		}
	}, [branchHasMatches])

	async function createSelectedWorktree() {
		if (!targetProject || branch === '') {
			return
		}
		let mode: 'existing-local' | 'existing-remote' | 'new-local' = 'new-local'
		if (selectedBranch?.type === 'local') {
			mode = 'existing-local'
		}
		if (selectedBranch?.type === 'remote') {
			mode = 'existing-remote'
		}

		await createWorktree({
			payload: {
				baseBranch:
					selectedBranch?.type === 'remote' ? `${selectedBranch.remote}/${selectedBranch.name}` : effectiveSourceBranch,
				branch,
				cwd: targetProject.repository.root,
				mode
			}
		})
		setBranch('')
		setCreateProject(undefined)
		setCreateOpen(false)
		refreshProjects()
	}

	async function deleteSelectedWorktree() {
		if (!deleteTarget || deleteTarget.root === input.activeProject?.repository.root) {
			return
		}

		await deleteWorktree({payload: {cwd: deleteTarget.root, force: true}})
		setDeleteTarget(undefined)
		refreshProjects()
	}

	async function requestDeleteWorktree(worktree: Worktree) {
		if (
			worktree.status?.dirtyTracked ||
			worktree.status?.untracked ||
			worktree.status?.unpushedCommits ||
			worktree.status?.ahead ||
			worktree.status?.behind
		) {
			setDeleteTarget(worktree)
			return
		}

		await deleteWorktree({payload: {cwd: worktree.root, force: true}})
		refreshProjects()
	}

	return (
		<div className="flex h-full flex-col border-r text-xs">
			<div className="flex h-9 items-center gap-2 border-b px-2">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => {
						void (async () => {
							await refresh({payload: undefined})
							refreshProjects()
						})()
					}}
					aria-label="Refresh workspaces"
				>
					<RefreshCw className="size-3.5" />
				</Button>
				<span className={(input.fetchFailed && 'text-amber-500') || 'text-muted-foreground'}>
					{(() => {
						if (input.fetchFailed) return 'fetch failed'
						if (input.fetchedAt) return `fetched ${new Date(input.fetchedAt).toLocaleTimeString()}`
						return 'not fetched'
					})()}
				</span>
			</div>

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>
							Create worktree in {targetProject ? pathLabel(targetProject.repository.root) : 'workspace'}
						</DialogTitle>
					</DialogHeader>
					<div className="grid gap-3">
						<div className="grid gap-1.5">
							<span className="font-medium text-muted-foreground text-xs">Branch</span>
							<Combobox
								value={branch}
								onValueChange={value => setBranch(value ?? '')}
								open={branchPickerOpen}
								onOpenChange={open => setBranchPickerOpen(open && branchHasMatches)}
							>
								<ComboboxInput
									value={branch}
									onChange={event => setBranch(event.currentTarget.value)}
									placeholder="Branch"
									className="w-full"
								/>
								<ComboboxContent className="w-(--anchor-width) min-w-(--anchor-width) max-w-none">
									<ComboboxList>
										{Array.map(availableBranches, candidate => (
											<ComboboxItem
												key={`${candidate.type}:${candidate.remote ?? ''}:${candidate.name}`}
												value={candidate.name}
											>
												{candidate.type === 'local' ? (
													<GitBranch className="size-3.5" />
												) : (
													<Square className="size-3.5" />
												)}
												<span className="min-w-0 truncate">{candidate.name}</span>
											</ComboboxItem>
										))}
									</ComboboxList>
								</ComboboxContent>
							</Combobox>
						</div>
						{branch !== '' && Predicate.isUndefined(selectedBranch) && (
							<div className="grid gap-1.5">
								<span className="font-medium text-muted-foreground text-xs">Create from</span>
								<Select value={effectiveSourceBranch} onValueChange={value => setSourceBranch(value ?? '')}>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Source branch" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={branchSnapshot.defaultBranch}>
											<GitBranch className="mr-2 size-3.5" />
											{branchSnapshot.defaultBranch}
										</SelectItem>
										{pipe(
											uniqueBranches,
											Array.filter(candidate => candidate.name !== branchSnapshot.defaultBranch),
											Array.map(candidate => (
												<SelectItem
													key={`${candidate.type}:${candidate.remote ?? ''}:${candidate.name}`}
													value={candidate.name}
												>
													{candidate.type === 'local' ? (
														<GitBranch className="mr-2 size-3.5" />
													) : (
														<Square className="mr-2 size-3.5" />
													)}
													{candidate.name}
												</SelectItem>
											))
										)}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
							Cancel
						</Button>
						<Button type="button" onClick={createSelectedWorktree} disabled={branch === ''}>
							Create
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<TreeExplorer className="min-h-0 flex-1 overflow-y-auto px-0 py-1">
				<TreeExplorerSection label="Workspaces">
					{Array.map(input.projects, (project, index) => (
						<TreeExplorerGroup
							key={project.repository.gitDirectory}
							className="border-muted-foreground/20"
							contentClassName={projectAccentClassNames[index % projectAccentClassNames.length]}
							icon={<Layers className="size-3.5" />}
							label={<span className="tree-label">{pathLabel(project.repository.root)}</span>}
							actions={
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-6 text-muted-foreground [&_svg]:text-muted-foreground"
									onClick={() => {
										setCreateProject(project)
										setCreateOpen(true)
									}}
									aria-label="New worktree"
								>
									<Plus className="size-4" />
								</Button>
							}
						>
							{pipe(
								project.worktrees,
								Array.map(worktree => {
									const worktreeAgentId = agentId(project.repository.root, worktree.root)
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
												actions={
													<DropdownMenu>
														<DropdownMenuTrigger
															render={
																<Button
																	type="button"
																	variant="ghost"
																	size="icon"
																	className="size-6 text-muted-foreground [&_svg]:text-muted-foreground"
																	aria-label="Worktree actions"
																>
																	<MoreVertical className="size-4" />
																</Button>
															}
														/>
														<DropdownMenuContent align="end" className="min-w-40">
															<DropdownMenuItem
																onClick={() => {
																	void (async () => {
																		try {
																			await navigator.clipboard.writeText(worktree.root)
																		} catch {
																			const input = document.createElement('input')
																			input.value = worktree.root
																			document.body.append(input)
																			input.select()
																			document.execCommand('copy')
																			input.remove()
																		}
																	})()
																}}
																className="whitespace-nowrap"
															>
																<Copy className="mr-2 size-3.5" />
																Copy path
															</DropdownMenuItem>
															{worktree.root !== project.repository.root && (
																<DropdownMenuItem
																	variant="destructive"
																	onClick={() => requestDeleteWorktree(worktree)}
																	className="whitespace-nowrap"
																>
																	<Trash2 className="mr-2 size-3.5" />
																	Delete worktree
																</DropdownMenuItem>
															)}
														</DropdownMenuContent>
													</DropdownMenu>
												}
											>
												{worktree.branch ?? pathLabel(worktree.root)}
											</TreeExplorerRow>
											<ul className="flex flex-col gap-px border-muted-foreground/20 border-l" style={{marginLeft: 15}}>
												<li className="w-full min-w-0">
													<TreeExplorerRow
														icon={<SparklesIcon className="size-3.5" />}
														selected={input.activeAgentId === worktreeAgentId}
														onClick={() => input.selectAgent(project.repository.root, worktree.root, worktreeAgentId)}
													>
														agent
													</TreeExplorerRow>
												</li>
											</ul>
										</li>
									)
								})
							)}
						</TreeExplorerGroup>
					))}
				</TreeExplorerSection>
			</TreeExplorer>

			<Dialog open={Predicate.isNotUndefined(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(undefined)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete {deleteTarget?.branch}?</DialogTitle>
						<DialogDescription>
							Removes the worktree directory and local branch. The remote branch is kept.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-1 text-amber-500 text-xs">
						{deleteTarget?.status?.dirtyTracked && <div>dirty tracked files</div>}
						{deleteTarget?.status?.untracked && <div>untracked files</div>}
						{deleteTarget?.status?.unpushedCommits && <div>local commits not reachable remotely</div>}
						{(deleteTarget?.status?.ahead || deleteTarget?.status?.behind) && (
							<div>
								ahead {deleteTarget?.status?.ahead} / behind {deleteTarget?.status?.behind}
							</div>
						)}
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setDeleteTarget(undefined)}>
							Cancel
						</Button>
						<Button type="button" variant="destructive" onClick={deleteSelectedWorktree}>
							Delete anyway
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
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
							{metadata?.type === 'response-metadata' ? metadata.modelId : 'agent'}
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
	model: ModelId
	provider: ProviderId
	setModel: (model: string) => void
}) {
	const inputRef = useRef<AutocompleteInput.Handle<{label: string}>>(null)
	const files = useAtomSuspense(filesAtom(input.activeWorktree.root)).value
	const events = useAtomSuspense(agentEventsAtom(input.agentId)).value
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

	function submitPrompt() {
		const text = inputRef.current?.getText() ?? ''
		if (String.isEmpty(text)) return
		void promptAgent({
			payload: {
				agentId: input.agentId,
				cwd: input.activeWorktree.root,
				model: input.model,
				prompt: text,
				provider: input.provider,
				runId: crypto.randomUUID()
			}
		})
		inputRef.current?.clear()
	}

	return (
		<div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				<div className="mx-auto flex max-w-4xl flex-col gap-3">
					{Array.isReadonlyArrayEmpty(runs) && (
						<div className="flex min-h-48 items-center justify-center text-muted-foreground text-sm">
							Send a message to start the agent.
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
				<div className="mx-auto max-w-4xl">
					<Select value={input.model} onValueChange={value => input.setModel(value ?? defaultModel.model)}>
						<SelectTrigger className="mb-2 w-64 rounded-none">
							<SelectValue placeholder="Model" />
						</SelectTrigger>
						<SelectContent>
							{Array.map(models, model => (
								<SelectItem key={`${model.provider}:${model.model}`} value={model.model}>
									{model.provider}/{model.model}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<AutocompleteInput
						ref={inputRef}
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
					</AutocompleteInput>
					<AutocompleteInput.ToolBar>
						<div className="ml-auto flex items-center gap-2">
							<Button variant="outline" size="icon-xs" className="rounded-none">
								<Square className="size-3.5 fill-current" />
							</Button>
							<Button size="icon-xs" className="rounded-none" onClick={submitPrompt}>
								<ArrowUpIcon className="size-3.5" />
							</Button>
						</div>
					</AutocompleteInput.ToolBar>
				</div>
			</div>
		</div>
	)
}
