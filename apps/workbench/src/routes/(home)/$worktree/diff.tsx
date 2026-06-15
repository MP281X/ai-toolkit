import {useAtom, useAtomRefresh, useAtomSuspense, useAtomValue} from '@effect/atom-react'

import {Array, Effect, Equal, Match, Option, Record, Schema, Stream, String, pipe} from 'effect'

import {createFileRoute} from '@tanstack/react-router'
import {AsyncResult, Atom} from 'effect/unstable/reactivity'
import {startTransition, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeWorktreeAtom} from '#lib/state.ts'
import {Loading} from '@deslop/components/fallbacks'
import {
	CheckIcon,
	CircleCheckIcon,
	CopyIcon,
	ExternalLinkIcon,
	FileIcon,
	FolderIcon,
	MinusIcon,
	SparklesIcon,
	UploadIcon
} from '@deslop/components/icons'
import {PatchDiff, formatCopiedComment} from '@deslop/components/render/diff'
import {TreeExplorer, TreeExplorerGroup, TreeExplorerRow, TreeExplorerSection} from '@deslop/components/tree-explorer'
import {Button} from '@deslop/components/ui/button'
import {Checkbox} from '@deslop/components/ui/checkbox'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@deslop/components/ui/resizable'
import {Spinner} from '@deslop/components/ui/spinner'
import {cn, formatError} from '@deslop/components/utils'
import {
	GitReviewBranchTarget,
	GitReviewChangesTarget,
	GitReviewCommitTarget,
	GitReviewLocalTarget,
	GitReviewState,
	GitReviewTarget,
	gitReviewMarksForDiff,
	gitReviewStateForMarks,
	gitReviewTargetIsCommit,
	gitReviewTargetIsScope
} from '@deslop/git/schema'
import type {GitCommit, GitDiff, GitReviewComment, GitReviewMark, GitReviewScopeTarget} from '@deslop/git/schema'

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

class ReviewDiffsInput extends Schema.Class<ReviewDiffsInput>('ReviewDiffsInput')({
	cwd: Schema.String,
	target: GitReviewTarget
}) {}

const reviewDiffsAtom = Atom.family((input: ReviewDiffsInput) =>
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
		AsyncResult.isSuccess(result) ? result.value : new GitReviewState({comments: Array.empty(), marks: Array.empty()})
	)
)

function groupCommentsByFile<Comment extends {readonly filePath: string}>(comments: readonly Comment[]) {
	return Array.map(Record.toEntries(Array.groupBy(comments, comment => comment.filePath)), group => ({
		comments: group[1],
		filePath: group[0]
	}))
}

function reviewCommentLocation(input: {
	readonly filePath: string
	readonly lineNumber: number
	readonly side?: 'additions' | 'deletions'
	readonly source: 'github' | 'local'
	readonly threadId?: string
}) {
	return {
		filePath: input.filePath,
		lineNumber: input.lineNumber,
		side: input.side ?? 'additions',
		source: input.source,
		threadId: input.threadId
	}
}

function DiffPage() {
	const params = Route.useParams()
	const activeWorktree = useAtomSuspense(activeWorktreeAtom(params.worktree))

	return <ReviewViewPanel key={activeWorktree.value.root} cwd={activeWorktree.value.root} />
}

function ReviewViewPanel(input: {readonly cwd: string}) {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const suggestedMetadata = useAtomValue(suggestedMetadataAtom(input.cwd))
	const reviewStateValue = useAtomValue(reviewStateValueAtom(input.cwd))
	const copiedCommentsState = useState<'copied' | 'failed' | 'idle'>('idle')
	const commentActionErrorState = useState('')
	const selectedScopeState = useState<GitReviewScopeTarget>(new GitReviewChangesTarget({}))
	if (AsyncResult.isFailure(suggestedMetadata)) throw new Error(formatError(suggestedMetadata.cause))

	const suggestedMetadataLoaded = AsyncResult.isSuccess(suggestedMetadata)
	const localCommits = suggestedMetadataLoaded ? suggestedMetadata.value.localCommits : Array.empty<GitCommit>()
	const branchCommits = suggestedMetadataLoaded ? suggestedMetadata.value.branchCommits : Array.empty<GitCommit>()
	const allCommits = Array.appendAll(localCommits, branchCommits)
	const selectedCommit = pipe(
		allCommits,
		Array.findFirst(commit => commit.hash === search.commit),
		Option.getOrUndefined
	)
	const reviewTarget = selectedCommit ? new GitReviewCommitTarget({hash: selectedCommit.hash}) : selectedScopeState[0]
	const reviewDiffs = reviewDiffsAtom(new ReviewDiffsInput({cwd: input.cwd, target: reviewTarget}))
	const selectedFilePathState = useState('')
	const reviewDiffsResult = useAtomValue(reviewDiffs)
	const reviewDiffsLoaded = AsyncResult.isSuccess(reviewDiffsResult)
	const reviewDiffsValue = reviewDiffsLoaded ? reviewDiffsResult.value : Array.empty<GitDiff>()
	const hasReviewableChanges = reviewDiffsLoaded && !Array.isReadonlyArrayEmpty(reviewDiffsValue)
	const selectedEntry =
		(String.isNonEmpty(selectedFilePathState[0])
			? pipe(
					reviewDiffsValue,
					Array.findFirst(diff => diff.filePath === selectedFilePathState[0]),
					Option.getOrUndefined
				)
			: undefined) ?? reviewDiffsValue[0]
	const refreshDiffs = useAtomRefresh(reviewDiffs)
	const refreshReviewState = useAtomRefresh(reviewStateAtom(input.cwd))
	const [, saveComment] = useAtom(RpcClient.mutation('review.comments.save'), {mode: 'promise'})
	const [, resolveComment] = useAtom(RpcClient.mutation('review.comments.resolve'), {mode: 'promise'})
	const [, loadFileContent] = useAtom(RpcClient.mutation('review.fileContent'), {mode: 'promise'})
	const commentResolutionState = useState({
		resolvingAll: false,
		resolvingComments: Array.empty<ReturnType<typeof reviewCommentLocation>>()
	})
	const [, markReviewed] = useAtom(RpcClient.mutation('review.state.mark'), {mode: 'promise'})
	const [, unmarkReviewed] = useAtom(RpcClient.mutation('review.state.unmark'), {mode: 'promise'})
	const effectiveComments = Array.map(reviewStateValue.comments, comment => ({
		body: comment.body,
		filePath: comment.filePath,
		lineNumber: comment.lineNumber,
		resolved: comment.resolved,
		resolving: Array.containsWith(Equal.equals)(reviewCommentLocation(comment))(
			commentResolutionState[0].resolvingComments
		),
		side: comment.side,
		source: comment.source,
		threadId: comment.threadId,
		url: comment.url
	}))
	const unresolvedComments = Array.filter(effectiveComments, comment => !comment.resolved)
	const unresolvedCommentInputs = Array.map(unresolvedComments, comment => ({comment}))
	const commentsByFile = groupCommentsByFile(unresolvedComments)
	const selectedEntryComments = selectedEntry
		? Array.filter(effectiveComments, comment => comment.filePath === selectedEntry.filePath)
		: Array.empty()
	const visibleMarks = Array.flatMap(reviewDiffsValue, gitReviewMarksForDiff)
	const validReviewMarks = Array.filter(reviewStateValue.marks, mark =>
		Array.containsWith(Equal.equals)(mark)(visibleMarks)
	)
	function openFile(diff: GitDiff) {
		selectedFilePathState[1](diff.filePath)
		void markFileReviewed(gitReviewMarksForDiff(diff))
	}

	function selectTarget(target: GitReviewTarget) {
		startTransition(() => {
			void navigate({search: gitReviewTargetIsCommit(target) ? {commit: target.hash} : {}})
		})
		if (gitReviewTargetIsScope(target)) selectedScopeState[1](target)
		selectedFilePathState[1]('')
	}

	function refreshReview() {
		refreshDiffs()
		refreshReviewState()
	}

	async function copyComments(commentsToCopy: readonly (typeof effectiveComments)[number][]) {
		try {
			await navigator.clipboard.writeText(pipe(commentsToCopy, Array.map(formatCopiedComment), Array.join('\n\n')))
			copiedCommentsState[1]('copied')
		} catch {
			copiedCommentsState[1]('failed')
		}
		window.setTimeout(() => {
			copiedCommentsState[1]('idle')
		}, 1200)
	}

	async function markFileReviewed(marks: readonly GitReviewMark[]) {
		try {
			await markReviewed({payload: {cwd: input.cwd, marks}})
			commentActionErrorState[1]('')
		} catch {
			commentActionErrorState[1]('Failed to mark file reviewed.')
		}
	}

	async function unmarkFileReviewed(marks: readonly GitReviewMark[]) {
		try {
			await unmarkReviewed({payload: {cwd: input.cwd, marks}})
			commentActionErrorState[1]('')
		} catch {
			commentActionErrorState[1]('Failed to unmark file reviewed.')
		}
	}

	function setFileReviewed(review: {readonly marks: readonly GitReviewMark[]; readonly reviewed: boolean}) {
		if (review.reviewed) {
			void markFileReviewed(review.marks)
		} else {
			void unmarkFileReviewed(review.marks)
		}
	}

	async function saveQueuedComment(comment: typeof GitReviewComment.Type) {
		try {
			await saveComment({payload: {comment, cwd: input.cwd}})
			commentActionErrorState[1]('')
		} catch {
			commentActionErrorState[1]('Failed to save comment.')
		}
	}

	async function resolveReviewComment(comment: {
		readonly body: string
		readonly filePath: string
		readonly lineNumber: number
		readonly resolved?: boolean
		readonly side?: 'additions' | 'deletions'
		readonly source: 'github' | 'local'
		readonly threadId?: string
		readonly url?: string
	}) {
		commentResolutionState[1](state => ({
			resolvingAll: state.resolvingAll,
			resolvingComments: Array.append(state.resolvingComments, reviewCommentLocation(comment))
		}))
		try {
			await resolveComment({
				payload: {
					cwd: input.cwd,
					filePath: comment.filePath,
					lineNumber: comment.lineNumber,
					side: comment.side,
					threadId: comment.threadId
				}
			})
			if (comment.source === 'github') refreshReviewState()
			commentActionErrorState[1]('')
		} catch {
			commentActionErrorState[1](
				comment.source === 'github' ? 'Failed to resolve GitHub thread.' : 'Failed to resolve comment.'
			)
		} finally {
			commentResolutionState[1](state => ({
				resolvingAll: state.resolvingAll,
				resolvingComments: Array.filter(
					state.resolvingComments,
					resolving => !Equal.equals(resolving, reviewCommentLocation(comment))
				)
			}))
		}
	}

	async function resolveReviewComments(commentsToResolve: readonly {readonly comment: typeof GitReviewComment.Type}[]) {
		commentResolutionState[1](state => ({
			resolvingAll: true,
			resolvingComments: Array.appendAll(
				state.resolvingComments,
				Array.map(commentsToResolve, comment => reviewCommentLocation(comment.comment))
			)
		}))
		try {
			await Promise.all(
				pipe(
					commentsToResolve,
					Array.dedupeWith(
						(left, right) => left.comment.threadId !== undefined && left.comment.threadId === right.comment.threadId
					),
					Array.map(resolveInput =>
						resolveComment({
							payload: {
								cwd: input.cwd,
								filePath: resolveInput.comment.filePath,
								lineNumber: resolveInput.comment.lineNumber,
								side: resolveInput.comment.side,
								threadId: resolveInput.comment.threadId
							}
						})
					)
				)
			)
			refreshReviewState()
			commentActionErrorState[1]('')
		} catch {
			commentActionErrorState[1]('Failed to resolve comment.')
		} finally {
			commentResolutionState[1]({resolvingAll: false, resolvingComments: Array.empty()})
		}
	}

	return (
		<ResizablePanelGroup orientation="horizontal">
			<ResizablePanel defaultSize="34%" minSize="24%" maxSize="46%">
				<div className="flex h-full flex-col border-r">
					<CommitActionForm
						cwd={input.cwd}
						dirty={suggestedMetadataLoaded && suggestedMetadata.value.dirty}
						hasReviewableChanges={hasReviewableChanges}
						loading={!suggestedMetadataLoaded}
						prUrl={suggestedMetadataLoaded ? suggestedMetadata.value.prUrl : undefined}
						refreshReview={refreshReview}
						unpushedCommits={suggestedMetadataLoaded && suggestedMetadata.value.unpushedCommits}
						unpushedCount={Array.length(localCommits)}
						upstream={suggestedMetadataLoaded ? suggestedMetadata.value.upstream : undefined}
					/>
					<ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
						<ResizablePanel defaultSize="55%" minSize="15%">
							<div className="h-full min-h-0">
								{reviewDiffsLoaded ? (
									<DiffList
										diffs={reviewDiffsValue}
										marks={validReviewMarks}
										setReviewed={setFileReviewed}
										selectedFilePath={selectedEntry?.filePath}
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
									selectTarget={selectTarget}
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
						{reviewDiffsLoaded && Array.isReadonlyArrayEmpty(reviewDiffsValue) && (
							<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
								No changed files.
							</div>
						)}
						{reviewDiffsLoaded && selectedEntry && (
							<div className="h-full min-h-0 min-w-0">
								<PatchDiff
									filePath={selectedEntry.filePath}
									fileContent={selectedEntry.fileContent}
									loadFileContent={() =>
										loadFileContent({payload: {cwd: input.cwd, filePath: selectedEntry.filePath, target: reviewTarget}})
									}
									patch={selectedEntry.patch}
									comments={selectedEntryComments}
									onSaveComment={comment => {
										void saveQueuedComment({
											body: comment.body,
											filePath: comment.filePath,
											lineNumber: comment.lineNumber,
											resolved: false,
											side: comment.side,
											source: 'local'
										})
									}}
									onResolveComment={comment => {
										void resolveReviewComment(comment)
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
											selectedFilePathState[1](group.filePath)
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
									aria-label={copiedCommentsState[0] === 'failed' ? 'Copy failed' : 'Copy all comments'}
									title={copiedCommentsState[0] === 'failed' ? 'Copy failed' : 'Copy all comments'}
									disabled={Array.isReadonlyArrayEmpty(unresolvedComments)}
									onClick={() => {
										void copyComments(unresolvedComments)
									}}
								>
									{copiedCommentsState[0] === 'copied' ? (
										<CheckIcon className="text-emerald-500" />
									) : (
										<CopyIcon className={cn(copiedCommentsState[0] === 'failed' && 'text-destructive')} />
									)}
								</Button>
								<Button
									type="button"
									variant={String.isNonEmpty(commentActionErrorState[0]) ? 'destructive' : 'ghost'}
									size="icon-sm"
									aria-label={commentActionErrorState[0] || 'Resolve all comments'}
									title={commentActionErrorState[0] || 'Resolve all comments'}
									disabled={
										commentResolutionState[0].resolvingAll ? true : Array.isReadonlyArrayEmpty(unresolvedCommentInputs)
									}
									onClick={() => {
										void resolveReviewComments(unresolvedCommentInputs)
									}}
								>
									{commentResolutionState[0].resolvingAll ? (
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
	)
}

function CommitActionForm(input: {
	readonly cwd: string
	readonly dirty: boolean
	readonly hasReviewableChanges: boolean
	readonly loading: boolean
	readonly prUrl?: string
	readonly refreshReview: () => void
	readonly unpushedCommits: boolean
	readonly unpushedCount: number
	readonly upstream?: {readonly ahead: number; readonly behind: number}
}) {
	const commitMessageState = useState('')
	const actionErrorState = useState('')
	const actionState = useState({generatingMessage: false, publishing: false})
	const [, generatePublishMessage] = useAtom(RpcClient.mutation('publish.message.generate'), {mode: 'promise'})
	const [, approvePublish] = useAtom(RpcClient.mutation('publish.approve'), {mode: 'promise'})
	const trimmedCommitMessage = String.trim(commitMessageState[0])
	const missingMessage = input.dirty && String.isEmpty(trimmedCommitMessage)
	const publishDisabled =
		input.loading ||
		actionState[0].publishing ||
		(input.dirty ? !input.hasReviewableChanges : !input.unpushedCommits) ||
		missingMessage
	const generateDisabled =
		input.loading ||
		actionState[0].generatingMessage ||
		actionState[0].publishing ||
		!input.dirty ||
		!input.hasReviewableChanges
	const commitMessagePlaceholder = Match.value(input).pipe(
		Match.when(
			value => value.loading,
			() => 'Loading'
		),
		Match.when(
			value => value.dirty,
			() => 'Generate commit message'
		),
		Match.orElse(() => 'No changes')
	)
	const messageLines = String.split(/\r?\n/u)(trimmedCommitMessage)
	const messageSubject = String.trim(messageLines[0])
	const messageBody = pipe(Array.drop(messageLines, 1), Array.join('\n'), String.trim)
	const subjectContent = Match.value({
		commitMessagePlaceholder,
		generatingMessage: actionState[0].generatingMessage,
		messageSubject
	}).pipe(
		Match.when(
			value => value.generatingMessage,
			() => 'Generating commit message'
		),
		Match.when(
			value => String.isNonEmpty(value.messageSubject),
			value => value.messageSubject
		),
		Match.orElse(value => value.commitMessagePlaceholder)
	)
	const subjectMuted = String.isEmpty(messageSubject) || actionState[0].generatingMessage
	const showBody = String.isNonEmpty(messageBody) && !actionState[0].generatingMessage

	async function submitPublish() {
		if (publishDisabled) return

		actionState[1]({generatingMessage: false, publishing: true})
		try {
			await approvePublish({payload: {cwd: input.cwd, message: trimmedCommitMessage}})
			commitMessageState[1]('')
			actionErrorState[1]('')
			input.refreshReview()
		} catch (error) {
			actionErrorState[1](formatError(error))
		}
		actionState[1]({generatingMessage: false, publishing: false})
	}

	async function generateMessage() {
		if (generateDisabled) return

		actionState[1]({generatingMessage: true, publishing: false})
		try {
			commitMessageState[1](await generatePublishMessage({payload: {cwd: input.cwd}}))
			actionErrorState[1]('')
		} catch (error) {
			actionErrorState[1](formatError(error))
		}
		actionState[1]({generatingMessage: false, publishing: false})
	}

	const commitActions = (
		<div className="flex shrink-0 items-center gap-1">
			{input.unpushedCommits && (
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
			)}
			{input.upstream !== undefined && (input.upstream.ahead > 0 || input.upstream.behind > 0) && (
				<span
					className="text-muted-foreground px-0.5 text-xs"
					title={`${input.upstream.ahead} ahead, ${input.upstream.behind} behind upstream`}
				>
					↑{input.upstream.ahead} ↓{input.upstream.behind}
				</span>
			)}
			<Button
				type="button"
				variant={String.isNonEmpty(actionErrorState[0]) ? 'destructive' : 'ghost'}
				size="icon-xs"
				className="size-4"
				aria-label={actionErrorState[0] || 'Generate commit message'}
				title={actionErrorState[0] || 'Generate commit message'}
				disabled={generateDisabled}
				onClick={() => {
					void generateMessage()
				}}
			>
				{actionState[0].generatingMessage ? <Spinner className="size-2.5 border opacity-60" /> : <SparklesIcon />}
			</Button>
			<Button
				type="submit"
				variant={String.isNonEmpty(actionErrorState[0]) ? 'destructive' : 'ghost'}
				size="icon-xs"
				className="size-4"
				aria-label={actionErrorState[0] || 'Publish'}
				title={actionErrorState[0] || 'Commit, push, and open a draft PR'}
				disabled={publishDisabled}
			>
				{actionState[0].publishing ? <Spinner className="size-2.5 border opacity-60" /> : <UploadIcon />}
			</Button>
			{input.loading ? (
				<span className="text-muted-foreground flex size-4 items-center justify-center">
					<Spinner className="size-2.5 border opacity-60" />
				</span>
			) : (
				String.isNonEmpty(input.prUrl ?? '') && (
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						className="size-4"
						aria-label="Open pull request"
						title="Open pull request"
						onClick={() => {
							window.open(input.prUrl, '_blank', 'noopener,noreferrer')
						}}
					>
						<ExternalLinkIcon />
					</Button>
				)
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
						className={cn('min-w-0 flex-1 truncate px-2 py-1.5', subjectMuted && 'text-muted-foreground')}
					>
						{subjectContent}
					</span>
					<div className="border-input flex shrink-0 items-center border-l px-1.5">{commitActions}</div>
				</div>
				{showBody && (
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
	readonly branchCommits: readonly GitCommit[]
	readonly loading: boolean
	readonly localCommits: readonly GitCommit[]
	readonly selected: GitReviewTarget
	readonly selectTarget: (target: GitReviewTarget) => void
}) {
	const showLocal = !Array.isReadonlyArrayEmpty(input.localCommits)
	const showBranch = !Array.isReadonlyArrayEmpty(input.branchCommits)

	if (input.loading) {
		return (
			<div className="flex h-full min-h-0 items-center justify-center">
				<Spinner className="text-muted-foreground size-4 border opacity-60" />
			</div>
		)
	}

	function renderScope(target: GitReviewScopeTarget, label: string, detail: string) {
		const selected = Equal.equals(input.selected, target)

		return (
			<li className="w-full min-w-0">
				<button
					type="button"
					aria-current={selected ? 'page' : undefined}
					onClick={() => {
						input.selectTarget(target)
					}}
					className={cn(
						'text-secondary-foreground hover:bg-accent hover:text-accent-foreground bg-secondary grid h-6 w-full min-w-0 grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 px-3 text-left',
						selected && 'bg-primary/15 text-primary'
					)}
				>
					<span className="min-w-0 truncate">{label}</span>
					<span className="min-w-0 truncate text-right opacity-70">{detail}</span>
				</button>
			</li>
		)
	}

	function renderCommit(commit: GitCommit) {
		const selected = gitReviewTargetIsCommit(input.selected) && input.selected.hash === commit.hash

		return (
			<li key={commit.hash} className="w-full min-w-0">
				<button
					type="button"
					aria-current={selected ? 'page' : undefined}
					onClick={() => {
						input.selectTarget(new GitReviewCommitTarget({hash: commit.hash}))
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
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<ul className="min-h-0 flex-1 overflow-y-auto py-1">
				{renderScope(new GitReviewChangesTarget({}), 'Changes', 'worktree')}
				{showLocal && renderScope(new GitReviewLocalTarget({}), 'Local', `${Array.length(input.localCommits)}`)}
				{Array.map(input.localCommits, renderCommit)}
				{showBranch && renderScope(new GitReviewBranchTarget({}), 'Branch', `${Array.length(input.branchCommits)}`)}
				{Array.map(input.branchCommits, renderCommit)}
			</ul>
		</div>
	)
}

export type FileTreeDirectory = {
	readonly children: (FileTreeDirectory | FileTreeFile)[]
	readonly name: string
	readonly path: string
	readonly type: 'directory'
}

export type FileTreeFile = {readonly diff: GitDiff; readonly name: string; readonly path: string; readonly type: 'file'}

function buildFileTree(diffs: readonly GitDiff[]) {
	const tree = {
		root: {children: Array.empty<FileTreeDirectory | FileTreeFile>(), name: '', path: '', type: 'directory' as const}
	}

	function directoryChild(directory: FileTreeDirectory, name: string) {
		const current = pipe(
			directory.children,
			Array.findFirst((child): child is FileTreeDirectory => child.name === name && child.type === 'directory'),
			Option.getOrUndefined
		)
		if (current !== undefined) return current

		const path = String.isNonEmpty(directory.path) ? `${directory.path}/${name}` : name
		directory.children.push({children: Array.empty<FileTreeDirectory | FileTreeFile>(), name, path, type: 'directory'})
		return pipe(
			directory.children,
			Array.findFirst(
				(child): child is FileTreeDirectory => child.type === 'directory' && child.name === name && child.path === path
			),
			Option.getOrThrowWith(() => new Error(`Missing inserted directory: ${path}`))
		)
	}

	function insertDiff(directory: FileTreeDirectory, parts: readonly string[], diff: GitDiff) {
		const part = Option.getOrThrowWith(Array.head(parts), () => new Error(`Empty diff path: ${diff.filePath}`))
		if (Array.length(parts) <= 1) {
			directory.children.push({diff, name: part, path: diff.filePath, type: 'file'})
			return
		}

		insertDiff(directoryChild(directory, part), Array.drop(parts, 1), diff)
	}

	for (const diff of diffs) insertDiff(tree.root, String.split('/')(diff.filePath), diff)

	return Array.map(tree.root.children, node => (node.type === 'directory' ? collapseSingleChildDirectory(node) : node))
}

function collapseSingleChildDirectory(directory: FileTreeDirectory) {
	if (Array.length(directory.children) === 1 && directory.children[0]?.type === 'directory') {
		return collapseSingleChildDirectory({
			children: directory.children[0].children,
			name: `${directory.name}/${directory.children[0].name}`,
			path: directory.children[0].path,
			type: 'directory'
		})
	}

	return directory
}

function DiffList(input: {
	readonly diffs: readonly GitDiff[]
	readonly marks: readonly GitReviewMark[]
	readonly openReviewEntry: (diff: GitDiff) => void
	readonly selectedFilePath?: string
	readonly setReviewed: (input: {readonly marks: readonly GitReviewMark[]; readonly reviewed: boolean}) => void
}) {
	const collapsedFoldersState = useState<ReadonlySet<string>>(new Set())
	const fileTree = buildFileTree(input.diffs)

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

	function renderNode(node: FileTreeDirectory | FileTreeFile) {
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
					{!collapsed && <TreeExplorerGroup>{Array.map(node.children, renderNode)}</TreeExplorerGroup>}
				</li>
			)
		}

		const marks = gitReviewMarksForDiff(node.diff)
		const state = gitReviewStateForMarks(marks, input.marks)

		return (
			<li key={node.path} className="w-full min-w-0">
				<TreeExplorerRow
					selected={input.selectedFilePath === node.diff.filePath}
					icon={<FileIcon filePath={node.diff.filePath} className="size-3" />}
					actions={
						<div className="flex items-center gap-2">
							<ReviewCheckbox
								state={state}
								onToggle={() => {
									input.setReviewed({marks, reviewed: state !== 'checked'})
								}}
							/>
							<DiffStatus status={node.diff.status} />
						</div>
					}
					onClick={() => {
						input.openReviewEntry(node.diff)
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
	readonly onToggle: () => void
	readonly state: 'checked' | 'indeterminate' | 'unchecked'
}) {
	return (
		<span className="relative flex size-3 shrink-0 items-center justify-center">
			<Checkbox
				checked={input.state === 'checked'}
				indeterminate={input.state === 'indeterminate'}
				className="size-3 [&_[data-slot=checkbox-indicator]]:hidden"
				onClick={event => {
					event.stopPropagation()
				}}
				onCheckedChange={input.onToggle}
			/>
			{input.state === 'checked' && (
				<CheckIcon className="text-primary-foreground pointer-events-none absolute size-2.5" />
			)}
			{input.state === 'indeterminate' && (
				<MinusIcon className="text-primary-foreground pointer-events-none absolute size-2.5" />
			)}
		</span>
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
