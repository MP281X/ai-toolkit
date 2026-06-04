import {useAtomRefresh, useAtomSet, useAtomSuspense, useAtomValue} from '@effect/atom-react'

import {Array, Effect, Match, Option, Predicate, Schema, Stream, String, pipe} from 'effect'

import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition, useEffect, useState, type MouseEvent} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
import {Loading} from '@deslop/components/fallbacks'
import {
	CheckIcon,
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
import {
	GitReviewState,
	type GitCommit,
	type GitDiff,
	type GitHubReviewThread,
	type GitReviewComment,
	type GitReviewMark,
	type GitReviewTarget,
	gitReviewCommentKey,
	gitReviewMarkKey,
	gitReviewMarksForDiff,
	gitReviewStateForMarks,
	gitReviewStateMark,
	gitReviewStateSaveComment,
	gitReviewStateUnmark
} from '@deslop/git/schema'

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

const reviewDiffsAtom = Atom.family((input: {readonly cwd: string; readonly target: GitReviewTarget}) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('review.diffs', input)),
			Stream.unwrap
		)
	)
)

const reviewStateAtom = Atom.family((cwd: string) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('review.state.watch', {cwd})),
			Stream.unwrap
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

export type QueuedComment = typeof GitReviewComment.Type

type DisplayComment = QueuedComment & {
	readonly resolved: boolean
	readonly resolving?: boolean
	readonly source: 'github' | 'local'
	readonly threadId?: string
	readonly url?: string
}

const emptyReviewState = new GitReviewState({comments: Array.empty(), marks: Array.empty()})

const reviewStateValueAtom = Atom.family((cwd: string) =>
	Atom.map(reviewStateAtom(cwd), result => (result._tag === 'Success' ? result.value : emptyReviewState))
)

const optimisticReviewStateAtom = Atom.family((cwd: string) => Atom.optimistic(reviewStateValueAtom(cwd)))

const saveQueuedCommentAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(optimisticReviewStateAtom(cwd), {
		fn: RpcClient.runtime.fn<QueuedComment>()(
			Effect.fn('DiffPage.saveQueuedComment')(function* (comment) {
				const client = yield* RpcClient
				return yield* client('review.comments.save', {comment, cwd})
			})
		),
		reducer: (state, comment: QueuedComment) => gitReviewStateSaveComment(state, comment)
	})
)

const markReviewedAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(optimisticReviewStateAtom(cwd), {
		fn: RpcClient.runtime.fn<readonly GitReviewMark[]>()(
			Effect.fn('DiffPage.markReviewed')(function* (marks) {
				const client = yield* RpcClient
				return yield* client('review.state.mark', {cwd, marks})
			})
		),
		reducer: (state, marks: readonly GitReviewMark[]) => gitReviewStateMark(state, marks)
	})
)

const unmarkReviewedAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(optimisticReviewStateAtom(cwd), {
		fn: RpcClient.runtime.fn<readonly GitReviewMark[]>()(
			Effect.fn('DiffPage.unmarkReviewed')(function* (marks) {
				const client = yield* RpcClient
				return yield* client('review.state.unmark', {cwd, marks})
			})
		),
		reducer: (state, marks: readonly GitReviewMark[]) => gitReviewStateUnmark(state, marks)
	})
)

const reviewActionsStateAtom = Atom.family(() => Atom.optimistic(Atom.make(() => Effect.succeed({committing: false}))))

const commitReviewActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(reviewActionsStateAtom(cwd), {
		fn: RpcClient.runtime.fn<string>()(
			Effect.fn('DiffPage.commitReview')(function* (message) {
				const client = yield* RpcClient
				return yield* client('review.commitAndPush', {cwd, message})
			})
		),
		reducer: state => ({...state, committing: true})
	})
)

type ResolveCommentInput = {readonly comment: DisplayComment; readonly key: string}

const commentResolutionStateAtom = Atom.family(() =>
	Atom.optimistic(Atom.make(() => ({resolvingAll: false, resolvingKeys: new Set<string>()})))
)

const resolveCommentActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(commentResolutionStateAtom(cwd), {
		fn: RpcClient.runtime.fn<ResolveCommentInput>()(
			Effect.fn('DiffPage.resolveComment')(function* (resolveInput) {
				const client = yield* RpcClient

				if (resolveInput.comment.source === 'github') {
					if (Predicate.isNotUndefined(resolveInput.comment.threadId)) {
						yield* client('review.githubThreads.resolve', {cwd, threadId: resolveInput.comment.threadId})
					}
					return
				}

				yield* client('review.comments.resolve', {
					cwd,
					filePath: resolveInput.comment.filePath,
					lineNumber: resolveInput.comment.lineNumber,
					side: resolveInput.comment.side
				})
			})
		),
		reducer: (state, resolveInput) => ({
			resolvingAll: state.resolvingAll,
			resolvingKeys: new Set([...state.resolvingKeys, resolveInput.key])
		})
	})
)

const resolveCommentsActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(commentResolutionStateAtom(cwd), {
		fn: RpcClient.runtime.fn<readonly ResolveCommentInput[]>()(
			Effect.fn('DiffPage.resolveComments')(function* (comments) {
				const client = yield* RpcClient

				yield* pipe(
					comments,
					Array.flatMap(resolveInput =>
						resolveInput.comment.source === 'github' && Predicate.isNotUndefined(resolveInput.comment.threadId)
							? [resolveInput.comment.threadId]
							: Array.empty<string>()
					),
					Array.dedupe,
					Effect.forEach(threadId => client('review.githubThreads.resolve', {cwd, threadId}))
				)
				yield* pipe(
					comments,
					Array.filter(resolveInput => resolveInput.comment.source === 'local'),
					Effect.forEach(resolveInput =>
						client('review.comments.resolve', {
							cwd,
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
	const groups = new Map<string, Comment[]>()

	for (const comment of comments) {
		const group = groups.get(comment.filePath)
		if (group === undefined) {
			groups.set(comment.filePath, [comment])
		} else {
			group.push(comment)
		}
	}

	return pipe(
		Array.fromIterable(groups),
		Array.map(group => ({comments: group[1], filePath: group[0]}))
	)
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
	const githubThreadsResult = useAtomValue(githubThreadsAtom(input.cwd))
	const reviewStateValue = useAtomValue(optimisticReviewStateAtom(input.cwd))
	const comments = reviewStateValue.comments
	const githubThreadsLoaded = githubThreadsResult._tag === 'Success'
	const githubThreads = githubThreadsLoaded ? githubThreadsResult.value : Array.empty<GitHubReviewThread>()
	const shortcutsOpenState = useState(false)
	const selectedCommit = pipe(
		suggestedMetadata.value.commits,
		Array.findFirst(commit => commit.hash === search.commit),
		Option.getOrUndefined
	)
	const reviewTarget: GitReviewTarget = selectedCommit ? {_tag: 'commit', hash: selectedCommit.hash} : {_tag: 'head'}
	const selectedFilePathState = useState('')
	const reviewDiffsResult = useAtomValue(reviewDiffsAtom({cwd: input.cwd, target: reviewTarget}))
	const reviewDiffsLoaded = reviewDiffsResult._tag === 'Success'
	const reviewDiffsValue = reviewDiffsLoaded ? reviewDiffsResult.value : Array.empty<GitDiff>()
	const selectedEntry = String.isNonEmpty(selectedFilePathState[0])
		? pipe(
				reviewDiffsValue,
				Array.findFirst(diff => diff.filePath === selectedFilePathState[0]),
				Option.getOrUndefined
			)
		: undefined
	const refreshSuggestedMetadata = useAtomRefresh(suggestedMetadataAtom(input.cwd))
	const refreshDiffs = useAtomRefresh(reviewDiffsAtom({cwd: input.cwd, target: reviewTarget}))
	const refreshGithubThreads = useAtomRefresh(githubThreadsAtom(input.cwd))
	const saveComment = useAtomSet(saveQueuedCommentAtom(input.cwd), {mode: 'promise'})
	const resolveComment = useAtomSet(resolveCommentActionAtom(input.cwd), {mode: 'promise'})
	const resolveComments = useAtomSet(resolveCommentsActionAtom(input.cwd), {mode: 'promise'})
	const commentResolutionState = useAtomValue(commentResolutionStateAtom(input.cwd))
	const markReviewed = useAtomSet(markReviewedAtom(input.cwd), {mode: 'promise'})
	const unmarkReviewed = useAtomSet(unmarkReviewedAtom(input.cwd), {mode: 'promise'})
	const reviewedMarkKeysState = useState<ReadonlySet<string>>(new Set())
	const effectiveComments: readonly DisplayComment[] = Array.appendAll(
		Array.map(comments, comment => ({
			...comment,
			resolved: comment.resolved === true,
			resolving: commentResolutionState.resolvingKeys.has(gitReviewCommentKey(comment)),
			source: 'local' as const
		})),
		Array.map(githubThreads, comment => ({
			...comment,
			resolving: commentResolutionState.resolvingKeys.has(gitReviewCommentKey(comment)),
			source: 'github' as const,
			threadId: comment.id
		}))
	)
	const unresolvedComments = Array.filter(effectiveComments, comment => !comment.resolved)
	const unresolvedCommentInputs = Array.map(unresolvedComments, comment => ({
		comment,
		key: gitReviewCommentKey(comment)
	}))
	const commentsByFile = groupCommentsByFile(unresolvedComments)
	const selectedEntryComments = selectedEntry
		? Array.filter(unresolvedComments, comment => comment.filePath === selectedEntry.filePath)
		: Array.empty()
	const visibleSegmentKeys = new Set(
		pipe(
			reviewDiffsValue,
			Array.flatMap(diff =>
				Array.map(diff.segments, segment =>
					gitReviewMarkKey({filePath: segment.filePath, fingerprint: segment.fingerprint, segmentId: segment.id})
				)
			)
		)
	)
	const validReviewMarks = Array.filter(reviewStateValue.marks, mark => visibleSegmentKeys.has(gitReviewMarkKey(mark)))
	useEffect(() => {
		if (
			String.isNonEmpty(selectedFilePathState[0]) &&
			!Array.some(reviewDiffsValue, diff => diff.filePath === selectedFilePathState[0])
		) {
			selectedFilePathState[1]('')
		}
	})

	function openFile(filePath: string) {
		selectedFilePathState[1](filePath)
		const marks = pipe(
			reviewDiffsValue,
			Array.findFirst(diff => diff.filePath === filePath),
			Option.map(gitReviewMarksForDiff),
			Option.getOrElse(() => Array.empty<GitReviewMark>())
		)
		if (!Array.isReadonlyArrayEmpty(marks)) markFileReviewed(marks)
	}

	function selectTarget(target: GitReviewTarget) {
		startTransition(() => {
			void navigate({search: target._tag === 'commit' ? {commit: target.hash} : {}})
		})
		selectedFilePathState[1]('')
	}

	function refreshReview() {
		refreshSuggestedMetadata()
		refreshDiffs()
		refreshGithubThreads()
	}

	function markFileReviewed(marks: readonly GitReviewMark[]) {
		void (async () => {
			reviewedMarkKeysState[1](current => new Set([...current, ...Array.map(marks, gitReviewMarkKey)]))
			try {
				await markReviewed(marks)
			} catch {
				toast.error('Failed to mark file reviewed.')
			} finally {
				reviewedMarkKeysState[1](current => {
					const next = new Set(current)
					for (const mark of marks) next.delete(gitReviewMarkKey(mark))
					return next
				})
			}
		})()
	}

	function unmarkFileReviewed(marks: readonly GitReviewMark[]) {
		void (async () => {
			reviewedMarkKeysState[1](current => new Set([...current, ...Array.map(marks, gitReviewMarkKey)]))
			try {
				await unmarkReviewed(marks)
			} catch {
				toast.error('Failed to unmark file reviewed.')
			} finally {
				reviewedMarkKeysState[1](current => {
					const next = new Set(current)
					for (const mark of marks) next.delete(gitReviewMarkKey(mark))
					return next
				})
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
				await resolveComment({comment, key: gitReviewCommentKey(comment)})
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

	function copyResolveReviewComments(commentsToResolve: readonly ResolveCommentInput[]) {
		void (async () => {
			try {
				await navigator.clipboard.writeText(
					pipe(
						Array.map(commentsToResolve, resolveInput => resolveInput.comment),
						Array.map(formatCopiedComment),
						Array.join('\n\n')
					)
				)
				await resolveComments(commentsToResolve)
				refreshGithubThreads()
			} catch {
				toast.error('Failed to copy and resolve comments.')
			}
		})()
	}

	useHotkey(
		{key: 'C', shift: true},
		() => {
			copyResolveReviewComments(unresolvedCommentInputs)
		},
		{enabled: !Array.isReadonlyArrayEmpty(unresolvedComments), preventDefault: true}
	)
	useHotkey({key: '?', shift: true}, () => {
		shortcutsOpenState[1](true)
	})

	return (
		<>
			<Dialog open={shortcutsOpenState[0]} onOpenChange={shortcutsOpenState[1]}>
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
							cwd={input.cwd}
							dirty={suggestedMetadata.value.dirty}
							prUrl={suggestedMetadata.value.prUrl}
							refreshReview={refreshReview}
							unpushedCommits={suggestedMetadata.value.unpushedCommits}
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
											pendingMarkKeys={reviewedMarkKeysState[0]}
											selectedEntry={selectedEntry}
											openReviewEntry={openFile}
										/>
									) : (
										<div className="flex h-full min-h-0">
											<Loading />
										</div>
									)}
								</div>
							</ResizablePanel>
							<ResizableHandle />
							<ResizablePanel defaultSize="45%" minSize="15%">
								<div className="h-full min-h-0">
									<CommitList
										commits={suggestedMetadata.value.commits}
										selected={reviewTarget}
										selectCommit={commit => {
											selectTarget({_tag: 'commit', hash: commit.hash})
										}}
										selectHead={() => {
											selectTarget({_tag: 'head'})
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
							{!reviewDiffsLoaded && (
								<div className="flex h-full min-h-0">
									<Loading />
								</div>
							)}
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
						{(!githubThreadsLoaded || !Array.isReadonlyArrayEmpty(unresolvedComments)) && (
							<footer className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t px-2">
								<div className="flex min-w-0 items-center gap-1 overflow-hidden">
									{githubThreadsLoaded ? (
										Array.map(commentsByFile, group => (
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
										))
									) : (
										<Loader2Icon className="text-muted-foreground size-4 animate-spin" />
									)}
								</div>
								<div className="flex h-8 shrink-0 items-center gap-1">
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Copy all comments"
										title="Copy all comments"
										disabled={
											commentResolutionState.resolvingAll ? true : Array.isReadonlyArrayEmpty(unresolvedCommentInputs)
										}
										onClick={() => {
											copyResolveReviewComments(unresolvedCommentInputs)
										}}
									>
										{commentResolutionState.resolvingAll ? <Loader2Icon className="animate-spin" /> : <CopyIcon />}
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
	readonly cwd: string
	readonly dirty: boolean
	readonly prUrl?: string
	readonly refreshReview: () => void
	readonly unpushedCommits: boolean
}) {
	const commitMessageState = useState('')
	const actionStateResult = useAtomValue(reviewActionsStateAtom(input.cwd))
	const actionState = actionStateResult._tag === 'Success' ? actionStateResult.value : {committing: false}
	const commit = useAtomSet(commitReviewActionAtom(input.cwd), {mode: 'promise'})
	const trimmedCommitMessage = pipe(commitMessageState[0], String.trim)
	const missingMessage = String.isEmpty(trimmedCommitMessage)
	const commitDisabled =
		actionState.committing || (input.dirty && missingMessage) || (!input.dirty && !input.unpushedCommits)

	async function submit() {
		if (commitDisabled) return

		await commit(trimmedCommitMessage)
		commitMessageState[1]('')
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
					value={commitMessageState[0]}
					placeholder="commit message"
					onChange={event => {
						commitMessageState[1](event.currentTarget.value)
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

function CommitList(input: {
	readonly commits: readonly GitCommit[]
	readonly selected: GitReviewTarget
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
							aria-current={input.selected._tag === 'head' ? 'page' : undefined}
							onClick={input.selectHead}
							className={cn(
								'text-muted-foreground hover:bg-muted hover:text-foreground grid h-6 w-full min-w-0 grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 px-3 text-left',
								input.selected._tag === 'head' && 'bg-primary/15 text-primary'
							)}
						>
							<span className="min-w-0 truncate">HEAD</span>
							<span className="text-muted-foreground min-w-0 truncate text-right">worktree</span>
						</button>
					</li>
					{Array.map(input.commits, commit => {
						const selected = input.selected._tag === 'commit' && input.selected.hash === commit.hash

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
										<span>{commit.subject}</span>
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
	readonly markReviewed: (marks: readonly GitReviewMark[]) => void
	readonly marks: readonly GitReviewMark[]
	readonly openReviewEntry: (filePath: string) => void
	readonly pendingMarkKeys: ReadonlySet<string>
	readonly selectedEntry?: GitDiff
	readonly unmarkReviewed: (marks: readonly GitReviewMark[]) => void
}) {
	const collapsedFoldersState = useState<ReadonlySet<string>>(new Set())
	const fileTree = buildFileTree(input.diffs)
	const marksByDiff = new Map<string, readonly GitReviewMark[]>()

	for (const diff of input.diffs) {
		marksByDiff.set(diff.filePath, gitReviewMarksForDiff(diff))
	}

	const reviewedKeys = new Set(Array.map(input.marks, gitReviewMarkKey))

	function toggleFolder(path: string) {
		collapsedFoldersState[1](current => {
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
			const collapsed = collapsedFoldersState[0].has(node.path)

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
		const state = gitReviewStateForMarks(marks, reviewedKeys)
		const pending = Array.some(marks, mark => input.pendingMarkKeys.has(gitReviewMarkKey(mark)))

		return (
			<li key={node.path} className="w-full min-w-0">
				<TreeExplorerRow
					selected={input.selectedEntry?.filePath === node.diff.filePath}
					icon={<FileIcon filePath={node.diff.filePath} className="size-3" />}
					actions={
						<div className="flex items-center gap-2">
							<ReviewCheckbox
								loading={pending}
								state={state}
								onClick={event => {
									event.stopPropagation()
									if (pending || Array.isReadonlyArrayEmpty(marks)) return
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

function ReviewCheckbox(input: {
	readonly loading: boolean
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
			disabled={input.loading}
			onClick={input.onClick}
		>
			{input.loading ? <Loader2Icon className="size-2.5 animate-spin" /> : null}
			{!input.loading && input.state === 'checked' && <CheckIcon className="size-2.5" />}
			{!input.loading && input.state === 'indeterminate' && <MinusIcon className="size-2.5" />}
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
