import {useAtomRefresh, useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, Option, Order, Predicate, pipe, Schema, Stream, String} from 'effect'

import {
	Copy,
	FileIcon,
	GitBranch,
	Layers,
	MoreVertical,
	PanelTop,
	Plus,
	RefreshCw,
	Square,
	Trash2
} from '@ai-toolkit/components/icons'
import {PatchReview} from '@ai-toolkit/components/render/diff'
import {
	TreeExplorer,
	TreeExplorerGroup,
	TreeExplorerRow,
	TreeExplorerSection
} from '@ai-toolkit/components/tree-explorer'
import {Button} from '@ai-toolkit/components/ui/button'
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
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition, useEffect, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import type {ProjectEntry} from '#rpcs/contracts.ts'
import {BranchesSnapshot, ProjectsSnapshot, ReviewSnapshot} from '#rpcs/contracts.ts'

const SearchSchema = Schema.Struct({
	projectRoot: Schema.optional(Schema.String),
	worktreeRoot: Schema.optional(Schema.String),
	reviewFile: Schema.optional(Schema.String),
	reviewScope: Schema.optional(Schema.String)
})

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

export const Route = createFileRoute('/(home)/')({
	validateSearch: Schema.toStandardSchemaV1(SearchSchema),
	component: RouteComponent
})

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

function ReviewViewPanel(input: {
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
	projects: readonly ProjectEntry[]
	fetchFailed: boolean
	fetchedAt: number | undefined
	selectWorktree: (projectRoot: string, worktreeRoot: string) => void
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
	const fetchStatusClassName = input.fetchFailed ? 'text-amber-500' : 'text-muted-foreground'
	let fetchStatusText = 'not fetched'
	if (input.fetchedAt) {
		fetchStatusText = `fetched ${new Date(input.fetchedAt).toLocaleTimeString()}`
	}
	if (input.fetchFailed) {
		fetchStatusText = 'fetch failed'
	}
	const localSourceBranches = pipe(
		uniqueBranches,
		Array.filter(candidate => candidate.name !== branchSnapshot.defaultBranch)
	)
	const effectiveSourceBranch = sourceBranch || branchSnapshot.defaultBranch
	const isNewBranch = branch !== '' && Predicate.isUndefined(selectedBranch)

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
		const hasWarnings =
			worktree.status?.dirtyTracked ||
			worktree.status?.untracked ||
			worktree.status?.unpushedCommits ||
			worktree.status?.ahead ||
			worktree.status?.behind

		if (hasWarnings) {
			setDeleteTarget(worktree)
			return
		}

		await deleteWorktree({payload: {cwd: worktree.root, force: true}})
		refreshProjects()
	}

	async function copyPath(value: string) {
		try {
			await navigator.clipboard.writeText(value)
		} catch {
			const input = document.createElement('input')
			input.value = value
			document.body.append(input)
			input.select()
			document.execCommand('copy')
			input.remove()
		}
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
				<span className={fetchStatusClassName}>{fetchStatusText}</span>
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
						{isNewBranch && (
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
										{Array.map(localSourceBranches, candidate => (
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
										))}
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
							meta={
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
							{Array.map(project.worktrees, worktree => {
								const risky =
									worktree.status?.dirtyTracked ||
									worktree.status?.untracked ||
									worktree.status?.unpushedCommits ||
									worktree.status?.behind
								const statusIconClassName = risky ? 'text-amber-500' : 'text-current'

								return (
									<li
										key={worktree.root}
										className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center pr-2 hover:bg-muted/60 ${input.activeWorktree?.root === worktree.root ? 'bg-muted' : ''}`}
									>
										<TreeExplorerRow
											depth={1}
											icon={
												worktree.root === project.repository.root ? (
													<PanelTop className={`size-3.5 ${statusIconClassName}`} />
												) : (
													<Square className={`size-3.5 ${statusIconClassName}`} />
												)
											}
											selected={input.activeWorktree?.root === worktree.root}
											className="bg-transparent hover:bg-transparent"
											onClick={() => input.selectWorktree(project.repository.root, worktree.root)}
										>
											{worktree.branch ?? pathLabel(worktree.root)}
										</TreeExplorerRow>
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
												<DropdownMenuItem onClick={() => copyPath(worktree.root)} className="whitespace-nowrap">
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
									</li>
								)
							})}
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

function RouteComponent() {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const projects = useAtomSuspense(projectsAtom).value.projects
	const snapshot = useAtomSuspense(projectsAtom).value
	const activeProject =
		pipe(
			projects,
			Array.findFirst(project => project['repository']['root'] === search.projectRoot),
			Option.getOrUndefined
		) ?? projects[0]
	const activeReviewScope = search.reviewScope === 'head-to-staged' ? 'head-to-staged' : 'staged-to-worktree'
	const activeWorktree =
		pipe(
			activeProject?.['worktrees'] ?? [],
			Array.findFirst(worktree => worktree['root'] === search.worktreeRoot),
			Option.getOrUndefined
		) ?? activeProject?.['worktrees'][0]

	return (
		<div className="min-h-0 flex-1 overflow-hidden bg-background font-mono">
			<ResizablePanelGroup orientation="horizontal">
				<ResizablePanel defaultSize="22%" minSize="16%" maxSize="34%">
					<WorktreeManager
						activeProject={activeProject}
						activeWorktree={activeWorktree}
						fetchFailed={snapshot.fetchFailed}
						fetchedAt={snapshot.fetchedAt}
						projects={projects}
						selectWorktree={(projectRoot, worktreeRoot) =>
							startTransition(() => {
								navigate({
									search: current => ({...current, projectRoot, reviewFile: undefined, worktreeRoot})
								})
							})
						}
					/>
				</ResizablePanel>

				<ResizableHandle />

				<ResizablePanel defaultSize="86%" minSize="60%">
					{activeProject && activeWorktree ? (
						<ReviewViewPanel
							key={activeWorktree['root']}
							activeReviewScope={activeReviewScope}
							activeWorktree={activeWorktree}
							reviewFile={search.reviewFile}
							selectReviewEntry={(scope, filePath) =>
								startTransition(() => {
									navigate({
										search: current => ({
											...current,
											reviewFile: filePath,
											reviewScope: scope
										})
									})
								})
							}
						/>
					) : (
						<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
							No project selected.
						</div>
					)}
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	)
}
