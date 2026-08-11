import {useAtomRefresh, useAtomSet, useAtomSuspense, useAtomValue} from '@effect/atom-react'

import {Array, Effect, HashMap, HashSet, Match, Option, Predicate, Schema, Stream, String, pipe} from 'effect'

import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute} from '@tanstack/react-router'
import {AsyncResult, Atom} from 'effect/unstable/reactivity'
import {startTransition, useState, type MouseEvent} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
import {Loading} from '@deslop/components/fallbacks'
import {
	CheckIcon,
	CircleCheckIcon,
	CopyIcon,
	FileIcon,
	FolderIcon,
	MinusIcon,
	SparklesIcon,
	UploadIcon
} from '@deslop/components/icons'
import {PatchDiff, formatCopiedComment} from '@deslop/components/render/diff'
import {TreeExplorer, TreeExplorerRow, TreeExplorerSection} from '@deslop/components/tree-explorer'
import {Button} from '@deslop/components/ui/button'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@deslop/components/ui/dialog'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@deslop/components/ui/resizable'
import {toast} from '@deslop/components/ui/sonner'
import {Spinner} from '@deslop/components/ui/spinner'
import {cn, formatError} from '@deslop/components/utils'
import {
	GitReviewState,
	type GitCommit,
	type GitDiff,
	GitReviewComment,
	type GitReviewCommentDraft,
	GitReviewBranchTarget,
	GitReviewChangesTarget,
	GitReviewCommitTarget,
	GitReviewLocalTarget,
	type GitReviewMark,
	GitReviewTarget,
	gitReviewMarksForDiff,
	gitReviewStateForMarks
} from '@deslop/git/schema'

export const Route = createFileRoute('/(home)/$worktree/diff')({
	component: DiffPage,
	validateSearch: Schema.toStandardSchemaV1(Schema.Struct({commit: Schema.optional(Schema.String)}))
})

const suggestedMetadataAtom = Atom.family((cwd: string) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('review.metadata', {cwd})),
			Stream.unwrap
		)
	)
)

type ReviewDiffsKey = typeof ReviewDiffsKey.Type
const ReviewDiffsKey = Schema.Struct({cwd: Schema.String, target: GitReviewTarget})

const reviewDiffsAtom = Atom.family((input: ReviewDiffsKey) =>
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
			Effect.map(client => client('review.state', {cwd})),
			Stream.unwrap
		)
	)
)

const reviewStateValueAtom = Atom.family((cwd: string) =>
	Atom.map(reviewStateAtom(cwd), result =>
		AsyncResult.isSuccess(result) ? result.value : GitReviewState.make({comments: Array.empty(), marks: Array.empty()})
	)
)

const reviewActionsStateAtom = Atom.family(() =>
	Atom.optimistic(Atom.make(() => ({checkpointing: false, generatingMessage: false, publishing: false})))
)

const generatePublishMessageActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(reviewActionsStateAtom(cwd), {
		fn: RpcClient.runtime.fn<null>()(
			Effect.fn('DiffPage.generatePublishMessage')(function* (_) {
				const client = yield* RpcClient
				return yield* client('publish.message.generate', {cwd})
			})
		),
		reducer: state => ({...state, generatingMessage: true})
	})
)

const publishActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(reviewActionsStateAtom(cwd), {
		fn: RpcClient.runtime.fn<string>()(
			Effect.fn('DiffPage.publish')(function* (message) {
				const client = yield* RpcClient
				return yield* client('publish.publish', {cwd, message})
			})
		),
		reducer: state => ({...state, publishing: true})
	})
)

const checkpointActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(reviewActionsStateAtom(cwd), {
		fn: RpcClient.runtime.fn<null>()(
			Effect.fn('DiffPage.checkpoint')(function* (_) {
				const client = yield* RpcClient
				return yield* client('publish.checkpoint', {cwd})
			})
		),
		reducer: state => ({...state, checkpointing: true})
	})
)

const commentResolutionStateAtom = Atom.family(() =>
	Atom.optimistic(Atom.make(() => ({resolving: HashSet.empty<GitReviewComment>(), resolvingAll: false})))
)

const resolveCommentActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(commentResolutionStateAtom(cwd), {
		fn: RpcClient.runtime.fn<{comment: GitReviewComment & {source: 'github' | 'local'}}>()(
			Effect.fn('DiffPage.resolveComment')(function* (resolveInput) {
				const client = yield* RpcClient

				yield* client('review.comments.resolve', {comments: [resolveInput.comment], cwd})
			})
		),
		reducer: (state, resolveInput) => ({
			resolving: HashSet.add(state.resolving, GitReviewComment.make(resolveInput.comment)),
			resolvingAll: state.resolvingAll
		})
	})
)

const resolveCommentsActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(commentResolutionStateAtom(cwd), {
		fn: RpcClient.runtime.fn<{comment: GitReviewComment & {source: 'github' | 'local'}}[]>()(
			Effect.fn('DiffPage.resolveComments')(function* (comments) {
				const client = yield* RpcClient

				yield* client('review.comments.resolve', {comments: Array.map(comments, input => input.comment), cwd})
			})
		),
		reducer: (state, comments) => ({
			resolving: pipe(
				comments,
				Array.reduce(state.resolving, (resolving, input) =>
					HashSet.add(resolving, GitReviewComment.make(input.comment))
				)
			),
			resolvingAll: true
		})
	})
)

const saveCommentActionAtom = Atom.family((cwd: string) =>
	RpcClient.runtime.fn<GitReviewCommentDraft>()(
		Effect.fn('DiffPage.saveComment')(function* (comment) {
			const client = yield* RpcClient
			yield* pipe(
				client('review.comments.save', {comment, cwd}),
				Effect.catch(() => Effect.sync(() => toast.error('Failed to save comment.')))
			)
		})
	)
)

const markReviewedActionAtom = Atom.family((cwd: string) =>
	RpcClient.runtime.fn<GitReviewState['marks']>()(
		Effect.fn('DiffPage.markReviewed')(function* (marks) {
			const client = yield* RpcClient
			yield* pipe(
				client('review.state.mark', {cwd, marks}),
				Effect.catch(() => Effect.sync(() => toast.error('Failed to mark file reviewed.')))
			)
		})
	)
)

const unmarkReviewedActionAtom = Atom.family((cwd: string) =>
	RpcClient.runtime.fn<GitReviewState['marks']>()(
		Effect.fn('DiffPage.unmarkReviewed')(function* (marks) {
			const client = yield* RpcClient
			yield* pipe(
				client('review.state.unmark', {cwd, marks}),
				Effect.catch(() => Effect.sync(() => toast.error('Failed to unmark file reviewed.')))
			)
		})
	)
)

function groupCommentsByFile<Comment extends {filePath: string}>(comments: Comment[]) {
	return pipe(
		comments,
		Array.reduce(HashMap.empty<string, Comment[]>(), (groups, comment) =>
			HashMap.set(
				groups,
				comment.filePath,
				pipe(
					HashMap.get(groups, comment.filePath),
					Option.getOrElse(() => Array.empty<Comment>()),
					Array.append(comment)
				)
			)
		),
		groups => Array.fromIterable(groups),
		Array.map(group => ({comments: group[1], filePath: group[0]}))
	)
}

async function copyReviewComments(commentsToCopy: (GitReviewComment & {source: 'github' | 'local'})[]) {
	try {
		await navigator.clipboard.writeText(pipe(commentsToCopy, Array.map(formatCopiedComment), Array.join('\n\n')))
	} catch {
		toast.error('Failed to copy comments.')
	}
}

function DiffPage() {
	const params = Route.useParams()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return

	return <ReviewViewPanel key={activeHome.value.activeWorktree.root} cwd={activeHome.value.activeWorktree.root} />
}

function ReviewViewPanel(input: {cwd: string}) {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const suggestedMetadata = useAtomValue(suggestedMetadataAtom(input.cwd))
	const reviewStateValue = useAtomValue(reviewStateValueAtom(input.cwd))
	const [shortcutsOpen, setShortcutsOpen] = useState(false)
	const [selectedScope, setSelectedScope] = useState<GitReviewTarget>(() => GitReviewChangesTarget.make({}))
	if (AsyncResult.isFailure(suggestedMetadata)) throw suggestedMetadata.cause

	const suggestedMetadataLoaded = AsyncResult.isSuccess(suggestedMetadata)
	const localCommits = suggestedMetadataLoaded
		? Array.fromIterable(suggestedMetadata.value.localCommits)
		: Array.empty<GitCommit>()
	const branchCommits = suggestedMetadataLoaded
		? Array.fromIterable(suggestedMetadata.value.branchCommits)
		: Array.empty<GitCommit>()
	const checkpointCommits = Array.takeWhile(localCommits, commit => commit.checkpoint)
	const reviewTarget = pipe(
		Array.appendAll(localCommits, branchCommits),
		Array.findFirst(commit => commit.hash === search.commit),
		Option.match({onNone: () => selectedScope, onSome: commit => GitReviewCommitTarget.make({hash: commit.hash})})
	)
	const reviewDiffs = reviewDiffsAtom(ReviewDiffsKey.make({cwd: input.cwd, target: reviewTarget}))
	const changesReviewDiffs = reviewDiffsAtom(
		ReviewDiffsKey.make({cwd: input.cwd, target: GitReviewChangesTarget.make({})})
	)
	const [selectedFilePathValue, setSelectedFilePath] = useState('')
	const reviewDiffsResult = useAtomValue(reviewDiffs)
	const changesReviewDiffsResult = useAtomValue(changesReviewDiffs)
	const reviewDiffsValue = AsyncResult.isSuccess(reviewDiffsResult)
		? Array.fromIterable(reviewDiffsResult.value)
		: Array.empty<GitDiff>()
	const changesReviewDiffsLoaded = AsyncResult.isSuccess(changesReviewDiffsResult)
	const changesReviewDiffsValue = changesReviewDiffsLoaded ? changesReviewDiffsResult.value : Array.empty<GitDiff>()
	const selectedFilePath =
		String.isNonEmpty(selectedFilePathValue) &&
		Array.some(reviewDiffsValue, diff => diff.filePath === selectedFilePathValue)
			? selectedFilePathValue
			: ''
	const selectedEntry =
		(String.isNonEmpty(selectedFilePath)
			? pipe(
					reviewDiffsValue,
					Array.findFirst(diff => diff.filePath === selectedFilePath),
					Option.getOrUndefined
				)
			: undefined) ?? reviewDiffsValue[0]
	const refreshMetadata = useAtomRefresh(suggestedMetadataAtom(input.cwd))
	const refreshDiffs = useAtomRefresh(reviewDiffs)
	const refreshChangesDiffs = useAtomRefresh(changesReviewDiffs)
	const refreshReviewState = useAtomRefresh(reviewStateAtom(input.cwd))
	const saveComment = useAtomSet(saveCommentActionAtom(input.cwd), {mode: 'promise'})
	const resolveComment = useAtomSet(resolveCommentActionAtom(input.cwd), {mode: 'promise'})
	const resolveComments = useAtomSet(resolveCommentsActionAtom(input.cwd), {mode: 'promise'})
	const commentResolutionState = useAtomValue(commentResolutionStateAtom(input.cwd))
	const markReviewed = useAtomSet(markReviewedActionAtom(input.cwd), {mode: 'promise'})
	const unmarkReviewed = useAtomSet(unmarkReviewedActionAtom(input.cwd), {mode: 'promise'})
	const effectiveComments = Array.map(reviewStateValue.comments, comment => ({
		...comment,
		resolving: HashSet.has(commentResolutionState.resolving, comment)
	}))
	const unresolvedCommentInputs = Array.map(effectiveComments, comment => ({comment}))
	const commentsByFile = groupCommentsByFile(effectiveComments)
	const selectedEntryComments = selectedEntry
		? Array.filter(effectiveComments, comment => comment.filePath === selectedEntry.filePath)
		: Array.empty()
	const visibleSegmentKeys = pipe(reviewDiffsValue, Array.flatMap(gitReviewMarksForDiff), HashSet.fromIterable)
	const validReviewMarks = Array.filter(reviewStateValue.marks, mark => HashSet.has(visibleSegmentKeys, mark))

	async function openFile(filePath: string) {
		setSelectedFilePath(filePath)
		const marks = pipe(
			reviewDiffsValue,
			Array.findFirst(diff => diff.filePath === filePath),
			Option.map(gitReviewMarksForDiff),
			Option.getOrElse(() => Array.empty<GitReviewMark>())
		)
		if (!Array.isReadonlyArrayEmpty(marks)) await markReviewed(marks)
	}

	function selectTarget(target: GitReviewTarget) {
		startTransition(() => {
			void navigate({search: target._tag === 'commit' ? {commit: target.hash} : {}})
		})
		if (target._tag !== 'commit') setSelectedScope(target)
		setSelectedFilePath('')
	}

	function refreshReview() {
		refreshMetadata()
		refreshDiffs()
		refreshChangesDiffs()
		refreshReviewState()
	}

	async function resolveReviewComment(comment: GitReviewComment & {source: 'github' | 'local'}) {
		try {
			await resolveComment({comment})
			if (comment.source === 'github') refreshReviewState()
		} catch {
			toast.error(comment.source === 'github' ? 'Failed to resolve GitHub thread.' : 'Failed to resolve comment.')
		}
	}

	async function resolveReviewComments(
		commentsToResolve: {comment: GitReviewComment & {source: 'github' | 'local'}}[]
	) {
		try {
			await resolveComments(commentsToResolve)
			refreshReviewState()
		} catch {
			toast.error('Failed to resolve comment.')
		}
	}

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
					</div>
				</DialogContent>
			</Dialog>
			<ResizablePanelGroup orientation="horizontal">
				<ResizablePanel defaultSize="34%" minSize="24%" maxSize="46%">
					<div className="flex h-full flex-col border-r">
						<CommitActionForm
							cwd={input.cwd}
							dirty={
								(suggestedMetadataLoaded && suggestedMetadata.value.dirty) ||
								(changesReviewDiffsLoaded && !Array.isReadonlyArrayEmpty(changesReviewDiffsValue))
							}
							hasReviewableWorktreeChanges={
								changesReviewDiffsLoaded && !Array.isReadonlyArrayEmpty(changesReviewDiffsValue)
							}
							hasCheckpointCommits={!Array.isReadonlyArrayEmpty(checkpointCommits)}
							loading={!suggestedMetadataLoaded || !changesReviewDiffsLoaded}
							refreshReview={refreshReview}
							unpushedCommits={suggestedMetadataLoaded && suggestedMetadata.value.unpushedCommits}
							unpushedCount={Array.length(localCommits)}
							upstream={suggestedMetadataLoaded ? suggestedMetadata.value.upstream : undefined}
						/>
						<ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
							<ResizablePanel defaultSize="55%" minSize="15%">
								<div className="h-full min-h-0">
									{AsyncResult.isSuccess(reviewDiffsResult) ? (
										<DiffList
											diffs={reviewDiffsValue}
											marks={validReviewMarks}
											markReviewed={markReviewed}
											unmarkReviewed={unmarkReviewed}
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
										branchCommits={branchCommits}
										loading={!suggestedMetadataLoaded}
										localCommits={localCommits}
										selected={reviewTarget}
										selectCommit={commit => {
											selectTarget(GitReviewCommitTarget.make({hash: commit.hash}))
										}}
										selectScope={selectTarget}
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
							{!AsyncResult.isSuccess(reviewDiffsResult) && (
								<div className="flex h-full min-h-0">
									<Loading />
								</div>
							)}
							{AsyncResult.isSuccess(reviewDiffsResult) && Array.isReadonlyArrayEmpty(reviewDiffsValue) && (
								<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
									No changed files.
								</div>
							)}
							{AsyncResult.isSuccess(reviewDiffsResult) && selectedEntry && (
								<div className="h-full min-h-0 min-w-0">
									<PatchDiff
										filePath={selectedEntry.filePath}
										fileContent={selectedEntry.fileContent}
										patch={selectedEntry.patch}
										comments={selectedEntryComments}
										onSaveComment={comment => {
											void saveComment(comment)
										}}
										onResolveComment={comment => {
											void resolveReviewComment({...comment, source: comment.source ?? 'local'})
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
											key={group.filePath}
											type="button"
											variant="outline"
											size="xs"
											aria-label={`Open ${group.filePath}`}
											title={group.filePath}
											onClick={() => {
												void openFile(group.filePath)
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
										disabled={Array.isReadonlyArrayEmpty(effectiveComments)}
										onClick={() => {
											void copyReviewComments(effectiveComments)
										}}
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
											void resolveReviewComments(unresolvedCommentInputs)
										}}
									>
										{commentResolutionState.resolvingAll ? (
											<Spinner className="size-2.5 border opacity-60" />
										) : (
											<CircleCheckIcon />
										)}
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
	cwd: string
	dirty: boolean
	hasCheckpointCommits: boolean
	hasReviewableWorktreeChanges: boolean
	loading: boolean
	refreshReview: () => void
	unpushedCommits: boolean
	unpushedCount: number
	upstream?: {ahead: number; behind: number}
}) {
	const [commitMessage, setCommitMessage] = useState('')
	const actionState = useAtomValue(reviewActionsStateAtom(input.cwd))
	const generatePublishMessage = useAtomSet(generatePublishMessageActionAtom(input.cwd), {mode: 'promise'})
	const checkpoint = useAtomSet(checkpointActionAtom(input.cwd), {mode: 'promise'})
	const publish = useAtomSet(publishActionAtom(input.cwd), {mode: 'promise'})
	const trimmedCommitMessage = pipe(commitMessage, String.trim)
	const commitMessagePlaceholder = pipe(
		Match.value({checkpoints: input.hasCheckpointCommits, dirty: input.dirty, loading: input.loading}),
		Match.when({loading: true}, () => 'Loading'),
		Match.when({dirty: true}, () => 'Generate commit message'),
		Match.when({checkpoints: true}, () => 'Generate squash message'),
		Match.orElse(() => (input.unpushedCommits ? 'Generate branch summary' : 'No changes'))
	)
	const messageLines = String.split(/\r?\n/u)(trimmedCommitMessage)
	const messageSubject = String.trim(messageLines[0])
	const messageBody = pipe(Array.drop(messageLines, 1), Array.join('\n'), String.trim)
	const subjectContent = pipe(
		Match.value({generating: actionState.generatingMessage, hasSubject: String.isNonEmpty(messageSubject)}),
		Match.when({generating: true}, () => 'Generating commit message'),
		Match.when({hasSubject: true}, () => messageSubject),
		Match.orElse(() => commitMessagePlaceholder)
	)

	function canPublishDirtyChanges() {
		return input.dirty && input.hasReviewableWorktreeChanges
	}

	function canPublishCheckpoints() {
		return !input.dirty && input.hasCheckpointCommits
	}

	function canPublishExistingCommits() {
		return !input.dirty && !input.hasCheckpointCommits && input.unpushedCommits
	}

	function publishRequiresMessage() {
		return canPublishDirtyChanges() || canPublishCheckpoints()
	}

	function canGenerateMessage() {
		return canPublishDirtyChanges() || canPublishCheckpoints() || canPublishExistingCommits()
	}

	function canSubmitPublish() {
		return canPublishDirtyChanges() || canPublishCheckpoints() || canPublishExistingCommits()
	}

	async function submitPublish() {
		if (
			input.loading ||
			actionState.publishing ||
			actionState.checkpointing ||
			!canSubmitPublish() ||
			(publishRequiresMessage() && String.isEmpty(trimmedCommitMessage))
		) {
			return
		}

		try {
			await publish(trimmedCommitMessage)
			setCommitMessage('')
			input.refreshReview()
		} catch (error) {
			toast.error(formatError(error))
		}
	}

	async function generateMessage() {
		if (
			input.loading ||
			actionState.generatingMessage ||
			actionState.publishing ||
			actionState.checkpointing ||
			!canGenerateMessage()
		) {
			return
		}

		try {
			setCommitMessage(await generatePublishMessage(null))
		} catch (error) {
			toast.error(formatError(error))
		}
	}

	async function createCheckpoint() {
		if (
			input.loading ||
			actionState.checkpointing ||
			actionState.publishing ||
			!input.dirty ||
			!input.hasReviewableWorktreeChanges
		) {
			return
		}

		try {
			await checkpoint(null)
			input.refreshReview()
		} catch (error) {
			toast.error(formatError(error))
		}
	}

	const commitActions = (
		<div className="flex shrink-0 items-center gap-1">
			{Predicate.isNotUndefined(input.upstream) && (input.upstream.ahead > 0 || input.upstream.behind > 0) ? (
				<span
					className="text-muted-foreground px-0.5 text-xs"
					title={`${input.upstream.ahead} ahead, ${input.upstream.behind} behind upstream`}
				>
					↑{input.upstream.ahead} ↓{input.upstream.behind}
				</span>
			) : (
				input.unpushedCommits && (
					<span
						className="text-muted-foreground px-0.5 text-xs"
						title={
							input.unpushedCount > 0
								? `${input.unpushedCount} ${input.unpushedCount === 1 ? 'commit' : 'commits'} to push`
								: 'Unpushed commits'
						}
					>
						↑{input.unpushedCount > 0 ? input.unpushedCount : ''}
					</span>
				)
			)}
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				className="size-4"
				aria-label="Generate commit message"
				title={canPublishExistingCommits() ? 'Generate branch summary' : 'Generate commit message'}
				disabled={
					input.loading ||
					actionState.generatingMessage ||
					actionState.checkpointing ||
					actionState.publishing ||
					!canGenerateMessage()
				}
				onClick={() => {
					void generateMessage()
				}}
			>
				{actionState.generatingMessage ? <Spinner className="size-2.5 border opacity-60" /> : <SparklesIcon />}
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				className="size-4"
				aria-label="Checkpoint"
				title="Create checkpoint"
				disabled={
					input.loading ||
					actionState.checkpointing ||
					actionState.publishing ||
					!input.dirty ||
					!input.hasReviewableWorktreeChanges
				}
				onClick={() => {
					void createCheckpoint()
				}}
			>
				{actionState.checkpointing ? <Spinner className="size-2.5 border opacity-60" /> : <CircleCheckIcon />}
			</Button>
			<Button
				type="submit"
				variant="ghost"
				size="icon-xs"
				className="size-4"
				aria-label="Publish"
				title="Commit and push"
				disabled={
					input.loading ||
					actionState.publishing ||
					actionState.checkpointing ||
					!canSubmitPublish() ||
					(publishRequiresMessage() && String.isEmpty(trimmedCommitMessage))
				}
			>
				{actionState.publishing ? <Spinner className="size-2.5 border opacity-60" /> : <UploadIcon />}
			</Button>
			{input.loading && (
				<span className="text-muted-foreground flex size-4 items-center justify-center">
					<Spinner className="size-2.5 border opacity-60" />
				</span>
			)}
		</div>
	)
	return (
		<form
			className="border-b p-2"
			onSubmit={event => {
				event.preventDefault()
				void submitPublish()
			}}
		>
			<div className="border-input min-w-0 border font-mono text-xs leading-4 select-text">
				<div className="flex min-w-0 items-stretch">
					<span
						title={subjectContent}
						className={cn(
							'min-w-0 flex-1 truncate px-2 py-1.5',
							(String.isEmpty(messageSubject) || actionState.generatingMessage) && 'text-muted-foreground'
						)}
					>
						{subjectContent}
					</span>
					<div className="border-input flex shrink-0 items-center border-l px-1.5">{commitActions}</div>
				</div>
				{String.isNonEmpty(messageBody) && !actionState.generatingMessage && (
					<div className="bg-muted/30 text-muted-foreground border-t px-2 py-1.5">
						<div className="max-h-32 overflow-y-auto">
							<span className="whitespace-pre-wrap">{messageBody}</span>
						</div>
					</div>
				)}
			</div>
		</form>
	)
}

function CommitList(input: {
	branchCommits: GitCommit[]
	loading: boolean
	localCommits: GitCommit[]
	selected: GitReviewTarget
	selectCommit: (commit: GitCommit) => void
	selectScope: (target: GitReviewTarget) => void
}) {
	if (input.loading) {
		return (
			<div className="flex h-full min-h-0 items-center justify-center">
				<Spinner className="text-muted-foreground size-4 border opacity-60" />
			</div>
		)
	}

	function renderCommit(commit: GitCommit) {
		return (
			<li key={commit.hash} className="w-full min-w-0">
				<button
					type="button"
					aria-current={input.selected._tag === 'commit' && input.selected.hash === commit.hash ? 'page' : undefined}
					onClick={() => {
						input.selectCommit(commit)
					}}
					className={cn(
						'text-muted-foreground hover:bg-muted hover:text-foreground grid h-6 w-full min-w-0 grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 px-3 text-left',
						input.selected._tag === 'commit' && input.selected.hash === commit.hash && 'bg-primary/15 text-primary'
					)}
				>
					<span className="min-w-0 truncate">
						<span>{commit.subject}</span>
					</span>
					<span className="text-muted-foreground min-w-0 truncate text-right">{commit.shortHash}</span>
				</button>
			</li>
		)
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<ul className="min-h-0 flex-1 overflow-y-auto py-1">
				<CommitScopeRow
					detail="worktree"
					label="Changes"
					selected={input.selected}
					selectScope={input.selectScope}
					target={GitReviewChangesTarget.make({})}
				/>
				{!Array.isReadonlyArrayEmpty(input.localCommits) && (
					<CommitScopeRow
						detail={`${Array.length(input.localCommits)}`}
						label="Local"
						selected={input.selected}
						selectScope={input.selectScope}
						target={GitReviewLocalTarget.make({})}
					/>
				)}
				{Array.map(input.localCommits, renderCommit)}
				{!Array.isReadonlyArrayEmpty(input.branchCommits) && (
					<CommitScopeRow
						detail={`${Array.length(input.branchCommits)}`}
						label="Branch"
						selected={input.selected}
						selectScope={input.selectScope}
						target={GitReviewBranchTarget.make({})}
					/>
				)}
				{Array.map(input.branchCommits, renderCommit)}
			</ul>
		</div>
	)
}

function CommitScopeRow(input: {
	detail: string
	label: string
	selected: GitReviewTarget
	selectScope: (target: GitReviewTarget) => void
	target: GitReviewTarget
}) {
	return (
		<li className="w-full min-w-0">
			<button
				type="button"
				aria-current={input.selected._tag === input.target._tag ? 'page' : undefined}
				onClick={() => {
					input.selectScope(input.target)
				}}
				className={cn(
					'text-secondary-foreground hover:bg-accent hover:text-accent-foreground bg-secondary grid h-6 w-full min-w-0 grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 px-3 text-left',
					input.selected._tag === input.target._tag && 'bg-primary/15 text-primary'
				)}
			>
				<span className="min-w-0 truncate">{input.label}</span>
				<span className="min-w-0 truncate text-right opacity-70">{input.detail}</span>
			</button>
		</li>
	)
}

type FileTreeDirectory = {children: FileTreeNode[]; name: string; path: string; type: 'directory'}
type FileTreeNode = FileTreeDirectory | {diff: GitDiff; name: string; path: string; type: 'file'}

function buildFileTree(diffs: GitDiff[]) {
	function insert(directory: FileTreeDirectory, parts: string[], diff: GitDiff): FileTreeDirectory {
		if (Predicate.isUndefined(parts[0])) {
			return {
				...directory,
				children: Array.append(directory.children, {diff, name: diff.filePath, path: diff.filePath, type: 'file'})
			}
		}
		if (Array.length(parts) === 1) {
			return {
				...directory,
				children: Array.append(directory.children, {diff, name: parts[0], path: diff.filePath, type: 'file'})
			}
		}

		const path = directory.path ? `${directory.path}/${parts[0]}` : parts[0]
		const directoryChild = pipe(
			directory.children,
			Array.findFirstWithIndex(child => child.name === parts[0] && child.type === 'directory')
		)

		if (Option.isSome(directoryChild) && directoryChild.value[0].type === 'directory') {
			const updatedChild = insert(directoryChild.value[0], Array.drop(parts, 1), diff)
			return {
				...directory,
				children: pipe(
					directory.children,
					Array.modify(directoryChild.value[1], () => updatedChild),
					Option.getOrElse(() => directory.children)
				)
			}
		}

		const next = insert(
			{children: Array.empty<FileTreeNode>(), name: parts[0], path, type: 'directory'},
			Array.drop(parts, 1),
			diff
		)
		return {...directory, children: Array.append(directory.children, next)}
	}

	return pipe(
		diffs,
		Array.reduce<FileTreeDirectory, GitDiff>(
			{children: Array.empty<FileTreeNode>(), name: '', path: '', type: 'directory'},
			(root, diff) => insert(root, String.split('/')(diff.filePath), diff)
		),
		root => root.children,
		Array.map(node => (node.type === 'directory' ? collapseSingleChildDirectory(node) : node))
	)
}

function collapseSingleChildDirectory(directory: FileTreeDirectory) {
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
	diffs: GitDiff[]
	markReviewed: (marks: GitReviewState['marks']) => unknown
	marks: GitReviewMark[]
	openReviewEntry: (filePath: string) => unknown
	selectedEntry?: GitDiff
	unmarkReviewed: (marks: GitReviewState['marks']) => unknown
}) {
	const [collapsedFolders, setCollapsedFolders] = useState(() => HashSet.empty<string>())
	const fileTree = buildFileTree(input.diffs)
	const marksByDiff = pipe(
		input.diffs,
		Array.reduce(HashMap.empty<string, GitReviewMark[]>(), (marks, diff) =>
			HashMap.set(marks, diff.filePath, gitReviewMarksForDiff(diff))
		)
	)
	const reviewed = HashSet.fromIterable(input.marks)

	function renderNode(node: FileTreeNode) {
		if (node.type === 'directory') {
			return (
				<li key={node.path} className="w-full min-w-0">
					<TreeExplorerRow
						icon={<FolderIcon />}
						onClick={() => {
							setCollapsedFolders(current =>
								HashSet.has(current, node.path) ? HashSet.remove(current, node.path) : HashSet.add(current, node.path)
							)
						}}
						actions={<span className="text-muted-foreground">{Array.length(node.children)}</span>}
					>
						{node.name}
					</TreeExplorerRow>
					{!HashSet.has(collapsedFolders, node.path) && (
						<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
							{Array.map(node.children, renderNode)}
						</ul>
					)}
				</li>
			)
		}

		const marks = pipe(
			marksByDiff,
			HashMap.get(node.diff.filePath),
			Option.getOrElse(() => Array.empty<GitReviewMark>())
		)
		const state = gitReviewStateForMarks(marks, reviewed)

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
										void input.unmarkReviewed(marks)
									} else {
										void input.markReviewed(marks)
									}
								}}
							/>
							<DiffStatus status={node.diff.status} />
						</div>
					}
					onClick={() => {
						void input.openReviewEntry(node.diff.filePath)
					}}
				>
					{node.name}
				</TreeExplorerRow>
			</li>
		)
	}

	return (
		<TreeExplorer className="h-full overflow-y-auto px-0 py-1">
			<TreeExplorerSection className="min-h-0 flex-1 [&>ul]:min-h-0 [&>ul]:flex-1">
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
	onClick: (event: MouseEvent<HTMLButtonElement>) => void
	state: 'checked' | 'indeterminate' | 'unchecked'
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

function DiffStatus(input: {status: GitDiff['status']}) {
	return pipe(
		Match.value(input.status),
		Match.when('added', () => <span className="text-emerald-600 dark:text-emerald-400">A</span>),
		Match.when('deleted', () => <span className="text-red-600 dark:text-red-400">D</span>),
		Match.when('renamed', () => <span className="text-sky-600 dark:text-sky-400">R</span>),
		Match.orElse(() => <span className="text-amber-600 dark:text-amber-400">M</span>)
	)
}
