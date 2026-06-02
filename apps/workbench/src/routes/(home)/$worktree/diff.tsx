import {useAtomRefresh, useAtomSet, useAtomSuspense, useAtomValue} from '@effect/atom-react'

import {Array, Effect, Match, Option, Schema, Stream, String, pipe} from 'effect'

import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition, useEffect, useState, type MouseEvent} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
import {ReviewState, type ReviewComment, type ReviewMark} from '#rpcs/contracts.ts'
import {Loading} from '@deslop/components/fallbacks'
import {
	CheckIcon,
	CopyIcon,
	ExternalLinkIcon,
	FileIcon,
	FolderIcon,
	GitCompareIcon,
	Loader2Icon,
	MinusIcon,
	TrashIcon,
	UploadIcon
} from '@deslop/components/icons'
import {PatchDiff} from '@deslop/components/render/diff'
import {TreeExplorer, TreeExplorerRow, TreeExplorerSection} from '@deslop/components/tree-explorer'
import {Button} from '@deslop/components/ui/button'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@deslop/components/ui/dialog'
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput} from '@deslop/components/ui/input-group'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@deslop/components/ui/resizable'
import {toast} from '@deslop/components/ui/sonner'
import {cn} from '@deslop/components/utils'
import type {GitCommit, GitDiff} from '@deslop/git/schema'
import type {GitHubReviewThread} from '@deslop/git/schema'

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

type ReviewTarget =
	| {readonly type: 'head-to-worktree'}
	| {readonly commit: string; readonly from: string; readonly type: 'commit-to-worktree'}

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

const reviewStateAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client => client('review.state.watch', input)),
				Stream.unwrap
			)
		)
	)
)

const githubThreadsAtom = Atom.family((cwd: string) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.flatMap(client => client('review.githubThreads', {cwd}))
		)
	)
)

export type QueuedComment = typeof ReviewComment.Type

type DisplayComment = QueuedComment & {
	readonly source: 'github' | 'local'
	readonly threadId?: string
	readonly url?: string
}

function emptyReviewState() {
	return new ReviewState({comments: Array.empty(), marks: Array.empty()})
}

const reviewStateValueAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.map(reviewStateAtom(input), result => (result._tag === 'Success' ? result.value : emptyReviewState()))
)

const optimisticReviewStateAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.optimistic(reviewStateValueAtom(input))
)

const saveQueuedCommentAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.optimisticFn(optimisticReviewStateAtom(input), {
		fn: RpcClient.runtime.fn<QueuedComment>()(
			Effect.fnUntraced(function* (comment) {
				const client = yield* RpcClient
				return yield* client('review.comments.save', {base: input.base, comment, cwd: input.cwd})
			})
		),
		reducer: (state, comment: QueuedComment) => {
			const key = commentKey(comment)
			return new ReviewState({
				comments: Array.append(
					Array.filter(state.comments, currentComment => commentKey(currentComment) !== key),
					comment
				),
				marks: state.marks
			})
		}
	})
)

const deleteQueuedCommentAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.optimisticFn(optimisticReviewStateAtom(input), {
		fn: RpcClient.runtime.fn<Omit<QueuedComment, 'body'>>()(
			Effect.fnUntraced(function* (comment) {
				const client = yield* RpcClient
				return yield* client('review.comments.delete', {base: input.base, cwd: input.cwd, ...comment})
			})
		),
		reducer: (state, comment: Omit<QueuedComment, 'body'>) => {
			const key = commentKey(comment)
			return new ReviewState({
				comments: Array.filter(state.comments, currentComment => commentKey(currentComment) !== key),
				marks: state.marks
			})
		}
	})
)

const markReviewedAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.optimisticFn(optimisticReviewStateAtom(input), {
		fn: RpcClient.runtime.fn<readonly ReviewMark[]>()(
			Effect.fnUntraced(function* (marks) {
				const client = yield* RpcClient
				return yield* client('review.state.mark', {base: input.base, cwd: input.cwd, marks})
			})
		),
		reducer: (state, marks: readonly ReviewMark[]) => {
			const keys = new Set(Array.map(marks, markKey))
			return new ReviewState({
				comments: state.comments,
				marks: Array.appendAll(
					Array.filter(state.marks, mark => !keys.has(markKey(mark))),
					marks
				)
			})
		}
	})
)

const unmarkReviewedAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.optimisticFn(optimisticReviewStateAtom(input), {
		fn: RpcClient.runtime.fn<readonly ReviewMark[]>()(
			Effect.fnUntraced(function* (marks) {
				const client = yield* RpcClient
				return yield* client('review.state.unmark', {base: input.base, cwd: input.cwd, marks})
			})
		),
		reducer: (state, marks: readonly ReviewMark[]) => {
			const keys = new Set(Array.map(marks, markKey))
			return new ReviewState({
				comments: state.comments,
				marks: Array.filter(state.marks, mark => !keys.has(markKey(mark)))
			})
		}
	})
)

type ReviewActionsState = {readonly committing: boolean; readonly pushing: boolean}

const reviewActionsStateAtom = Atom.family(() =>
	Atom.optimistic(Atom.make(() => Effect.succeed<ReviewActionsState>({committing: false, pushing: false})))
)

const commitReviewActionAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.optimisticFn(reviewActionsStateAtom(input.cwd), {
		fn: RpcClient.runtime.fn<{readonly dirty: boolean; readonly message: string}>()(
			Effect.fnUntraced(function* (payload) {
				const client = yield* RpcClient
				if (payload.dirty) {
					return yield* client('review.createWipCommit', {cwd: input.cwd, message: payload.message})
				}

				return yield* client('review.commitAndPush', {base: input.base, cwd: input.cwd, message: payload.message})
			})
		),
		reducer: state => ({...state, committing: true})
	})
)

const publishReviewActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(reviewActionsStateAtom(cwd), {
		fn: RpcClient.runtime.fn<void>()(
			Effect.fnUntraced(function* () {
				const client = yield* RpcClient
				return yield* client('review.publish', {cwd})
			})
		),
		reducer: state => ({...state, pushing: true})
	})
)

function groupCommentsByFile(comments: readonly DisplayComment[]) {
	const groups = new Map<string, {comments: DisplayComment[]; filePath: string; key: string}>()

	for (const comment of comments) {
		const key = comment.filePath
		const group = groups.get(key)

		if (group) {
			group.comments.push(comment)
		} else {
			groups.set(key, {comments: [comment], filePath: comment.filePath, key})
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
	const metadata = suggestedMetadata
	const reviewStateResult = useAtomValue(reviewStateAtom({base, cwd: input.cwd}))
	const githubThreadsResult = useAtomValue(githubThreadsAtom(input.cwd))
	const reviewStateLoaded = reviewStateResult._tag === 'Success'
	const reviewStateValue = useAtomValue(optimisticReviewStateAtom({base, cwd: input.cwd}))
	const comments = reviewStateLoaded ? reviewStateValue.comments : Array.empty<QueuedComment>()
	const githubThreads =
		githubThreadsResult._tag === 'Success' ? githubThreadsResult.value : Array.empty<GitHubReviewThread>()
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
	const reviewDiffsResult = useAtomValue(reviewDiffsAtom({cwd: input.cwd, target: reviewTarget}))
	const reviewDiffsLoaded = reviewDiffsResult._tag === 'Success'
	const reviewDiffsValue = reviewDiffsLoaded ? reviewDiffsResult.value : Array.empty<GitDiff>()
	const selectedEntry =
		pipe(
			reviewDiffsValue,
			Array.findFirst(diff => diff.filePath === selectedFilePath),
			Option.getOrUndefined
		) ?? reviewDiffsValue[0]
	const refreshSuggestedMetadata = useAtomRefresh(suggestedMetadataAtom(input.cwd))
	const refreshDiffs = useAtomRefresh(reviewDiffsAtom({cwd: input.cwd, target: reviewTarget}))
	const refreshGithubThreads = useAtomRefresh(githubThreadsAtom(input.cwd))
	const saveComment = useAtomSet(saveQueuedCommentAtom({base, cwd: input.cwd}), {mode: 'promise'})
	const deleteComment = useAtomSet(deleteQueuedCommentAtom({base, cwd: input.cwd}), {mode: 'promise'})
	const markReviewed = useAtomSet(markReviewedAtom({base, cwd: input.cwd}), {mode: 'promise'})
	const unmarkReviewed = useAtomSet(unmarkReviewedAtom({base, cwd: input.cwd}), {mode: 'promise'})
	const resolveGithubThread = useAtomSet(RpcClient.mutation('review.githubThreads.resolve'), {mode: 'promise'})
	const hasWipCommits = Array.some(metadata.value.commits, commit => commit.wip)
	const effectiveComments: readonly DisplayComment[] = Array.appendAll(
		Array.map(comments, comment => ({...comment, source: 'local' as const})),
		Array.map(githubThreads, comment => ({...comment, source: 'github' as const, threadId: comment.id}))
	)
	const commentsByFile = groupCommentsByFile(effectiveComments)
	const selectedEntryComments = selectedEntry
		? Array.filter(effectiveComments, comment => comment.filePath === selectedEntry.filePath)
		: Array.empty()
	const visibleSegmentKeys = new Set(
		pipe(
			reviewDiffsValue,
			Array.flatMap(diff =>
				Array.map(diff.segments, segment =>
					markKey({filePath: segment.filePath, fingerprint: segment.fingerprint, segmentId: segment.id})
				)
			)
		)
	)
	const validReviewMarks = reviewStateLoaded
		? Array.filter(reviewStateValue.marks, mark => visibleSegmentKeys.has(markKey(mark)))
		: Array.empty()
	const effectiveReviewMarks = validReviewMarks

	useEffect(() => {
		const firstFilePath = reviewDiffsValue[0]?.filePath

		if (firstFilePath === undefined) {
			if (String.isNonEmpty(selectedFilePath)) setSelectedFilePath('')
			return
		}

		if (!Array.some(reviewDiffsValue, diff => diff.filePath === selectedFilePath)) openFile(firstFilePath)
	}, [reviewDiffsValue, selectedFilePath])

	function marksForFile(filePath: string) {
		return pipe(
			reviewDiffsValue,
			Array.findFirst(diff => diff.filePath === filePath),
			Option.map(marksForDiff),
			Option.getOrElse(() => Array.empty<ReviewMark>())
		)
	}

	function openFile(filePath: string) {
		setSelectedFilePath(filePath)
		const marks = marksForFile(filePath)
		if (!Array.isReadonlyArrayEmpty(marks)) markFileReviewed(marks)
	}

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
		refreshDiffs()
		refreshGithubThreads()
	}

	function markFileReviewed(marks: readonly ReviewMark[]) {
		void markReviewed(marks).catch(() => {
			toast.error('Failed to mark file reviewed.')
		})
	}

	function unmarkFileReviewed(marks: readonly ReviewMark[]) {
		void unmarkReviewed(marks).catch(() => {
			toast.error('Failed to unmark file reviewed.')
		})
	}

	function saveQueuedComment(comment: QueuedComment) {
		void saveComment(comment).catch(() => {
			toast.error('Failed to save comment.')
		})
	}

	function deleteQueuedComment(comment: Omit<QueuedComment, 'body'>) {
		void deleteComment(comment).catch(() => {
			toast.error('Failed to delete comment.')
		})
	}

	function resolveThread(threadId: string) {
		void resolveGithubThread({payload: {cwd: input.cwd, threadId}})
			.then(() => {
				refreshGithubThreads()
			})
			.catch(() => {
				toast.error('Failed to resolve GitHub thread.')
			})
	}

	useHotkey({key: 'C', shift: true}, () => void copyComments(effectiveComments), {
		enabled: !Array.isReadonlyArrayEmpty(effectiveComments),
		preventDefault: true
	})
	useHotkey({key: '?', shift: true}, () => {
		setShortcutsOpen(true)
	})

	async function copyComments(commentsToCopy: readonly DisplayComment[]) {
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
	}

	return (
		<>
			<Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Shortcuts</DialogTitle>
					</DialogHeader>
					<div className="grid gap-2">
						<div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
							<kbd className="border px-1.5 py-0.5 text-center">?</kbd>
							<span>Show shortcuts</span>
						</div>
						<div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
							<kbd className="border px-1.5 py-0.5 text-center">Shift+C</kbd>
							<span>Copy all comments</span>
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
							prUrl={metadata.value.prUrl}
							refreshReview={refreshReview}
						/>
						<div className="min-h-0 flex-[1.2] border-b">
							{reviewDiffsLoaded ? (
								<DiffList
									diffs={reviewDiffsValue}
									marks={effectiveReviewMarks}
									markReviewed={markFileReviewed}
									unmarkReviewed={unmarkFileReviewed}
									selectedEntry={selectedEntry}
									openReviewEntry={openFile}
								/>
							) : (
								<PaneLoading />
							)}
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
							{!reviewDiffsLoaded && <PaneLoading />}
							{reviewDiffsLoaded && !selectedEntry && (
								<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
									No changed files.
								</div>
							)}
							{reviewDiffsLoaded && selectedEntry && (
								<div className="h-full min-h-0 min-w-0">
									<PatchDiff
										filePath={selectedEntry.filePath}
										patch={selectedEntry.patch}
										comments={selectedEntryComments}
										onSaveComment={comment => {
											saveQueuedComment({
												body: comment.body,
												filePath: comment.filePath,
												lineNumber: comment.lineNumber,
												side: comment.side
											})
										}}
										onDeleteComment={comment => {
											if (comment.source === 'github') {
												if (comment.threadId) resolveThread(comment.threadId)
											} else {
												deleteQueuedComment({
													filePath: comment.filePath,
													lineNumber: comment.lineNumber,
													side: comment.side
												})
											}
										}}
									/>
								</div>
							)}
						</div>
						{!Array.isReadonlyArrayEmpty(effectiveComments) && (
							<footer className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t px-2">
								<div className="flex min-w-0 items-center gap-1 overflow-hidden">
									{Array.map(commentsByFile, group => (
										<Button
											key={group.key}
											type="button"
											variant="outline"
											size="xs"
											aria-label={`Open comments for ${group.filePath}`}
											title={`${group.comments.length} comments for ${group.filePath}`}
											onClick={() => {
												openFile(group.filePath)
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
										aria-label="Copy all comments"
										title="Copy all comments"
										onClick={() => void copyComments(effectiveComments)}
									>
										<CopyIcon />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className="text-destructive hover:text-destructive"
										aria-label="Resolve all comments"
										title="Resolve all comments"
										onClick={() => {
											const resolvedThreadIds = new Set<string>()
											for (const comment of effectiveComments) {
												if (
													comment.source === 'github' &&
													comment.threadId &&
													!resolvedThreadIds.has(comment.threadId)
												) {
													resolvedThreadIds.add(comment.threadId)
													resolveThread(comment.threadId)
												}
												if (comment.source === 'local') {
													deleteQueuedComment({
														filePath: comment.filePath,
														lineNumber: comment.lineNumber,
														side: comment.side
													})
												}
											}
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
	readonly prUrl?: string
	readonly refreshReview: () => void
}) {
	const [commitMessage, setCommitMessage] = useState('')
	const actionStateResult = useAtomValue(reviewActionsStateAtom(input.cwd))
	const actionState =
		actionStateResult._tag === 'Success' ? actionStateResult.value : {committing: false, pushing: false}
	const commit = useAtomSet(commitReviewActionAtom({base: input.base, cwd: input.cwd}), {mode: 'promise'})
	const publish = useAtomSet(publishReviewActionAtom(input.cwd), {mode: 'promise'})
	const trimmedCommitMessage = pipe(commitMessage, String.trim)
	const disabled = actionState.committing
		? true
		: String.isEmpty(trimmedCommitMessage)
			? true
			: !input.dirty && !input.hasWipCommits
	const title = input.dirty ? 'Create WIP commit' : 'Squash WIP commits'

	async function submit() {
		if (disabled) return

		await commit({dirty: input.dirty, message: trimmedCommitMessage})
		setCommitMessage('')
		input.refreshReview()
	}

	async function push() {
		if (actionState.pushing) return

		await publish()
		input.refreshReview()
	}

	return (
		<form
			className="flex items-center gap-1 border-b p-2"
			onSubmit={event => {
				event.preventDefault()
				void submit()
			}}
		>
			<InputGroup className="min-w-0 flex-1">
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
						size="icon-xs"
						aria-label={title}
						disabled={disabled}
						title={title}
					>
						{actionState.committing ? (
							<Loader2Icon className="animate-spin" />
						) : input.dirty ? (
							<GitCompareIcon />
						) : (
							<UploadIcon />
						)}
					</InputGroupButton>
					{input.prUrl && (
						<InputGroupButton
							type="button"
							variant="ghost"
							size="icon-xs"
							aria-label="Open PR"
							title="Open PR"
							onClick={() => {
								window.open(input.prUrl, '_blank', 'noopener,noreferrer')
							}}
						>
							<ExternalLinkIcon />
						</InputGroupButton>
					)}
				</InputGroupAddon>
			</InputGroup>
			<Button
				type="button"
				variant="outline"
				size="icon-sm"
				aria-label="Push"
				title="Push"
				disabled={actionState.pushing}
				onClick={() => void push()}
			>
				{actionState.pushing ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
			</Button>
		</form>
	)
}

function PaneLoading() {
	return (
		<div className="flex h-full min-h-0">
			<Loading />
		</div>
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
								'text-muted-foreground hover:bg-muted hover:text-foreground grid h-6 w-full min-w-0 grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 px-3 text-left',
								input.selected.type === 'head-to-worktree' && 'bg-primary/15 text-primary'
							)}
						>
							<span className="min-w-0 truncate">HEAD</span>
							<span className="text-muted-foreground min-w-0 truncate text-right">worktree</span>
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
										'text-muted-foreground hover:bg-muted hover:text-foreground grid h-6 w-full min-w-0 grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 px-3 text-left',
										selected && 'bg-primary/15 text-primary'
									)}
								>
									<span className="min-w-0 truncate">
										<span className={cn(commit.wip && 'text-amber-600 dark:text-amber-400')}>{commit.subject}</span>
									</span>
									<span className="text-muted-foreground min-w-0 truncate text-right">{commit.shortHash}</span>
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
	readonly markReviewed: (marks: readonly ReviewMark[]) => void
	readonly marks: readonly ReviewMark[]
	readonly openReviewEntry: (filePath: string) => void
	readonly selectedEntry?: GitDiff
	readonly unmarkReviewed: (marks: readonly ReviewMark[]) => void
}) {
	const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(new Set())
	const fileTree = buildFileTree(input.diffs)
	const marksByDiff = new Map<string, readonly ReviewMark[]>()

	for (const diff of input.diffs) {
		marksByDiff.set(diff.filePath, marksForDiff(diff))
	}

	const reviewedKeys = new Set(Array.map(input.marks, markKey))

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
						icon={<FolderIcon />}
						onClick={() => {
							toggleFolder(node.path)
						}}
						actions={<span className="text-muted-foreground">{Array.length(node.children)}</span>}
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

		const marks = marksByDiff.get(node.diff.filePath) ?? Array.empty()
		const state = reviewStateForMarks(marks, reviewedKeys)

		return (
			<li key={node.path} className="w-full min-w-0">
				<TreeExplorerRow
					selected={input.selectedEntry?.filePath === node.diff.filePath}
					icon={<FileIcon filePath={node.diff.filePath} className="size-3" />}
					actions={
						<div className="flex items-center gap-2">
							<ReviewCheckbox
								state={state}
								onClick={event => {
									event.stopPropagation()
									if (Array.isReadonlyArrayEmpty(marks)) return
									if (state === 'checked') {
										input.unmarkReviewed(marks)
									} else {
										input.markReviewed(marks)
									}
								}}
							/>
							<DiffStatus status={node.diff.status} />
						</div>
					}
					onClick={() => {
						input.openReviewEntry(node.diff.filePath)
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
					<li className="text-muted-foreground flex flex-1 items-center justify-center px-2 py-2">No changed files.</li>
				) : (
					Array.map(fileTree, renderNode)
				)}
			</TreeExplorerSection>
		</TreeExplorer>
	)
}

function marksForDiff(diff: GitDiff): readonly ReviewMark[] {
	return Array.map(diff.segments, segment => ({
		filePath: segment.filePath,
		fingerprint: segment.fingerprint,
		segmentId: segment.id
	}))
}

function markKey(input: {readonly filePath: string; readonly fingerprint: string; readonly segmentId: string}) {
	return `${input.filePath}:${input.segmentId}:${input.fingerprint}`
}

function commentKey(input: {
	readonly filePath: string
	readonly lineNumber: number
	readonly side?: 'additions' | 'deletions'
}) {
	return `${input.filePath}:${input.side ?? 'additions'}:${input.lineNumber}`
}

function reviewStateForMarks(segments: readonly ReviewMark[], reviewedKeys: ReadonlySet<string>) {
	const reviewed = Array.filter(segments, segment => reviewedKeys.has(markKey(segment)))

	if (Array.isReadonlyArrayEmpty(segments) || Array.isReadonlyArrayEmpty(reviewed)) return 'unchecked' as const
	if (Array.length(reviewed) === Array.length(segments)) return 'checked' as const

	return 'indeterminate' as const
}

function ReviewCheckbox(input: {
	readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void
	readonly state: 'checked' | 'indeterminate' | 'unchecked'
}) {
	return (
		<button
			type="button"
			aria-checked={input.state === 'indeterminate' ? 'mixed' : input.state === 'checked'}
			className={cn(
				'border-input text-primary-foreground flex size-3 shrink-0 items-center justify-center border',
				input.state !== 'unchecked' && 'border-primary bg-primary'
			)}
			role="checkbox"
			onClick={input.onClick}
		>
			{input.state === 'checked' && <CheckIcon className="size-2.5" />}
			{input.state === 'indeterminate' && <MinusIcon className="size-2.5" />}
		</button>
	)
}

function DiffStatus(input: {readonly status: GitDiff['status']}) {
	return pipe(
		Match.value(input.status),
		Match.when('added', () => <span className="text-emerald-600 dark:text-emerald-400">A</span>),
		Match.when('deleted', () => <span className="text-red-600 dark:text-red-400">D</span>),
		Match.when('renamed', () => <span className="text-sky-600 dark:text-sky-400">R</span>),
		Match.orElse(() => <span className="text-amber-600 dark:text-amber-400">M</span>)
	)
}
