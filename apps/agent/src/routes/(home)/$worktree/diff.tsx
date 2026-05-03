import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, Match, Option, Predicate, pipe, Stream} from 'effect'

import {FileIcon} from '@ai-toolkit/components/icons'
import {PatchReview} from '@ai-toolkit/components/render/diff'
import {TreeExplorer, TreeExplorerSection} from '@ai-toolkit/components/tree-explorer'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@ai-toolkit/components/ui/dialog'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import type {GitDiff} from '@ai-toolkit/git/schema'
import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'

export const Route = createFileRoute('/(home)/$worktree/diff')({
	component: DiffPage
})

const changesAtom = Atom.family((cwd: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient.asEffect(),
				Effect.map(client => client('review.watch', {cwd, scope: 'staged-to-worktree'})),
				Stream.unwrap
			)
		)
	)
)

const stagedAtom = Atom.family((cwd: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient.asEffect(),
				Effect.map(client => client('review.watch', {cwd, scope: 'head-to-staged'})),
				Stream.unwrap
			)
		)
	)
)

const reviewSelectionAtom = Atom.family((_cwd: string) =>
	Atom.keepAlive(Atom.make<{scope: string; filePath: string} | undefined>(undefined))
)

const reviewPanelAtom = Atom.family((cwd: string) =>
	Atom.keepAlive(
		Atom.make(get =>
			Effect.gen(function* () {
				const changes = yield* get.result(changesAtom(cwd))
				const staged = yield* get.result(stagedAtom(cwd))
				const selection = get(reviewSelectionAtom(cwd))
				const entries = pipe(
					changes,
					Array.map(diff => ({diff, scope: 'staged-to-worktree'})),
					Array.appendAll(
						pipe(
							staged,
							Array.map(diff => ({diff, scope: 'head-to-staged'}))
						)
					)
				)

				return {
					changesDiffs: changes,
					entries,
					selectedEntry:
						pipe(
							entries,
							Array.findFirst(entry => entry.scope === selection?.scope && entry.diff.filePath === selection.filePath),
							Option.getOrUndefined
						) ?? entries[0],
					stagedDiffs: staged
				}
			})
		)
	)
)

const moveReviewSelectionAtom = Atom.fn(
	Effect.fnUntraced(function* (input: {cwd: string; offset: number}, get: Atom.FnContext) {
		const {entries, selectedEntry} = yield* get.result(reviewPanelAtom(input.cwd))
		const currentEntry = pipe(Option.fromNullishOr(selectedEntry), Option.getOrThrow)
		const nextIndex = Math.max(
			0,
			Math.min(
				pipe(
					entries,
					Array.findFirstIndex(
						entry => entry.scope === currentEntry.scope && entry.diff.filePath === currentEntry.diff.filePath
					),
					Option.getOrElse(() => 0)
				) + input.offset,
				entries.length - 1
			)
		)
		const nextEntry = pipe(Option.fromNullishOr(entries[nextIndex]), Option.getOrThrow)

		get.set(reviewSelectionAtom(input.cwd), {filePath: nextEntry.diff.filePath, scope: nextEntry.scope})
	})
)

const toggleStageReviewEntryAtom = Atom.fn(
	Effect.fnUntraced(function* (cwd: string, get: Atom.FnContext) {
		const {selectedEntry} = yield* get.result(reviewPanelAtom(cwd))
		const currentEntry = pipe(Option.fromNullishOr(selectedEntry), Option.getOrThrow)

		if (currentEntry.scope === 'head-to-staged') {
			yield* get.setResult(RpcClient.mutation('review.unstageFile'), {
				payload: {cwd, filePath: currentEntry.diff.filePath}
			})
			get.refresh(changesAtom(cwd))
			get.refresh(stagedAtom(cwd))
			return
		}

		yield* get.setResult(RpcClient.mutation('review.stageFile'), {
			payload: {cwd, filePath: currentEntry.diff.filePath}
		})

		get.refresh(changesAtom(cwd))
		get.refresh(stagedAtom(cwd))
	})
)

const discardReviewEntryAtom = Atom.fn(
	Effect.fnUntraced(function* (cwd: string, get: Atom.FnContext) {
		const {selectedEntry} = yield* get.result(reviewPanelAtom(cwd))
		const currentEntry = pipe(Option.fromNullishOr(selectedEntry), Option.getOrThrow)

		if (currentEntry.scope === 'head-to-staged') {
			yield* get.setResult(RpcClient.mutation('review.unstageFile'), {
				payload: {cwd, filePath: currentEntry.diff.filePath}
			})
		}
		yield* get.setResult(RpcClient.mutation('review.discardFile'), {
			payload: {cwd, filePath: currentEntry.diff.filePath}
		})

		get.refresh(changesAtom(cwd))
		get.refresh(stagedAtom(cwd))
	})
)

function DiffPage() {
	const params = Route.useParams()
	const activeWorktree = pipe(
		Option.fromNullishOr(useAtomSuspense(activeHomeAtom(params.worktree)).value.activeWorktree),
		Option.getOrThrow
	)

	return <ReviewViewPanel key={activeWorktree.root} cwd={activeWorktree.root} />
}

function ReviewViewPanel(input: {cwd: string}) {
	const [shortcutsOpen, setShortcutsOpen] = useState(false)
	const {changesDiffs, entries, selectedEntry, stagedDiffs} = useAtomSuspense(reviewPanelAtom(input.cwd)).value
	const setReviewSelection = useAtomSet(reviewSelectionAtom(input.cwd))
	const moveReviewSelection = useAtomSet(moveReviewSelectionAtom, {mode: 'promise'})
	const toggleStageReviewEntry = useAtomSet(toggleStageReviewEntryAtom, {mode: 'promise'})
	const discardReviewEntry = useAtomSet(discardReviewEntryAtom, {mode: 'promise'})

	useHotkey('ArrowDown', () => void moveReviewSelection({cwd: input.cwd, offset: 1}), {
		enabled: !Array.isReadonlyArrayEmpty(entries)
	})
	useHotkey('ArrowUp', () => void moveReviewSelection({cwd: input.cwd, offset: -1}), {
		enabled: !Array.isReadonlyArrayEmpty(entries)
	})
	useHotkey('Enter', () => void toggleStageReviewEntry(input.cwd), {enabled: Predicate.isNotUndefined(selectedEntry)})
	useHotkey({key: 'D', shift: true}, () => void discardReviewEntry(input.cwd), {
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
								<DiffList
									title="Unstaged changes"
									empty="No changes."
									diffs={changesDiffs}
									scope="staged-to-worktree"
									selectedEntry={selectedEntry}
									selectReviewEntry={setReviewSelection}
								/>
							</ResizablePanel>
							<ResizableHandle />
							<ResizablePanel defaultSize="50%" minSize="20%">
								<DiffList
									title="Staged changes"
									empty="No staged changes."
									diffs={stagedDiffs}
									scope="head-to-staged"
									selectedEntry={selectedEntry}
									selectReviewEntry={setReviewSelection}
								/>
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
								<div key={`${selectedEntry.scope}\n${selectedEntry.diff.filePath}`} className="h-full min-h-0">
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

function DiffList(input: {
	title: string
	empty: string
	diffs: readonly GitDiff[]
	scope: string
	selectedEntry: {scope: string; diff: GitDiff} | undefined
	selectReviewEntry: (selection: {scope: string; filePath: string}) => void
}) {
	return (
		<TreeExplorer className="h-full overflow-y-auto px-0 py-1">
			<TreeExplorerSection label={input.title} className="min-h-0 flex-1 [&>ul]:min-h-0 [&>ul]:flex-1">
				{Array.isReadonlyArrayEmpty(input.diffs) ? (
					<li className="flex flex-1 items-center justify-center px-2 py-2 text-muted-foreground text-xs">
						{input.empty}
					</li>
				) : (
					Array.map(input.diffs, diff => {
						const selected =
							Predicate.isNotUndefined(input.selectedEntry) &&
							input.selectedEntry.scope === input.scope &&
							input.selectedEntry.diff.filePath === diff.filePath

						return (
							<li key={diff.filePath} className="w-full min-w-0">
								<button
									type="button"
									aria-current={selected ? 'page' : undefined}
									onClick={() => input.selectReviewEntry({filePath: diff.filePath, scope: input.scope})}
									className={`grid h-6 w-full grid-cols-[18px_14px_minmax(0,1fr)] items-center gap-1.5 px-2 text-left text-muted-foreground text-xs hover:bg-muted hover:text-foreground ${selected ? 'bg-primary/15 text-primary' : ''}`}
								>
									{pipe(
										Match.value(diff.status),
										Match.when('added', () => (
											<span className="text-center font-semibold text-[10px] text-emerald-600 dark:text-emerald-400">
												A
											</span>
										)),
										Match.when('deleted', () => (
											<span className="text-center font-semibold text-[10px] text-red-600 dark:text-red-400">D</span>
										)),
										Match.when('renamed', () => (
											<span className="text-center font-semibold text-[10px] text-sky-600 dark:text-sky-400">R</span>
										)),
										Match.when('modified', () => (
											<span className="text-center font-semibold text-[10px] text-amber-600 dark:text-amber-400">
												M
											</span>
										)),
										Match.exhaustive
									)}
									<FileIcon filePath={diff.filePath} className="size-3" />
									<span className="min-w-0 truncate">{diff.filePath}</span>
								</button>
							</li>
						)
					})
				)}
			</TreeExplorerSection>
		</TreeExplorer>
	)
}
