import {useAtom, useAtomMount, useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Cause, Effect, HashMap, HashSet, Match, Option, Predicate, Schema, Stream, String, pipe} from 'effect'

import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute} from '@tanstack/react-router'
import {AsyncResult, Atom} from 'effect/unstable/reactivity'
import {startTransition, useState, type MouseEvent} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
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
	type GitCommit,
	type GitDiff,
	GitReviewBranchTarget,
	GitReviewChangesTarget,
	GitReviewCommitTarget,
	GitReviewLocalTarget,
	type GitReviewMark,
	type GitReviewState,
	GitReviewTarget,
	gitReviewMarksForDiff,
	gitReviewStateDeleteComments,
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

const optimisticReviewStateAtom = Atom.family((cwd: string) => Atom.optimistic(reviewStateAtom(cwd)))

const reviewSelectionAtom = Atom.family((_cwd: string) =>
	Atom.make({filePath: '', scope: GitReviewTarget.make(GitReviewChangesTarget.make({}))})
)

const saveCommentActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(optimisticReviewStateAtom(cwd), {
		fn: RpcClient.mutation('review.comments.save'),
		reducer: (result, input) =>
			AsyncResult.map(result, state => gitReviewStateSaveComment(state, input.payload.comment))
	})
)

const resolveCommentsActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(optimisticReviewStateAtom(cwd), {
		fn: RpcClient.mutation('review.comments.resolve'),
		reducer: (result, input) =>
			AsyncResult.map(result, state => gitReviewStateDeleteComments(state, input.payload.comments))
	})
)

const markReviewedActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(optimisticReviewStateAtom(cwd), {
		fn: RpcClient.mutation('review.state.mark'),
		reducer: (result, input) => AsyncResult.map(result, state => gitReviewStateMark(state, input.payload.marks))
	})
)

const unmarkReviewedActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(optimisticReviewStateAtom(cwd), {
		fn: RpcClient.mutation('review.state.unmark'),
		reducer: (result, input) => AsyncResult.map(result, state => gitReviewStateUnmark(state, input.payload.marks))
	})
)

type ReviewViewKey = typeof ReviewViewKey.Type
const ReviewViewKey = Schema.Struct({commit: Schema.optional(Schema.String), cwd: Schema.String})

const reviewViewAtom = Atom.family((input: ReviewViewKey) =>
	Atom.make(get =>
		Effect.gen(function* () {
			const suggestedMetadata = yield* get.result(suggestedMetadataAtom(input.cwd))
			const selection = get(reviewSelectionAtom(input.cwd))
			const localCommits = Array.fromIterable(suggestedMetadata.localCommits)
			const branchCommits = Array.fromIterable(suggestedMetadata.branchCommits)
			const reviewTarget = pipe(
				Array.appendAll(localCommits, branchCommits),
				Array.findFirst(commit => commit.hash === input.commit),
				Option.match({onNone: () => selection.scope, onSome: commit => GitReviewCommitTarget.make({hash: commit.hash})})
			)
			const reviewDiffs = Array.fromIterable(
				yield* get.result(reviewDiffsAtom(ReviewDiffsKey.make({cwd: input.cwd, target: reviewTarget})))
			)
			const changesReviewDiffs = yield* get.result(
				reviewDiffsAtom(ReviewDiffsKey.make({cwd: input.cwd, target: GitReviewChangesTarget.make({})}))
			)
			const reviewState = yield* get.result(optimisticReviewStateAtom(input.cwd))
			const selectedFilePath =
				String.isNonEmpty(selection.filePath) && Array.some(reviewDiffs, diff => diff.filePath === selection.filePath)
					? selection.filePath
					: ''
			const selectedEntry =
				(String.isNonEmpty(selectedFilePath)
					? pipe(
							reviewDiffs,
							Array.findFirst(diff => diff.filePath === selectedFilePath),
							Option.getOrUndefined
						)
					: undefined) ?? reviewDiffs[0]
			const visibleSegmentKeys = pipe(reviewDiffs, Array.flatMap(gitReviewMarksForDiff), HashSet.fromIterable)

			return {
				branchCommits,
				changesReviewDiffs: Array.fromIterable(changesReviewDiffs),
				checkpointCommits: Array.takeWhile(localCommits, commit => commit.checkpoint),
				commentsByFile: pipe(
					reviewState.comments,
					Array.reduce(HashMap.empty<string, GitReviewState['comments']>(), (groups, comment) =>
						HashMap.set(
							groups,
							comment.filePath,
							pipe(
								HashMap.get(groups, comment.filePath),
								Option.getOrElse(() => Array.empty<GitReviewState['comments'][number]>()),
								Array.append(comment)
							)
						)
					),
					groups => Array.fromIterable(groups),
					Array.map(([filePath, comments]) => ({comments, filePath}))
				),
				localCommits,
				reviewDiffs,
				reviewState,
				reviewTarget,
				selectedEntry,
				selectedEntryComments: selectedEntry
					? Array.filter(reviewState.comments, comment => comment.filePath === selectedEntry.filePath)
					: Array.empty(),
				selection,
				suggestedMetadata,
				validReviewMarks: Array.filter(reviewState.marks, mark => HashSet.has(visibleSegmentKeys, mark))
			}
		})
	)
)

const reviewMutationNotificationsAtom = Atom.family((cwd: string) =>
	Atom.make(get => {
		get.subscribe(saveCommentActionAtom(cwd), result => {
			if (AsyncResult.isFailure(result) && !Cause.hasInterruptsOnly(result.cause)) {
				toast.error('Failed to save comment.')
			}
		})
		get.subscribe(resolveCommentsActionAtom(cwd), result => {
			if (AsyncResult.isFailure(result) && !Cause.hasInterruptsOnly(result.cause)) {
				toast.error('Failed to resolve comment.')
			}
		})
		get.subscribe(markReviewedActionAtom(cwd), result => {
			if (AsyncResult.isFailure(result) && !Cause.hasInterruptsOnly(result.cause)) {
				toast.error('Failed to mark file reviewed.')
			}
		})
		get.subscribe(unmarkReviewedActionAtom(cwd), result => {
			if (AsyncResult.isFailure(result) && !Cause.hasInterruptsOnly(result.cause)) {
				toast.error('Failed to unmark file reviewed.')
			}
		})
	})
)

const openReviewFileActionAtom = Atom.family((input: ReviewViewKey) =>
	Atom.fnSync((filePath: string, get) => {
		const view = get(reviewViewAtom(input))
		if (!AsyncResult.isSuccess(view)) return
		get.set(reviewSelectionAtom(input.cwd), {...view.value.selection, filePath})
		const marks = pipe(
			view.value.reviewDiffs,
			Array.findFirst(diff => diff.filePath === filePath),
			Option.map(gitReviewMarksForDiff),
			Option.getOrElse(() => Array.empty<GitReviewMark>())
		)
		if (!Array.isReadonlyArrayEmpty(marks)) {
			get.set(markReviewedActionAtom(input.cwd), {payload: {cwd: input.cwd, marks}})
		}
	})
)

const refreshReviewActionAtom = Atom.family((input: ReviewViewKey) =>
	Atom.fnSync((_, get) => {
		const view = get(reviewViewAtom(input))
		get.refresh(suggestedMetadataAtom(input.cwd))
		get.refresh(reviewDiffsAtom(ReviewDiffsKey.make({cwd: input.cwd, target: GitReviewChangesTarget.make({})})))
		get.refresh(optimisticReviewStateAtom(input.cwd))
		if (AsyncResult.isSuccess(view)) {
			get.refresh(reviewDiffsAtom(ReviewDiffsKey.make({cwd: input.cwd, target: view.value.reviewTarget})))
		}
	})
)

function DiffPage() {
	const params = Route.useParams()
	const activeHome = useAtomSuspense(activeHomeAtom(params.worktree))
	if (!activeHome.value.activeWorktree) return

	return <ReviewViewPanel key={activeHome.value.activeWorktree.root} cwd={activeHome.value.activeWorktree.root} />
}

function ReviewViewPanel(input: {cwd: string}) {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const viewKey = ReviewViewKey.make({commit: search.commit, cwd: input.cwd})
	const view = useAtomSuspense(reviewViewAtom(viewKey)).value
	const [shortcutsOpen, setShortcutsOpen] = useState(false)
	const setSelection = useAtomSet(reviewSelectionAtom(input.cwd))
	const openReviewFile = useAtomSet(openReviewFileActionAtom(viewKey))
	const refreshReview = useAtomSet(refreshReviewActionAtom(viewKey))
	const saveComment = useAtomSet(saveCommentActionAtom(input.cwd))
	const resolveComments = useAtomSet(resolveCommentsActionAtom(input.cwd))
	useAtomMount(reviewMutationNotificationsAtom(input.cwd))

	function selectTarget(target: GitReviewTarget) {
		startTransition(async () => {
			await navigate({search: target._tag === 'commit' ? {commit: target.hash} : {}})
		})
		setSelection({filePath: '', scope: target._tag === 'commit' ? view.selection.scope : target})
	}

	async function copyReviewComments() {
		try {
			await navigator.clipboard.writeText(
				pipe(view.reviewState.comments, Array.map(formatCopiedComment), Array.join('\n\n'))
			)
		} catch {
			toast.error('Failed to copy comments.')
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
							dirty={view.suggestedMetadata.dirty || !Array.isReadonlyArrayEmpty(view.changesReviewDiffs)}
							hasReviewableWorktreeChanges={!Array.isReadonlyArrayEmpty(view.changesReviewDiffs)}
							hasCheckpointCommits={!Array.isReadonlyArrayEmpty(view.checkpointCommits)}
							refreshReview={refreshReview}
							unpushedCommits={view.suggestedMetadata.unpushedCommits}
							unpushedCount={Array.length(view.localCommits)}
							upstream={view.suggestedMetadata.upstream}
						/>
						<ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
							<ResizablePanel defaultSize="55%" minSize="15%">
								<div className="h-full min-h-0">
									<DiffList
										cwd={input.cwd}
										diffs={view.reviewDiffs}
										marks={view.validReviewMarks}
										selectedEntry={view.selectedEntry}
										openReviewEntry={openReviewFile}
									/>
								</div>
							</ResizablePanel>
							<ResizableHandle />
							<ResizablePanel defaultSize="45%" minSize="15%">
								<div className="h-full min-h-0">
									<CommitList
										branchCommits={view.branchCommits}
										localCommits={view.localCommits}
										selected={view.reviewTarget}
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
							{Array.isReadonlyArrayEmpty(view.reviewDiffs) && (
								<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
									No changed files.
								</div>
							)}
							{view.selectedEntry && (
								<div className="h-full min-h-0 min-w-0">
									<PatchDiff
										filePath={view.selectedEntry.filePath}
										fileContent={view.selectedEntry.fileContent}
										patch={view.selectedEntry.patch}
										comments={view.selectedEntryComments}
										onSaveComment={comment => {
											saveComment({payload: {comment, cwd: input.cwd}})
										}}
										onResolveComment={comment => {
											resolveComments({
												payload: {comments: [{...comment, source: comment.source ?? 'local'}], cwd: input.cwd}
											})
										}}
									/>
								</div>
							)}
						</div>
						{!Array.isReadonlyArrayEmpty(view.reviewState.comments) && (
							<footer className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t px-2">
								<div className="flex min-w-0 items-center gap-1 overflow-hidden">
									{Array.map(view.commentsByFile, group => (
										<Button
											key={group.filePath}
											type="button"
											variant="outline"
											size="xs"
											aria-label={`Open ${group.filePath}`}
											title={group.filePath}
											onClick={() => {
												openReviewFile(group.filePath)
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
										disabled={Array.isReadonlyArrayEmpty(view.reviewState.comments)}
										onClick={copyReviewComments}
									>
										<CopyIcon />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Resolve all comments"
										title="Resolve all comments"
										disabled={Array.isReadonlyArrayEmpty(view.reviewState.comments)}
										onClick={() => {
											resolveComments({payload: {comments: view.reviewState.comments, cwd: input.cwd}})
										}}
									>
										<CircleCheckIcon />
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
	refreshReview: () => void
	unpushedCommits: boolean
	unpushedCount: number
	upstream?: {ahead: number; behind: number}
}) {
	const [commitMessage, setCommitMessage] = useState('')
	const [generateResult, generatePublishMessage] = useAtom(RpcClient.mutation('publish.message.generate'), {
		mode: 'promise'
	})
	const [checkpointResult, checkpoint] = useAtom(RpcClient.mutation('publish.checkpoint'), {mode: 'promise'})
	const [publishResult, publish] = useAtom(RpcClient.mutation('publish.publish'), {mode: 'promise'})
	const generatingMessage = AsyncResult.isWaiting(generateResult)
	const checkpointing = AsyncResult.isWaiting(checkpointResult)
	const publishing = AsyncResult.isWaiting(publishResult)
	const trimmedCommitMessage = pipe(commitMessage, String.trim)
	const commitMessagePlaceholder = pipe(
		Match.value({checkpoints: input.hasCheckpointCommits, dirty: input.dirty}),
		Match.when({dirty: true}, () => 'Generate commit message'),
		Match.when({checkpoints: true}, () => 'Generate squash message'),
		Match.orElse(() => (input.unpushedCommits ? 'Generate branch summary' : 'No changes'))
	)
	const messageLines = String.split(/\r?\n/u)(trimmedCommitMessage)
	const messageSubject = String.trim(messageLines[0])
	const messageBody = pipe(Array.drop(messageLines, 1), Array.join('\n'), String.trim)
	const subjectContent = pipe(
		Match.value({generating: generatingMessage, hasSubject: String.isNonEmpty(messageSubject)}),
		Match.when({generating: true}, () => 'Generating commit message'),
		Match.when({hasSubject: true}, () => messageSubject),
		Match.orElse(() => commitMessagePlaceholder)
	)

	const publishRequiresMessage =
		(input.dirty && input.hasReviewableWorktreeChanges) || (!input.dirty && input.hasCheckpointCommits)
	const canPublishExistingCommits = !input.dirty && !input.hasCheckpointCommits && input.unpushedCommits
	const canPublish = publishRequiresMessage || canPublishExistingCommits

	async function submitPublish() {
		if (
			publishing ||
			checkpointing ||
			!canPublish ||
			(publishRequiresMessage && String.isEmpty(trimmedCommitMessage))
		) {
			return
		}

		try {
			await publish({payload: {cwd: input.cwd, message: trimmedCommitMessage}})
			setCommitMessage('')
			input.refreshReview()
		} catch (error) {
			toast.error(formatError(error))
		}
	}

	async function generateMessage() {
		if (generatingMessage || publishing || checkpointing || !canPublish) {
			return
		}

		try {
			setCommitMessage(await generatePublishMessage({payload: {cwd: input.cwd}}))
		} catch (error) {
			toast.error(formatError(error))
		}
	}

	async function createCheckpoint() {
		if (checkpointing || publishing || !input.dirty || !input.hasReviewableWorktreeChanges) {
			return
		}

		try {
			await checkpoint({payload: {cwd: input.cwd}})
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
				title={canPublishExistingCommits ? 'Generate branch summary' : 'Generate commit message'}
				disabled={generatingMessage || checkpointing || publishing || !canPublish}
				onClick={generateMessage}
			>
				{generatingMessage ? <Spinner className="size-2.5 border opacity-60" /> : <SparklesIcon />}
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				className="size-4"
				aria-label="Checkpoint"
				title="Create checkpoint"
				disabled={checkpointing || publishing || !input.dirty || !input.hasReviewableWorktreeChanges}
				onClick={createCheckpoint}
			>
				{checkpointing ? <Spinner className="size-2.5 border opacity-60" /> : <CircleCheckIcon />}
			</Button>
			<Button
				type="submit"
				variant="ghost"
				size="icon-xs"
				className="size-4"
				aria-label="Publish"
				title="Commit and push"
				disabled={
					publishing || checkpointing || !canPublish || (publishRequiresMessage && String.isEmpty(trimmedCommitMessage))
				}
			>
				{publishing ? <Spinner className="size-2.5 border opacity-60" /> : <UploadIcon />}
			</Button>
		</div>
	)
	return (
		<form
			className="border-b p-2"
			onSubmit={async event => {
				event.preventDefault()
				await submitPublish()
			}}
		>
			<div className="border-input min-w-0 border font-mono text-xs leading-4 select-text">
				<div className="flex min-w-0 items-stretch">
					<span
						title={subjectContent}
						className={cn(
							'min-w-0 flex-1 truncate px-2 py-1.5',
							(String.isEmpty(messageSubject) || generatingMessage) && 'text-muted-foreground'
						)}
					>
						{subjectContent}
					</span>
					<div className="border-input flex shrink-0 items-center border-l px-1.5">{commitActions}</div>
				</div>
				{String.isNonEmpty(messageBody) && !generatingMessage && (
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
	localCommits: GitCommit[]
	selected: GitReviewTarget
	selectCommit: (commit: GitCommit) => void
	selectScope: (target: GitReviewTarget) => void
}) {
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
	cwd: string
	diffs: GitDiff[]
	marks: GitReviewMark[]
	openReviewEntry: (filePath: string) => void
	selectedEntry?: GitDiff
}) {
	const [collapsedFolders, setCollapsedFolders] = useState(() => HashSet.empty<string>())
	const markReviewed = useAtomSet(markReviewedActionAtom(input.cwd))
	const unmarkReviewed = useAtomSet(unmarkReviewedActionAtom(input.cwd))
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
									if (state === 'checked') unmarkReviewed({payload: {cwd: input.cwd, marks}})
									else markReviewed({payload: {cwd: input.cwd, marks}})
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
