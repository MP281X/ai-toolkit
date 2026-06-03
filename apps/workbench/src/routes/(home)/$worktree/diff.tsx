import {useAtomRefresh, useAtomSet, useAtomSuspense, useAtomValue} from '@effect/atom-react'

import {Array, Effect, Match, Option, Predicate, Schema, Stream, String, pipe} from 'effect'

import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition, useEffect, useState, type MouseEvent} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
import {ReviewComment, ReviewState, type ReviewMark} from '#rpcs/contracts.ts'
import {Loading} from '@deslop/components/fallbacks'
import {
	CheckIcon,
	BrushCleaningIcon,
	CopyIcon,
	ExternalLinkIcon,
	FileIcon,
	FolderIcon,
	GitPullRequestArrowIcon,
	Loader2Icon,
	MinusIcon
} from '@deslop/components/icons'
import {PatchDiff, formatCopiedComment} from '@deslop/components/render/diff'
import {TreeExplorer, TreeExplorerRow, TreeExplorerSection} from '@deslop/components/tree-explorer'
import {Button} from '@deslop/components/ui/button'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@deslop/components/ui/dialog'
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput} from '@deslop/components/ui/input-group'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@deslop/components/ui/resizable'
import {toast} from '@deslop/components/ui/sonner'
import {cn} from '@deslop/components/utils'
import type {GitCommit, GitDiff, GitHubReviewThread} from '@deslop/git/schema'

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
	| {readonly from: 'HEAD'; readonly type: 'head-to-worktree'}
	| {readonly commit: string; readonly from: string; readonly type: 'commit-to-worktree'}

const reviewDiffsAtom = Atom.family((input: {readonly cwd: string; readonly target: ReviewTarget}) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client =>
					client('review.watchRange', {
						cwd: input.cwd,
						from: {ref: input.target.from, type: 'ref'},
						to: {type: 'worktree'}
					})
				),
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
	readonly resolved: boolean
	readonly resolving?: boolean
	readonly source: 'github' | 'local'
	readonly threadId?: string
	readonly url?: string
}

const emptyReviewState = new ReviewState({comments: Array.empty(), marks: Array.empty()})

const reviewStateValueAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.map(reviewStateAtom(input), result => (result._tag === 'Success' ? result.value : emptyReviewState))
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
					new ReviewComment({...comment, resolved: false})
				),
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

const reviewActionsStateAtom = Atom.family(() =>
	Atom.optimistic(Atom.make(() => Effect.succeed({committing: false, wipping: false})))
)

const commitReviewActionAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.optimisticFn(reviewActionsStateAtom(input.cwd), {
		fn: RpcClient.runtime.fn<string>()(
			Effect.fnUntraced(function* (message) {
				const client = yield* RpcClient
				return yield* client('review.commitAndPush', {base: input.base, cwd: input.cwd, message})
			})
		),
		reducer: state => ({...state, committing: true})
	})
)

const wipReviewActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(reviewActionsStateAtom(cwd), {
		fn: RpcClient.runtime.fn<string>()(
			Effect.fnUntraced(function* (message) {
				const client = yield* RpcClient
				return yield* client('review.createWipCommit', {cwd, message})
			})
		),
		reducer: state => ({...state, wipping: true})
	})
)

type ResolveCommentInput = {readonly comment: DisplayComment; readonly key: string}

const commentResolutionStateAtom = Atom.family(() =>
	Atom.optimistic(Atom.make(() => ({resolvingAll: false, resolvingKeys: new Set<string>()})))
)

const resolveCommentActionAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.optimisticFn(commentResolutionStateAtom(input.cwd), {
		fn: RpcClient.runtime.fn<ResolveCommentInput>()(
			Effect.fnUntraced(function* (resolveInput) {
				const client = yield* RpcClient

				if (resolveInput.comment.source === 'github') {
					if (Predicate.isNotUndefined(resolveInput.comment.threadId)) {
						yield* client('review.githubThreads.resolve', {cwd: input.cwd, threadId: resolveInput.comment.threadId})
					}
					return
				}

				yield* client('review.comments.resolve', {
					base: input.base,
					cwd: input.cwd,
					filePath: resolveInput.comment.filePath,
					lineNumber: resolveInput.comment.lineNumber,
					side: resolveInput.comment.side
				})
			})
		),
		reducer: (state, {key}) => ({
			resolvingAll: state.resolvingAll,
			resolvingKeys: new Set([...state.resolvingKeys, key])
		})
	})
)

const resolveCommentsActionAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.optimisticFn(commentResolutionStateAtom(input.cwd), {
		fn: RpcClient.runtime.fn<readonly ResolveCommentInput[]>()(
			Effect.fnUntraced(function* (comments) {
				const client = yield* RpcClient

				yield* pipe(
					comments,
					Array.flatMap(resolveInput =>
						resolveInput.comment.source === 'github' && Predicate.isNotUndefined(resolveInput.comment.threadId)
							? [resolveInput.comment.threadId]
							: Array.empty<string>()
					),
					Array.dedupe,
					Effect.forEach(threadId => client('review.githubThreads.resolve', {cwd: input.cwd, threadId}))
				)
				yield* pipe(
					comments,
					Array.filter(resolveInput => resolveInput.comment.source === 'local'),
					Effect.forEach(resolveInput =>
						client('review.comments.resolve', {
							base: input.base,
							cwd: input.cwd,
							filePath: resolveInput.comment.filePath,
							lineNumber: resolveInput.comment.lineNumber,
							side: resolveInput.comment.side
						})
					)
				)
			})
		),
		reducer: (state, comments) => ({
			resolvingAll: true,
			resolvingKeys: new Set([...state.resolvingKeys, ...Array.map(comments, comment => comment.key)])
		})
	})
)

function groupCommentsByFile<Comment extends {readonly filePath: string}>(comments: readonly Comment[]) {
	const groups = new Map<string, {comments: Comment[]; filePath: string}>()

	for (const comment of comments) {
		const key = comment.filePath
		const group = groups.get(key)

		if (group) {
			group.comments.push(comment)
		} else {
			groups.set(key, {comments: [comment], filePath: comment.filePath})
		}
	}

	return Array.fromIterable(groups.values())
}

async function copyComments(commentsToCopy: readonly DisplayComment[]) {
	await navigator.clipboard.writeText(pipe(commentsToCopy, Array.map(formatCopiedComment), Array.join('\n\n')))
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
	const reviewStateResult = useAtomValue(reviewStateAtom({base, cwd: input.cwd}))
	const githubThreadsResult = useAtomValue(githubThreadsAtom(input.cwd))
	const reviewStateLoaded = reviewStateResult._tag === 'Success'
	const reviewStateValue = useAtomValue(optimisticReviewStateAtom({base, cwd: input.cwd}))
	const comments = reviewStateLoaded ? reviewStateValue.comments : Array.empty<QueuedComment>()
	const githubThreads =
		githubThreadsResult._tag === 'Success' ? githubThreadsResult.value : Array.empty<GitHubReviewThread>()
	const [shortcutsOpen, setShortcutsOpen] = useState(false)
	const selectedCommit = pipe(
		suggestedMetadata.value.commits,
		Array.findFirst(commit => commit.hash === search.commit),
		Option.getOrUndefined
	)
	const reviewTarget: ReviewTarget = selectedCommit
		? {
				commit: selectedCommit.hash,
				from: selectedCommit.parents[0] ?? `${selectedCommit.hash}^`,
				type: 'commit-to-worktree'
			}
		: {from: 'HEAD', type: 'head-to-worktree'}
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
	const resolveComment = useAtomSet(resolveCommentActionAtom({base, cwd: input.cwd}), {mode: 'promise'})
	const resolveComments = useAtomSet(resolveCommentsActionAtom({base, cwd: input.cwd}), {mode: 'promise'})
	const commentResolutionState = useAtomValue(commentResolutionStateAtom(input.cwd))
	const markReviewed = useAtomSet(markReviewedAtom({base, cwd: input.cwd}), {mode: 'promise'})
	const unmarkReviewed = useAtomSet(unmarkReviewedAtom({base, cwd: input.cwd}), {mode: 'promise'})
	const hasWipCommits = pipe(
		suggestedMetadata.value.commits,
		Array.head,
		Option.exists(commit => commit.wip)
	)
	const effectiveComments: readonly DisplayComment[] = Array.appendAll(
		Array.map(comments, comment => ({
			...comment,
			resolved: comment.resolved === true,
			resolving: commentResolutionState.resolvingKeys.has(commentKey(comment)),
			source: 'local' as const
		})),
		Array.map(githubThreads, comment => ({
			...comment,
			resolving: commentResolutionState.resolvingKeys.has(commentKey(comment)),
			source: 'github' as const,
			threadId: comment.id
		}))
	)
	const unresolvedComments = Array.filter(effectiveComments, comment => !comment.resolved)
	const unresolvedCommentInputs = Array.map(unresolvedComments, comment => ({comment, key: commentKey(comment)}))
	const commentsByFile = groupCommentsByFile(unresolvedComments)
	const selectedEntryComments = selectedEntry
		? Array.filter(unresolvedComments, comment => comment.filePath === selectedEntry.filePath)
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
	useEffect(() => {
		const firstFilePath = reviewDiffsValue[0]?.filePath

		if (Predicate.isUndefined(firstFilePath)) {
			if (String.isNonEmpty(selectedFilePath)) setSelectedFilePath('')
			return
		}

		if (!Array.some(reviewDiffsValue, diff => diff.filePath === selectedFilePath)) {
			setSelectedFilePath(firstFilePath)
		}
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
		void (async () => {
			try {
				await markReviewed(marks)
			} catch {
				toast.error('Failed to mark file reviewed.')
			}
		})()
	}

	function unmarkFileReviewed(marks: readonly ReviewMark[]) {
		void (async () => {
			try {
				await unmarkReviewed(marks)
			} catch {
				toast.error('Failed to unmark file reviewed.')
			}
		})()
	}

	function saveQueuedComment(comment: QueuedComment) {
		void (async () => {
			try {
				await saveComment(comment)
			} catch {
				toast.error('Failed to save comment.')
			}
		})()
	}

	function resolveReviewComment(comment: DisplayComment) {
		void (async () => {
			try {
				await resolveComment({comment, key: commentKey(comment)})
				if (comment.source === 'github') refreshGithubThreads()
			} catch {
				toast.error(comment.source === 'github' ? 'Failed to resolve GitHub thread.' : 'Failed to resolve comment.')
			}
		})()
	}

	function resolveReviewComments(commentsToResolve: readonly ResolveCommentInput[]) {
		void (async () => {
			try {
				await resolveComments(commentsToResolve)
				refreshGithubThreads()
			} catch {
				toast.error('Failed to resolve comment.')
			}
		})()
	}

	useHotkey({key: 'C', shift: true}, () => void copyComments(unresolvedComments), {
		enabled: !Array.isReadonlyArrayEmpty(unresolvedComments),
		preventDefault: true
	})
	useHotkey({key: '?', shift: true}, () => {
		setShortcutsOpen(true)
	})

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
							dirty={suggestedMetadata.value.dirty}
							hasWipCommits={hasWipCommits}
							prUrl={suggestedMetadata.value.prUrl}
							refreshReview={refreshReview}
						/>
						<ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
							<ResizablePanel defaultSize="55%" minSize="15%">
								<div className="h-full min-h-0">
									{reviewDiffsLoaded ? (
										<DiffList
											diffs={reviewDiffsValue}
											marks={validReviewMarks}
											markReviewed={markFileReviewed}
											unmarkReviewed={unmarkFileReviewed}
											selectedEntry={selectedEntry}
											openReviewEntry={openFile}
										/>
									) : (
										<PaneLoading />
									)}
								</div>
							</ResizablePanel>
							<ResizableHandle />
							<ResizablePanel defaultSize="45%" minSize="15%">
								<div className="h-full min-h-0">
									<CommitList
										commits={suggestedMetadata.value.commits}
										selected={reviewTarget}
										selectCommit={selectCommit}
										selectHead={() => {
											selectTarget({from: 'HEAD', type: 'head-to-worktree'})
										}}
									/>
								</div>
							</ResizablePanel>
						</ResizablePanelGroup>
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
												resolved: false,
												side: comment.side
											})
										}}
										onResolveComment={comment => {
											resolveReviewComment({
												...comment,
												resolved: comment.resolved === true,
												source: comment.source ?? 'local'
											})
										}}
									/>
								</div>
							)}
						</div>
						{!Array.isReadonlyArrayEmpty(unresolvedComments) && (
							<footer className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t px-2">
								<div className="flex min-w-0 items-center gap-1 overflow-hidden">
									{Array.map(commentsByFile, group => (
										<Button
											key={group.filePath}
											type="button"
											variant="outline"
											size="xs"
											aria-label={`Open ${group.filePath}`}
											title={group.filePath}
											onClick={() => {
												openFile(group.filePath)
											}}
										>
											<FileIcon filePath={group.filePath} />
											<span className="max-w-32 truncate">
												{pipe(
													String.split('/')(group.filePath),
													Array.last,
													Option.getOrElse(() => group.filePath)
												)}
											</span>
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
										onClick={() => void copyComments(unresolvedComments)}
									>
										<CopyIcon />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Resolve all comments"
										title="Resolve all comments"
										disabled={
											commentResolutionState.resolvingAll ? true : Array.isReadonlyArrayEmpty(unresolvedCommentInputs)
										}
										onClick={() => {
											resolveReviewComments(unresolvedCommentInputs)
										}}
									>
										{commentResolutionState.resolvingAll ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
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
		actionStateResult._tag === 'Success' ? actionStateResult.value : {committing: false, wipping: false}
	const commit = useAtomSet(commitReviewActionAtom({base: input.base, cwd: input.cwd}), {mode: 'promise'})
	const wip = useAtomSet(wipReviewActionAtom(input.cwd), {mode: 'promise'})
	const trimmedCommitMessage = pipe(commitMessage, String.trim)
	const missingMessage = String.isEmpty(trimmedCommitMessage)
	const commitDisabled = actionState.committing || missingMessage || (!input.dirty && !input.hasWipCommits)
	const wipDisabled = actionState.wipping || !input.dirty

	async function submit() {
		if (commitDisabled) return

		await commit(trimmedCommitMessage)
		setCommitMessage('')
		input.refreshReview()
	}

	async function createWip() {
		if (wipDisabled) return

		await wip(trimmedCommitMessage)
		setCommitMessage('')
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
						aria-label="Commit and push"
						disabled={commitDisabled}
						title="Commit and push"
					>
						{actionState.committing ? <Loader2Icon className="animate-spin" /> : <GitPullRequestArrowIcon />}
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
			<div className="inline-flex shrink-0 items-center">
				<Button
					type="button"
					variant="outline"
					size="icon"
					aria-label="Create WIP commit"
					title="Create WIP commit"
					disabled={wipDisabled}
					className="border-r-0"
					onClick={() => void createWip()}
				>
					{actionState.wipping ? <Loader2Icon className="animate-spin" /> : <BrushCleaningIcon />}
				</Button>
				<Button
					type="button"
					variant="outline"
					size="icon"
					aria-label="Open PR"
					title="Open PR"
					disabled={Predicate.isUndefined(input.prUrl)}
					onClick={() => {
						if (Predicate.isNotUndefined(input.prUrl)) window.open(input.prUrl, '_blank', 'noopener,noreferrer')
					}}
				>
					<ExternalLinkIcon />
				</Button>
			</div>
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
