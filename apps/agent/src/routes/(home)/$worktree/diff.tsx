import {useAtomRefresh, useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Effect, Match, Option, Schema, Stream, String, pipe} from 'effect'

import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition, useEffect, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
import {CopyIcon, FileIcon, FolderIcon, GitCompareIcon, TrashIcon, UploadIcon} from '@ai-toolkit/components/icons'
import {PatchDiff} from '@ai-toolkit/components/render/diff'
import {TreeExplorer, TreeExplorerRow, TreeExplorerSection} from '@ai-toolkit/components/tree-explorer'
import {Button} from '@ai-toolkit/components/ui/button'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@ai-toolkit/components/ui/dialog'
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput} from '@ai-toolkit/components/ui/input-group'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import {toast} from '@ai-toolkit/components/ui/sonner'
import {cn} from '@ai-toolkit/components/utils'
import type {GitCommit, GitDiff} from '@ai-toolkit/git/schema'

export const Route = createFileRoute('/(home)/$worktree/diff')({
	component: DiffPage,
	validateSearch: Schema.toStandardSchemaV1(Schema.Struct({commit: Schema.optional(Schema.String)}))
})

const suggestedMetadataAtom = Atom.family((cwd: string) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.flatMap(client => client('review.metadata', {cwd}))
		)
	)
)

const metadataAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.flatMap(client => client('review.metadata', input))
		)
	)
)

type ReviewTarget =
	| {readonly type: 'head-to-worktree'}
	| {readonly commit: string; readonly from: string; readonly type: 'commit-to-worktree'}

function targetKey(target: ReviewTarget) {
	return pipe(
		Match.value(target),
		Match.when({type: 'head-to-worktree'}, () => 'head-to-worktree' as const),
		Match.when({type: 'commit-to-worktree'}, current => `worktree:${current.commit}`),
		Match.exhaustive
	)
}

function rangeForTarget(target: ReviewTarget) {
	return pipe(
		Match.value(target),
		Match.when({type: 'head-to-worktree'}, () => ({from: {ref: 'HEAD', type: 'ref'}, to: {type: 'worktree'}}) as const),
		Match.when(
			{type: 'commit-to-worktree'},
			current => ({from: {ref: current.from, type: 'ref'}, to: {type: 'worktree'}}) as const
		),
		Match.exhaustive
	)
}

const reviewDiffsAtom = Atom.family((input: {readonly cwd: string; readonly target: ReviewTarget}) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client => client('review.watchRange', {cwd: input.cwd, ...rangeForTarget(input.target)})),
				Stream.unwrap
			)
		)
	)
)

export type QueuedComment = {
	readonly filePath: string
	readonly lineNumber: number
	readonly side?: 'additions' | 'deletions'
	readonly body: string
	readonly scope: string
}

function groupCommentsByFile(comments: readonly QueuedComment[]) {
	const groups = new Map<string, {comments: QueuedComment[]; filePath: string; key: string; scope: string}>()

	for (const comment of comments) {
		const key = `${comment.scope}:${comment.filePath}`
		const group = groups.get(key)

		if (group) {
			group.comments.push(comment)
		} else {
			groups.set(key, {comments: [comment], filePath: comment.filePath, key, scope: comment.scope})
		}
	}

	return Array.fromIterable(groups.values())
}

function DiffPage() {
	const params = Route.useParams()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return

	return <ReviewViewPanel key={activeHome.value.activeWorktree.root} cwd={activeHome.value.activeWorktree.root} />
}

function ReviewViewPanel(input: {readonly cwd: string}) {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const suggestedMetadata = useAtomSuspense(suggestedMetadataAtom(input.cwd))
	const [base] = useState(suggestedMetadata.value.base)
	const metadata = useAtomSuspense(metadataAtom({base, cwd: input.cwd}))
	const [comments, setComments] = useState<readonly QueuedComment[]>(Array.empty())
	const [shortcutsOpen, setShortcutsOpen] = useState(false)
	const selectedCommit = pipe(
		metadata.value.commits,
		Array.findFirst(commit => commit.hash === search.commit),
		Option.getOrUndefined
	)
	const reviewTarget: ReviewTarget = selectedCommit
		? {
				commit: selectedCommit.hash,
				from: selectedCommit.parents[0] ?? `${selectedCommit.hash}^`,
				type: 'commit-to-worktree'
			}
		: {type: 'head-to-worktree'}
	const [selectedFilePath, setSelectedFilePath] = useState('')
	const reviewDiffs = useAtomSuspense(reviewDiffsAtom({cwd: input.cwd, target: reviewTarget}))
	const selectedEntry =
		pipe(
			reviewDiffs.value,
			Array.findFirst(diff => diff.filePath === selectedFilePath),
			Option.getOrUndefined
		) ?? reviewDiffs.value[0]
	const refreshSuggestedMetadata = useAtomRefresh(suggestedMetadataAtom(input.cwd))
	const refreshMetadata = useAtomRefresh(metadataAtom({base, cwd: input.cwd}))
	const refreshDiffs = useAtomRefresh(reviewDiffsAtom({cwd: input.cwd, target: reviewTarget}))
	const hasWipCommits = Array.some(metadata.value.commits, commit => commit.wip)

	useEffect(() => {
		const firstFilePath = reviewDiffs.value[0]?.filePath

		if (firstFilePath === undefined) {
			if (String.isNonEmpty(selectedFilePath)) setSelectedFilePath('')
			return
		}

		if (!Array.some(reviewDiffs.value, diff => diff.filePath === selectedFilePath)) setSelectedFilePath(firstFilePath)
	}, [reviewDiffs.value, selectedFilePath])

	function selectTarget(target: ReviewTarget) {
		startTransition(() => {
			void navigate({search: target.type === 'commit-to-worktree' ? {commit: target.commit} : {}})
		})
		setSelectedFilePath('')
	}

	function selectCommit(commit: GitCommit) {
		selectTarget({commit: commit.hash, from: commit.parents[0] ?? `${commit.hash}^`, type: 'commit-to-worktree'})
	}

	function refreshReview() {
		refreshSuggestedMetadata()
		refreshMetadata()
		refreshDiffs()
	}

	useHotkey({key: 'C', shift: true}, () => void copyComments(comments), {
		enabled: !Array.isReadonlyArrayEmpty(comments),
		preventDefault: true
	})
	useHotkey({key: '?', shift: true}, () => {
		setShortcutsOpen(true)
	})

	async function copyComments(commentsToCopy: readonly QueuedComment[]) {
		await navigator.clipboard.writeText(
			pipe(
				groupCommentsByFile(commentsToCopy),
				Array.map(group =>
					Array.join(
						[
							`## ${group.filePath}`,
							pipe(
								group.comments,
								Array.map(
									comment =>
										`- ${comment.side === 'deletions' ? 'deleted' : 'line'}:${comment.lineNumber}: ${comment.body}`
								),
								Array.join('\n\n')
							)
						],
						'\n\n'
					)
				),
				Array.prepend('# Review comments'),
				Array.join('\n\n')
			)
		)
		setComments(current =>
			Array.filter(
				current,
				comment =>
					!new Set(
						Array.map(
							commentsToCopy,
							commentToCopy =>
								`${commentToCopy.scope}:${commentToCopy.filePath}:${commentToCopy.side === 'deletions' ? 'deletions' : 'file'}:${commentToCopy.lineNumber}`
						)
					).has(
						`${comment.scope}:${comment.filePath}:${comment.side === 'deletions' ? 'deletions' : 'file'}:${comment.lineNumber}`
					)
			)
		)
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
							<kbd className="border px-1.5 py-0.5 text-center">Shift+C</kbd>
							<span>Copy all queued comments</span>
						</div>
					</div>
				</DialogContent>
			</Dialog>
			<ResizablePanelGroup orientation="horizontal">
				<ResizablePanel defaultSize="34%" minSize="24%" maxSize="46%">
					<div className="flex h-full flex-col border-r">
						<CommitActionForm
							base={base}
							cwd={input.cwd}
							dirty={metadata.value.dirty}
							hasWipCommits={hasWipCommits}
							refreshReview={refreshReview}
						/>
						<div className="min-h-0 flex-[1.2] border-b">
							<DiffList
								diffs={reviewDiffs.value}
								selectedEntry={selectedEntry}
								selectReviewEntry={setSelectedFilePath}
							/>
						</div>
						<div className="min-h-0 flex-1">
							<CommitList
								commits={metadata.value.commits}
								selected={reviewTarget}
								selectCommit={selectCommit}
								selectHead={() => {
									selectTarget({type: 'head-to-worktree'})
								}}
							/>
						</div>
					</div>
				</ResizablePanel>
				<ResizableHandle />
				<ResizablePanel defaultSize="66%" minSize="54%">
					<div className="bg-background flex h-full min-w-0 flex-col overflow-hidden">
						<div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
							{!selectedEntry && (
								<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
									No changed files.
								</div>
							)}
							{selectedEntry && (
								<div className="h-full min-h-0 min-w-0">
									<PatchDiff
										filePath={selectedEntry.filePath}
										patch={selectedEntry.patch}
										comments={Array.filter(
											comments,
											comment =>
												comment.scope === targetKey(reviewTarget) && comment.filePath === selectedEntry.filePath
										)}
										onSaveComment={comment => {
											setComments(current =>
												pipe(
													current,
													Array.filter(
														currentComment =>
															currentComment.scope !== targetKey(reviewTarget) ||
															currentComment.filePath !== comment.filePath ||
															currentComment.lineNumber !== comment.lineNumber ||
															(currentComment.side === 'deletions' ? 'deletions' : 'file') !==
																(comment.side === 'deletions' ? 'deletions' : 'file')
													),
													Array.append({...comment, scope: targetKey(reviewTarget)})
												)
											)
										}}
										onDeleteComment={comment => {
											setComments(current =>
												Array.filter(
													current,
													currentComment =>
														currentComment.scope !== targetKey(reviewTarget) ||
														currentComment.filePath !== comment.filePath ||
														currentComment.lineNumber !== comment.lineNumber ||
														(currentComment.side === 'deletions' ? 'deletions' : 'file') !==
															(comment.side === 'deletions' ? 'deletions' : 'file')
												)
											)
										}}
									/>
								</div>
							)}
						</div>
						{!Array.isReadonlyArrayEmpty(comments) && (
							<footer className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t px-2">
								<div className="flex min-w-0 items-center gap-1 overflow-hidden">
									{Array.map(groupCommentsByFile(comments), group => (
										<Button
											key={group.key}
											type="button"
											variant="outline"
											size="xs"
											aria-label={`Delete ${group.comments.length} queued comments for ${group.filePath}`}
											title={`Delete ${group.comments.length} comments for ${group.filePath}`}
											onClick={() => {
												setComments(current =>
													Array.filter(
														current,
														comment => comment.scope !== group.scope || comment.filePath !== group.filePath
													)
												)
											}}
										>
											<FileIcon filePath={group.filePath} />
											<span className="max-w-32 truncate">{group.filePath.split('/').at(-1) ?? group.filePath}</span>
										</Button>
									))}
								</div>
								<div className="flex h-8 shrink-0 items-center gap-1">
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Copy all queued comments"
										title="Copy all queued comments"
										onClick={() => void copyComments(comments)}
									>
										<CopyIcon />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className="text-destructive hover:text-destructive"
										aria-label="Delete all queued comments"
										title="Delete all queued comments"
										onClick={() => {
											setComments(Array.empty())
										}}
									>
										<TrashIcon />
									</Button>
								</div>
							</footer>
						)}
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
		</>
	)
}

function CommitActionForm(input: {
	readonly base: string
	readonly cwd: string
	readonly dirty: boolean
	readonly hasWipCommits: boolean
	readonly refreshReview: () => void
}) {
	const [commitMessage, setCommitMessage] = useState('')
	const createWipCommit = useAtomSet(RpcClient.mutation('review.createWipCommit'), {mode: 'promise'})
	const commitAndPush = useAtomSet(RpcClient.mutation('review.commitAndPush'), {mode: 'promise'})
	const trimmedCommitMessage = pipe(commitMessage, String.trim)
	const disabled = String.isEmpty(trimmedCommitMessage) || (!input.dirty && !input.hasWipCommits)
	const title = input.dirty ? 'Create WIP commit' : 'Squash WIP commits and push'

	async function submit() {
		if (disabled) return

		try {
			if (input.dirty) {
				await createWipCommit({payload: {cwd: input.cwd, message: trimmedCommitMessage}})
			} else {
				await commitAndPush({payload: {base: input.base, cwd: input.cwd, message: trimmedCommitMessage}})
			}
			setCommitMessage('')
			input.refreshReview()
		} catch {
			toast.error(input.dirty ? 'Failed to create WIP commit.' : 'Failed to commit and push.')
		}
	}

	return (
		<form
			className="grid gap-1 border-b p-2"
			onSubmit={event => {
				event.preventDefault()
				void submit()
			}}
		>
			<InputGroup>
				<InputGroupInput
					autoComplete="off"
					value={commitMessage}
					placeholder="commit message"
					onChange={event => {
						setCommitMessage(event.currentTarget.value)
					}}
				/>
				<InputGroupAddon align="inline-end">
					<InputGroupButton
						type="submit"
						variant="ghost"
						size="xs"
						aria-label={title}
						disabled={disabled}
						title={title}
					>
						{input.dirty ? <GitCompareIcon /> : <UploadIcon />}
						{input.dirty ? 'WIP' : 'Commit'}
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
		</form>
	)
}

function CommitList(input: {
	readonly commits: readonly GitCommit[]
	readonly selected: ReviewTarget
	readonly selectCommit: (commit: GitCommit) => void
	readonly selectHead: () => void
}) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<TreeExplorer className="min-h-0 flex-1 overflow-y-auto px-0 py-1">
				<TreeExplorerSection label="History" className="min-h-0 flex-1 [&>ul]:min-h-0 [&>ul]:flex-1">
					<li className="w-full min-w-0">
						<button
							type="button"
							aria-current={input.selected.type === 'head-to-worktree' ? 'page' : undefined}
							onClick={input.selectHead}
							className={cn(
								'text-muted-foreground hover:bg-muted hover:text-foreground grid h-8 w-full min-w-0 grid-cols-[minmax(0,1fr)_52px] items-center gap-2 px-2 text-left text-xs',
								input.selected.type === 'head-to-worktree' && 'bg-primary/15 text-primary'
							)}
						>
							<span className="min-w-0 truncate">HEAD</span>
							<span className="text-muted-foreground font-mono">worktree</span>
						</button>
					</li>
					{Array.map(input.commits, commit => {
						const selected = input.selected.type === 'commit-to-worktree' && input.selected.commit === commit.hash

						return (
							<li key={commit.hash} className="w-full min-w-0">
								<button
									type="button"
									aria-current={selected ? 'page' : undefined}
									onClick={() => {
										input.selectCommit(commit)
									}}
									className={cn(
										'text-muted-foreground hover:bg-muted hover:text-foreground grid h-8 w-full min-w-0 grid-cols-[minmax(0,1fr)_52px] items-center gap-2 px-2 text-left text-xs',
										selected && 'bg-primary/15 text-primary'
									)}
								>
									<span className="min-w-0 truncate">
										<span className={cn(commit.wip && 'text-amber-600 dark:text-amber-400')}>{commit.subject}</span>
									</span>
									<span className="text-muted-foreground font-mono">{commit.shortHash}</span>
								</button>
							</li>
						)
					})}
				</TreeExplorerSection>
			</TreeExplorer>
		</div>
	)
}

type FileTreeNode =
	| {readonly children: FileTreeNode[]; readonly name: string; readonly path: string; readonly type: 'directory'}
	| {readonly diff: GitDiff; readonly name: string; readonly path: string; readonly type: 'file'}

function buildFileTree(diffs: readonly GitDiff[]) {
	const root = {children: Array.empty<FileTreeNode>(), name: '', path: '', type: 'directory' as const}

	for (const diff of diffs) {
		const parts = diff.filePath.split('/')
		let directory = root

		for (const part of Array.dropRight(parts, 1)) {
			const path = directory.path ? `${directory.path}/${part}` : part
			const current = pipe(
				directory.children,
				Array.findFirst(child => child.name === part),
				Option.getOrUndefined
			)

			if (current?.type === 'directory') {
				directory = current
			} else {
				const next = {children: Array.empty<FileTreeNode>(), name: part, path, type: 'directory' as const}
				directory.children.push(next)
				directory = next
			}
		}

		directory.children.push({diff, name: parts.at(-1) ?? diff.filePath, path: diff.filePath, type: 'file'})
	}

	return pipe(
		root.children,
		Array.map(node => (node.type === 'directory' ? collapseSingleChildDirectory(node) : node))
	)
}

function collapseSingleChildDirectory(directory: Extract<FileTreeNode, {readonly type: 'directory'}>) {
	const child = directory.children[0]

	if (Array.length(directory.children) === 1 && child?.type === 'directory') {
		return collapseSingleChildDirectory({
			children: child.children,
			name: `${directory.name}/${child.name}`,
			path: child.path,
			type: 'directory'
		})
	}

	return directory
}

function DiffList(input: {
	readonly diffs: readonly GitDiff[]
	readonly selectedEntry?: GitDiff
	readonly selectReviewEntry: (filePath: string) => void
}) {
	const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(new Set())

	function toggleFolder(path: string) {
		setCollapsedFolders(current => {
			const next = new Set(current)
			if (next.has(path)) {
				next.delete(path)
			} else {
				next.add(path)
			}
			return next
		})
	}

	function renderNode(node: FileTreeNode) {
		if (node.type === 'directory') {
			const collapsed = collapsedFolders.has(node.path)

			return (
				<li key={node.path} className="w-full min-w-0">
					<TreeExplorerRow
						icon={<FolderIcon className="size-3.5 shrink-0" />}
						onClick={() => {
							toggleFolder(node.path)
						}}
						actions={<span className="text-muted-foreground text-[10px]">{Array.length(node.children)}</span>}
					>
						{node.name}
					</TreeExplorerRow>
					{!collapsed && (
						<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
							{Array.map(node.children, renderNode)}
						</ul>
					)}
				</li>
			)
		}

		return (
			<li key={node.path} className="w-full min-w-0">
				<TreeExplorerRow
					selected={input.selectedEntry?.filePath === node.diff.filePath}
					icon={<FileIcon filePath={node.diff.filePath} className="size-3" />}
					actions={<DiffStatus status={node.diff.status} />}
					onClick={() => {
						input.selectReviewEntry(node.diff.filePath)
					}}
				>
					{node.name}
				</TreeExplorerRow>
			</li>
		)
	}

	return (
		<TreeExplorer className="h-full overflow-y-auto px-0 py-1">
			<TreeExplorerSection label="Changed files" className="min-h-0 flex-1 [&>ul]:min-h-0 [&>ul]:flex-1">
				{Array.isReadonlyArrayEmpty(input.diffs) ? (
					<li className="text-muted-foreground flex flex-1 items-center justify-center px-2 py-2 text-xs">
						No changed files.
					</li>
				) : (
					Array.map(buildFileTree(input.diffs), renderNode)
				)}
			</TreeExplorerSection>
		</TreeExplorer>
	)
}

function DiffStatus(input: {readonly status: GitDiff['status']}) {
	return pipe(
		Match.value(input.status),
		Match.when('added', () => (
			<span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">A</span>
		)),
		Match.when('deleted', () => <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">D</span>),
		Match.when('renamed', () => <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400">R</span>),
		Match.orElse(() => <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">M</span>)
	)
}
