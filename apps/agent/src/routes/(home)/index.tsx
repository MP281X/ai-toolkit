import {useAtomRefresh, useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, Option, Predicate, pipe, Schema, Stream, String} from 'effect'

import {FileIcon, Layers, PanelTop, Square} from '@ai-toolkit/components/icons'
import {PatchReview} from '@ai-toolkit/components/render/diff'
import {
	TreeExplorer,
	TreeExplorerBranch,
	TreeExplorerGroup,
	TreeExplorerSection
} from '@ai-toolkit/components/tree-explorer'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import type {ProjectEntry} from '#rpcs/contracts.ts'
import {ProjectsSnapshot, ReviewSnapshot} from '#rpcs/contracts.ts'

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
		{initialValue: new ProjectsSnapshot({projects: [], scanRoot: ''})}
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
			refreshChanges()
			refreshStaged()
			return
		}

		await stageFile({payload: {cwd: input.activeWorktree['root'], filePath: selectedEntry.diff.filePath}})

		refreshChanges()
		refreshStaged()
	}

	useHotkey('ArrowDown', () => moveSelection(1), {enabled: !Array.isReadonlyArrayEmpty(entries)})
	useHotkey('ArrowUp', () => moveSelection(-1), {enabled: !Array.isReadonlyArrayEmpty(entries)})
	useHotkey('Enter', toggleStageSelectedFile, {enabled: Predicate.isNotUndefined(selectedEntry)})

	return (
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
	)
}

function RouteComponent() {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const projects = useAtomSuspense(projectsAtom).value.projects
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
				<ResizablePanel defaultSize="14%" minSize="10%" maxSize="22%">
					<div className="flex h-full flex-col border-r">
						<TreeExplorer className="overflow-y-auto px-0 py-1">
							<TreeExplorerSection label="Repositories">
								{Array.isReadonlyArrayEmpty(projects) ? (
									<li className="px-2 py-6 text-center text-muted-foreground text-xs">No projects found.</li>
								) : (
									Array.map(projects, (project, index) => (
										<TreeExplorerGroup
											key={project['repository']['gitDirectory']}
											className="border-muted-foreground/20"
											contentClassName={projectAccentClassNames[index % projectAccentClassNames.length]}
											icon={<Layers className="size-3.5" />}
											label={<span className="tree-label">{pathLabel(project['repository']['root'])}</span>}
											meta={project['worktrees'].length}
										>
											{Array.map(project['worktrees'], worktree => (
												<TreeExplorerBranch
													key={worktree['root']}
													depth={1}
													icon={
														worktree['root'] === project['repository']['root'] ? (
															<PanelTop className="size-3.5" />
														) : (
															<Square className="size-3.5" />
														)
													}
													selected={activeWorktree?.['root'] === worktree['root']}
													onClick={() =>
														startTransition(() => {
															navigate({
																search: current => ({
																	...current,
																	projectRoot: project['repository']['root'],
																	reviewFile: undefined,
																	worktreeRoot: worktree['root']
																})
															})
														})
													}
													items={null}
												>
													{worktree['root'] === project['repository']['root']
														? 'main'
														: (worktree['branch'] ?? pathLabel(worktree['root']))}
												</TreeExplorerBranch>
											))}
										</TreeExplorerGroup>
									))
								)}
							</TreeExplorerSection>
						</TreeExplorer>
					</div>
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
