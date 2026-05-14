import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Effect, Match, Option, Predicate, pipe, Stream} from 'effect'

import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
import {ClipboardCopyIcon, FileIcon, TrashIcon} from '@ai-toolkit/components/icons'
import {PatchDiff} from '@ai-toolkit/components/render/diff'
import {TreeExplorer, TreeExplorerSection} from '@ai-toolkit/components/tree-explorer'
import {Button} from '@ai-toolkit/components/ui/button'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@ai-toolkit/components/ui/dialog'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import {cn} from '@ai-toolkit/components/utils'
import type {GitDiff} from '@ai-toolkit/git/schema'

export const Route = createFileRoute('/(home)/$worktree/diff')({
	component: DiffPage
})

const changesAtom = Atom.family((cwd: string) => {
	return Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client => client('review.watch', {cwd, scope: 'staged-to-worktree'})),
				Stream.unwrap
			)
		)
	)
})

const stagedAtom = Atom.family((cwd: string) => {
	return Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client => client('review.watch', {cwd, scope: 'head-to-staged'})),
				Stream.unwrap
			)
		)
	)
})

const reviewSelectionAtom = Atom.family((_cwd: string) => {
	return Atom.keepAlive(Atom.make({filePath: '', scope: ''}))
})

const reviewPanelAtom = Atom.family((cwd: string) => {
	return Atom.keepAlive(
		Atom.make(get => {
			return Effect.gen(function* () {
				const changes = yield* get.result(changesAtom(cwd))
				const staged = yield* get.result(stagedAtom(cwd))
				const selection = get(reviewSelectionAtom(cwd))
				const entries = pipe(
					changes,
					Array.map(diff => ({diff, scope: 'staged-to-worktree'})),
					Array.appendAll(Array.map(staged, diff => ({diff, scope: 'head-to-staged'})))
				)

				return {
					changesDiffs: changes,
					entries,
					selectedEntry:
						pipe(
							entries,
							Array.findFirst(entry => {
								return (
									selection.scope !== '' &&
									entry.scope === selection.scope &&
									entry.diff.filePath === selection.filePath
								)
							}),
							Option.getOrUndefined
						) ?? entries[0],
					stagedDiffs: staged
				}
			})
		})
	)
})

export type QueuedComment = {
	readonly filePath: string
	readonly lineNumber: number
	readonly side?: 'additions' | 'deletions'
	readonly body: string
	readonly scope: string
}

function groupCommentsByFile(comments: readonly QueuedComment[]) {
	const groups = new Map<string, readonly QueuedComment[]>()

	for (const comment of comments) {
		const key = `${comment.scope}:${comment.filePath}`
		groups.set(key, [...(groups.get(key) ?? []), comment])
	}

	return Array.flatMap(Array.fromIterable(groups), entry => {
		const comment = Array.head(entry[1])
		return Option.isSome(comment)
			? [{comments: entry[1], filePath: comment.value.filePath, key: entry[0], scope: comment.value.scope}]
			: []
	})
}

function DiffPage() {
	const params = Route.useParams()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return

	return <ReviewViewPanel key={activeHome.value.activeWorktree.root} cwd={activeHome.value.activeWorktree.root} />
}

function ReviewViewPanel(input: {readonly cwd: string}) {
	const [comments, setComments] = useState<readonly QueuedComment[]>(Array.empty())
	const [shortcutsOpen, setShortcutsOpen] = useState(false)
	const reviewPanel = useAtomSuspense(reviewPanelAtom(input.cwd))
	const setReviewSelection = useAtomSet(reviewSelectionAtom(input.cwd))
	function selectReviewEntry(selection: {readonly scope: string; readonly filePath: string}) {
		setReviewSelection(selection)
	}
	const moveReviewSelectionAtom = Atom.fn(
		Effect.fnUntraced(function* (
			selectionInput: {
				readonly cwd: string
				readonly offset: number
			},
			get: Atom.FnContext
		) {
			const panel = yield* get.result(reviewPanelAtom(selectionInput.cwd))
			if (!panel.selectedEntry) return
			const nextEntry = Array.get(
				panel.entries,
				Math.max(
					0,
					Math.min(
						pipe(
							panel.entries,
							Array.findFirstIndex(entry => {
								return (
									entry.scope === panel.selectedEntry?.scope &&
									entry.diff.filePath === panel.selectedEntry.diff.filePath
								)
							}),
							Option.getOrElse(() => 0)
						) + selectionInput.offset,
						Array.length(panel.entries) - 1
					)
				)
			)
			if (Option.isNone(nextEntry)) return

			get.set(reviewSelectionAtom(selectionInput.cwd), {
				filePath: nextEntry.value.diff.filePath,
				scope: nextEntry.value.scope
			})
		})
	)
	const moveReviewSelection = useAtomSet(moveReviewSelectionAtom, {mode: 'promise'})
	void moveReviewSelectionAtom
	const toggleStageReviewEntryAtom = Atom.fn(
		Effect.fnUntraced(function* (cwd: string, get: Atom.FnContext) {
			const panel = yield* get.result(reviewPanelAtom(cwd))
			if (!panel.selectedEntry) return

			if (panel.selectedEntry.scope === 'head-to-staged') {
				yield* get.setResult(RpcClient.mutation('review.unstageFile'), {
					payload: {cwd, filePath: panel.selectedEntry.diff.filePath}
				})
				get.refresh(changesAtom(cwd))
				get.refresh(stagedAtom(cwd))
				return
			}

			yield* get.setResult(RpcClient.mutation('review.stageFile'), {
				payload: {cwd, filePath: panel.selectedEntry.diff.filePath}
			})

			get.refresh(changesAtom(cwd))
			get.refresh(stagedAtom(cwd))
		})
	)
	const toggleStageReviewEntry = useAtomSet(toggleStageReviewEntryAtom, {mode: 'promise'})
	void toggleStageReviewEntryAtom
	const discardReviewEntryAtom = Atom.fn(
		Effect.fnUntraced(function* (cwd: string, get: Atom.FnContext) {
			const panel = yield* get.result(reviewPanelAtom(cwd))
			if (!panel.selectedEntry) return

			if (panel.selectedEntry.scope === 'head-to-staged') {
				yield* get.setResult(RpcClient.mutation('review.unstageFile'), {
					payload: {cwd, filePath: panel.selectedEntry.diff.filePath}
				})
			}
			yield* get.setResult(RpcClient.mutation('review.discardFile'), {
				payload: {cwd, filePath: panel.selectedEntry.diff.filePath}
			})

			get.refresh(changesAtom(cwd))
			get.refresh(stagedAtom(cwd))
		})
	)
	const discardReviewEntry = useAtomSet(discardReviewEntryAtom, {mode: 'promise'})
	void discardReviewEntryAtom

	useHotkey('ArrowDown', () => void moveReviewSelection({cwd: input.cwd, offset: 1}), {
		enabled: !Array.isReadonlyArrayEmpty(reviewPanel.value.entries)
	})
	useHotkey('ArrowUp', () => void moveReviewSelection({cwd: input.cwd, offset: -1}), {
		enabled: !Array.isReadonlyArrayEmpty(reviewPanel.value.entries)
	})
	async function toggleSelectedEntryStage() {
		if (!reviewPanel.value.selectedEntry) return

		await toggleStageReviewEntry(input.cwd)
		setComments(current => {
			return Array.map(current, comment => {
				return comment.scope === reviewPanel.value.selectedEntry?.scope &&
					comment.filePath === reviewPanel.value.selectedEntry.diff.filePath
					? {
							...comment,
							scope:
								reviewPanel.value.selectedEntry.scope === 'head-to-staged' ? 'staged-to-worktree' : 'head-to-staged'
						}
					: comment
			})
		})
	}

	async function discardSelectedEntry() {
		if (!reviewPanel.value.selectedEntry) return

		await discardReviewEntry(input.cwd)
		setComments(current => {
			return Array.filter(current, comment => comment.filePath !== reviewPanel.value.selectedEntry?.diff.filePath)
		})
	}

	useHotkey('Enter', () => void toggleSelectedEntryStage(), {
		enabled: Predicate.isNotUndefined(reviewPanel.value.selectedEntry)
	})
	useHotkey({key: 'D', shift: true}, () => void discardSelectedEntry(), {
		enabled: Predicate.isNotUndefined(reviewPanel.value.selectedEntry),
		preventDefault: true
	})
	useHotkey({key: 'C', shift: true}, () => void copyComments(comments), {
		enabled: !Array.isReadonlyArrayEmpty(comments),
		preventDefault: true
	})
	useHotkey({key: '?', shift: true}, () => setShortcutsOpen(true))

	async function copyComments(commentsToCopy: readonly QueuedComment[]) {
		await navigator.clipboard.writeText(
			pipe(
				groupCommentsByFile(commentsToCopy),
				Array.map(group => {
					return Array.join(
						[
							`## ${group.filePath}`,
							pipe(
								group.comments,
								Array.map(comment => {
									return `- ${comment.side === 'deletions' ? 'deleted' : 'line'}:${comment.lineNumber}: ${comment.body}`
								}),
								Array.join('\n\n')
							)
						],
						'\n\n'
					)
				}),
				Array.prepend('# Review comments'),
				Array.join('\n\n')
			)
		)
		setComments(current => {
			return Array.filter(current, comment => {
				return !new Set(
					Array.map(commentsToCopy, commentToCopy => {
						return `${commentToCopy.scope}:${commentToCopy.filePath}:${commentToCopy.side === 'deletions' ? 'deletions' : 'file'}:${commentToCopy.lineNumber}`
					})
				).has(
					`${comment.scope}:${comment.filePath}:${comment.side === 'deletions' ? 'deletions' : 'file'}:${comment.lineNumber}`
				)
			})
		})
	}

	function deleteFileComments(group: ReturnType<typeof groupCommentsByFile>[number]) {
		setComments(current => {
			return Array.filter(current, comment => comment.scope !== group.scope || comment.filePath !== group.filePath)
		})
	}

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
						<div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
							<kbd className="border px-1.5 py-0.5 text-center">Shift+C</kbd>
							<span>Copy all queued comments</span>
						</div>
					</div>
				</DialogContent>
			</Dialog>
			<ResizablePanelGroup orientation="horizontal">
				<ResizablePanel defaultSize="24%" minSize="18%" maxSize="36%">
					<div className="flex h-full flex-col border-r">
						<ResizablePanelGroup orientation="vertical">
							<ResizablePanel defaultSize="50%" minSize="20%">
								<DiffList
									title="Unstaged changes"
									empty="No changes."
									diffs={reviewPanel.value.changesDiffs}
									scope="staged-to-worktree"
									selectedEntry={reviewPanel.value.selectedEntry}
									selectReviewEntry={selectReviewEntry}
								/>
							</ResizablePanel>
							<ResizableHandle />
							<ResizablePanel defaultSize="50%" minSize="20%">
								<DiffList
									title="Staged changes"
									empty="No staged changes."
									diffs={reviewPanel.value.stagedDiffs}
									scope="head-to-staged"
									selectedEntry={reviewPanel.value.selectedEntry}
									selectReviewEntry={selectReviewEntry}
								/>
							</ResizablePanel>
						</ResizablePanelGroup>
					</div>
				</ResizablePanel>
				<ResizableHandle />
				<ResizablePanel defaultSize="76%" minSize="36%">
					<div className="bg-background flex h-full min-w-0 flex-col overflow-hidden">
						<header className="flex min-h-8 items-center justify-between gap-2 border-b px-2">
							<div className="flex min-w-0 items-center gap-1 overflow-hidden">
								{Array.map(groupCommentsByFile(comments), group => (
									<Button
										key={group.key}
										type="button"
										variant="outline"
										size="xs"
										aria-label={`Delete ${group.comments.length} queued comments for ${group.filePath}`}
										title={`Delete ${group.comments.length} comments for ${group.filePath}`}
										onClick={() => deleteFileComments(group)}
									>
										<FileIcon filePath={group.filePath} />
										<span className="max-w-32 truncate">{group.filePath.split('/').at(-1) ?? group.filePath}</span>
									</Button>
								))}
							</div>
							<div className="flex shrink-0 items-center gap-1">
								<Button
									type="button"
									variant="destructive"
									size="icon-xs"
									aria-label="Delete all queued comments"
									title="Delete all queued comments"
									disabled={Array.isReadonlyArrayEmpty(comments)}
									onClick={() => setComments(Array.empty())}
								>
									<TrashIcon />
								</Button>
								<Button
									type="button"
									variant="default"
									size="icon-xs"
									aria-label="Copy all queued comments"
									title="Copy all queued comments"
									disabled={Array.isReadonlyArrayEmpty(comments)}
									onClick={() => void copyComments(comments)}
								>
									<ClipboardCopyIcon />
								</Button>
							</div>
						</header>
						<div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
							{!reviewPanel.value.selectedEntry && (
								<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
									No changed files.
								</div>
							)}
							{reviewPanel.value.selectedEntry && (
								<div className="h-full min-h-0 min-w-0">
									<PatchDiff
										filePath={reviewPanel.value.selectedEntry.diff.filePath}
										patch={reviewPanel.value.selectedEntry.diff.patch}
										comments={Array.filter(comments, comment => {
											return (
												comment.scope === reviewPanel.value.selectedEntry?.scope &&
												comment.filePath === reviewPanel.value.selectedEntry.diff.filePath
											)
										})}
										onSaveComment={comment => {
											setComments(current => {
												return pipe(
													current,
													Array.filter(currentComment => {
														return (
															currentComment.scope !== reviewPanel.value.selectedEntry?.scope ||
															currentComment.filePath !== comment.filePath ||
															currentComment.lineNumber !== comment.lineNumber ||
															(currentComment.side === 'deletions' ? 'deletions' : 'file') !==
																(comment.side === 'deletions' ? 'deletions' : 'file')
														)
													}),
													Array.append({...comment, scope: reviewPanel.value.selectedEntry?.scope ?? ''})
												)
											})
										}}
										onDeleteComment={comment => {
											setComments(current => {
												return Array.filter(current, currentComment => {
													return (
														currentComment.scope !== reviewPanel.value.selectedEntry?.scope ||
														currentComment.filePath !== comment.filePath ||
														currentComment.lineNumber !== comment.lineNumber ||
														(currentComment.side === 'deletions' ? 'deletions' : 'file') !==
															(comment.side === 'deletions' ? 'deletions' : 'file')
													)
												})
											})
										}}
									/>
								</div>
							)}
						</div>
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
		</>
	)
}

function DiffList(input: {
	readonly title: string
	readonly empty: string
	readonly diffs: readonly GitDiff[]
	readonly scope: string
	readonly selectedEntry?: {readonly scope: string; readonly diff: GitDiff}
	readonly selectReviewEntry: (selection: {readonly scope: string; readonly filePath: string}) => void
}) {
	return (
		<TreeExplorer className="h-full overflow-y-auto px-0 py-1">
			<TreeExplorerSection label={input.title} className="min-h-0 flex-1 [&>ul]:min-h-0 [&>ul]:flex-1">
				<DiffListEntries
					diffs={input.diffs}
					empty={input.empty}
					scope={input.scope}
					selectedEntry={input.selectedEntry}
					selectReviewEntry={input.selectReviewEntry}
				/>
			</TreeExplorerSection>
		</TreeExplorer>
	)
}

function DiffListEntries(input: {
	readonly empty: string
	readonly diffs: readonly GitDiff[]
	readonly scope: string
	readonly selectedEntry?: {readonly scope: string; readonly diff: GitDiff}
	readonly selectReviewEntry: (selection: {readonly scope: string; readonly filePath: string}) => void
}) {
	if (Array.isReadonlyArrayEmpty(input.diffs)) {
		return (
			<li className="text-muted-foreground flex flex-1 items-center justify-center px-2 py-2 text-xs">{input.empty}</li>
		)
	}

	return Array.map(input.diffs, diff => {
		return (
			<li key={diff.filePath} className="w-full min-w-0">
				<button
					type="button"
					aria-current={
						Predicate.isNotUndefined(input.selectedEntry) &&
						input.selectedEntry.scope === input.scope &&
						input.selectedEntry.diff.filePath === diff.filePath
							? 'page'
							: undefined
					}
					onClick={() => input.selectReviewEntry({filePath: diff.filePath, scope: input.scope})}
					className={cn(
						'text-muted-foreground hover:bg-muted hover:text-foreground grid h-6 w-full grid-cols-[18px_14px_minmax(0,1fr)] items-center gap-1.5 px-2 text-left text-xs',
						Predicate.isNotUndefined(input.selectedEntry) &&
							input.selectedEntry.scope === input.scope &&
							input.selectedEntry.diff.filePath === diff.filePath &&
							'bg-primary/15 text-primary'
					)}
				>
					{pipe(
						Match.value(diff.status),
						Match.when('added', () => (
							<span className="text-center text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">A</span>
						)),
						Match.when('deleted', () => (
							<span className="text-center text-[10px] font-semibold text-red-600 dark:text-red-400">D</span>
						)),
						Match.when('renamed', () => (
							<span className="text-center text-[10px] font-semibold text-sky-600 dark:text-sky-400">R</span>
						)),
						Match.when('modified', () => (
							<span className="text-center text-[10px] font-semibold text-amber-600 dark:text-amber-400">M</span>
						)),
						Match.exhaustive
					)}
					<FileIcon filePath={diff.filePath} className="size-3" />
					<span className="min-w-0 truncate">{diff.filePath}</span>
				</button>
			</li>
		)
	})
}
