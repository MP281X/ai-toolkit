import {useAtomRefresh, useAtomSet, useAtomSuspense, useAtomValue} from '@effect/atom-react'

import {Array, Effect, HashMap, Match, Option, Schema, Stream, String, pipe} from 'effect'

import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute} from '@tanstack/react-router'
import {AsyncResult, Atom} from 'effect/unstable/reactivity'
import {startTransition, useEffect, useState, type MouseEvent} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
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
	type GitReviewComment,
	type GitReviewMark,
	type GitReviewTarget,
	gitReviewCommentKey,
	gitReviewMarkKey,
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
			Effect.flatMap(client => client('review.metadata', {cwd}))
		)
	)
)

function targetKey(target: GitReviewTarget) {
	return target._tag === 'commit' ? `commit\u0000${target.hash}` : target._tag
}

function targetFromKey(tag: string, hash = ''): GitReviewTarget {
	if (tag === 'commit') return {_tag: 'commit', hash}
	if (tag === 'local') return {_tag: 'local'}
	if (tag === 'branch') return {_tag: 'branch'}
	return {_tag: 'changes'}
}

const reviewDiffsAtom = Atom.family((key: string) => {
	const parts = key.split('\u0000')
	const cwd = parts[0] ?? ''
	const target = targetFromKey(parts[1] ?? 'changes', parts[2] ?? '')

	return RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('review.diffs', {cwd, target})),
			Stream.unwrap
		)
	)
})

const reviewStateAtom = Atom.family((cwd: string) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('review.state.watch', {cwd})),
			Stream.unwrap
		)
	)
)

type QueuedComment = typeof GitReviewComment.Type

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

const reviewActionsStateAtom = Atom.family(() =>
	Atom.optimistic(Atom.make(() => ({generatingMessage: false, publishing: false})))
)

const generatePublishMessageActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(reviewActionsStateAtom(cwd), {
		fn: RpcClient.runtime.fn<null>()(
			Effect.fn('DiffPage.generatePublishMessage')(function* () {
				const client = yield* RpcClient
				return yield* client('publish.message.generate', {cwd})
			})
		),
		reducer: state => ({...state, generatingMessage: true})
	})
)

const approvePublishActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(reviewActionsStateAtom(cwd), {
		fn: RpcClient.runtime.fn<string>()(
			Effect.fn('DiffPage.approvePublish')(function* (message) {
				const client = yield* RpcClient
				return yield* client('publish.approve', {cwd, message})
			})
		),
		reducer: state => ({...state, publishing: true})
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

				yield* client('review.comments.resolve', {
					cwd,
					filePath: resolveInput.comment.filePath,
					lineNumber: resolveInput.comment.lineNumber,
					side: resolveInput.comment.side,
					threadId: resolveInput.comment.threadId
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
					Effect.forEach(resolveInput =>
						client('review.comments.resolve', {
							cwd,
							filePath: resolveInput.comment.filePath,
							lineNumber: resolveInput.comment.lineNumber,
							side: resolveInput.comment.side,
							threadId: resolveInput.comment.threadId
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
	return pipe(
		comments,
		Array.reduce(HashMap.empty<string, readonly Comment[]>(), (groups, comment) =>
			HashMap.modifyAt(groups, comment.filePath, current =>
				Option.some(
					Array.append(
						Option.getOrElse(current, () => Array.empty<Comment>()),
						comment
					)
				)
			)
		),
		groups => Array.fromIterable(groups),
		Array.map(group => ({comments: group[1], filePath: group[0]}))
	)
}

async function copyReviewComments(commentsToCopy: readonly DisplayComment[]) {
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

function ReviewViewPanel(input: {readonly cwd: string}) {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const suggestedMetadata = useAtomValue(suggestedMetadataAtom(input.cwd))
	const reviewStateValue = useAtomValue(reviewStateValueAtom(input.cwd))
	const comments = reviewStateValue.comments
	const shortcutsOpenState = useState(false)
	const selectedScopeState = useState<GitReviewTarget>({_tag: 'changes'})
	if (AsyncResult.isFailure(suggestedMetadata)) throw suggestedMetadata.cause

	const suggestedMetadataLoaded = AsyncResult.isSuccess(suggestedMetadata)
	const localCommits = suggestedMetadataLoaded ? suggestedMetadata.value.localCommits : Array.empty<GitCommit>()
	const branchCommits = suggestedMetadataLoaded ? suggestedMetadata.value.branchCommits : Array.empty<GitCommit>()
	const allCommits = Array.appendAll(localCommits, branchCommits)
	const selectedCommit = pipe(
		allCommits,
		Array.findFirst(commit => commit.hash === search.commit),
		Option.getOrUndefined
	)
	const reviewTarget: GitReviewTarget = selectedCommit
		? {_tag: 'commit', hash: selectedCommit.hash}
		: selectedScopeState[0]
	const reviewDiffs = reviewDiffsAtom(`${input.cwd}\u0000${targetKey(reviewTarget)}`)
	const selectedFilePathState = useState('')
	const reviewDiffsResult = useAtomValue(reviewDiffs)
	const reviewDiffsLoaded = reviewDiffsResult._tag === 'Success'
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
	const refreshSuggestedMetadata = useAtomRefresh(suggestedMetadataAtom(input.cwd))
	const refreshDiffs = useAtomRefresh(reviewDiffs)
	const refreshReviewState = useAtomRefresh(reviewStateAtom(input.cwd))
	const saveComment = useAtomSet(RpcClient.mutation('review.comments.save'), {mode: 'promise'})
	const resolveComment = useAtomSet(resolveCommentActionAtom(input.cwd), {mode: 'promise'})
	const resolveComments = useAtomSet(resolveCommentsActionAtom(input.cwd), {mode: 'promise'})
	const commentResolutionState = useAtomValue(commentResolutionStateAtom(input.cwd))
	const markReviewed = useAtomSet(RpcClient.mutation('review.state.mark'), {mode: 'promise'})
	const unmarkReviewed = useAtomSet(RpcClient.mutation('review.state.unmark'), {mode: 'promise'})
	const effectiveComments: readonly DisplayComment[] = Array.map(comments, comment => ({
		...comment,
		resolved: comment.resolved === true,
		resolving: commentResolutionState.resolvingKeys.has(gitReviewCommentKey(comment)),
		source: comment.source ?? 'local'
	}))
	const unresolvedComments = Array.filter(effectiveComments, comment => !comment.resolved)
	const unresolvedCommentInputs = Array.map(unresolvedComments, comment => ({
		comment,
		key: gitReviewCommentKey(comment)
	}))
	const commentsByFile = groupCommentsByFile(unresolvedComments)
	const selectedEntryComments = selectedEntry
		? Array.filter(effectiveComments, comment => comment.filePath === selectedEntry.filePath)
		: Array.empty()
	const visibleSegmentKeys = new Set(
		pipe(
			reviewDiffsValue,
			Array.flatMap(diff =>
				Array.map(diff.segments, segment =>
					gitReviewMarkKey({filePath: segment.filePath, fingerprint: segment.fingerprint})
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
		if (!Array.isReadonlyArrayEmpty(marks)) void markFileReviewed(marks)
	}

	function selectTarget(target: GitReviewTarget) {
		startTransition(() => {
			void navigate({search: target._tag === 'commit' ? {commit: target.hash} : {}})
		})
		if (target._tag !== 'commit') selectedScopeState[1](target)
		selectedFilePathState[1]('')
	}

	function refreshReview() {
		refreshSuggestedMetadata()
		refreshDiffs()
		refreshReviewState()
	}

	async function markFileReviewed(marks: readonly GitReviewMark[]) {
		try {
			await markReviewed({payload: {cwd: input.cwd, marks}})
		} catch {
			toast.error('Failed to mark file reviewed.')
		}
	}

	async function unmarkFileReviewed(marks: readonly GitReviewMark[]) {
		try {
			await unmarkReviewed({payload: {cwd: input.cwd, marks}})
		} catch {
			toast.error('Failed to unmark file reviewed.')
		}
	}

	async function saveQueuedComment(comment: QueuedComment) {
		try {
			await saveComment({payload: {comment, cwd: input.cwd}})
		} catch {
			toast.error('Failed to save comment.')
		}
	}

	async function resolveReviewComment(comment: DisplayComment) {
		try {
			await resolveComment({comment, key: gitReviewCommentKey(comment)})
			if (comment.source === 'github') refreshReviewState()
		} catch {
			toast.error(comment.source === 'github' ? 'Failed to resolve GitHub thread.' : 'Failed to resolve comment.')
		}
	}

	async function resolveReviewComments(commentsToResolve: readonly ResolveCommentInput[]) {
		try {
			await resolveComments(commentsToResolve)
			refreshReviewState()
		} catch {
			toast.error('Failed to resolve comment.')
		}
	}

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
					</div>
				</DialogContent>
			</Dialog>
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
						/>
						<ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
							<ResizablePanel defaultSize="55%" minSize="15%">
								<div className="h-full min-h-0">
									{reviewDiffsLoaded ? (
										<DiffList
											diffs={reviewDiffsValue}
											marks={validReviewMarks}
											markReviewed={marks => {
												void markFileReviewed(marks)
											}}
											unmarkReviewed={marks => {
												void unmarkFileReviewed(marks)
											}}
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
											selectTarget({_tag: 'commit', hash: commit.hash})
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
										patch={selectedEntry.patch}
										comments={selectedEntryComments}
										onSaveComment={comment => {
											void saveQueuedComment({
												body: comment.body,
												filePath: comment.filePath,
												lineNumber: comment.lineNumber,
												resolved: false,
												side: comment.side
											})
										}}
										onResolveComment={comment => {
											void resolveReviewComment({
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
										disabled={Array.isReadonlyArrayEmpty(unresolvedComments)}
										onClick={() => {
											void copyReviewComments(unresolvedComments)
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
	readonly cwd: string
	readonly dirty: boolean
	readonly hasReviewableChanges: boolean
	readonly loading: boolean
	readonly prUrl?: string
	readonly refreshReview: () => void
	readonly unpushedCommits: boolean
	readonly unpushedCount: number
}) {
	const commitMessageState = useState('')
	const actionState = useAtomValue(reviewActionsStateAtom(input.cwd))
	const generatePublishMessage = useAtomSet(generatePublishMessageActionAtom(input.cwd), {mode: 'promise'})
	const approvePublish = useAtomSet(approvePublishActionAtom(input.cwd), {mode: 'promise'})
	const trimmedCommitMessage = pipe(commitMessageState[0], String.trim)
	const missingMessage = input.dirty && String.isEmpty(trimmedCommitMessage)
	const publishDisabled =
		input.loading ||
		actionState.publishing ||
		(input.dirty ? !input.hasReviewableChanges : !input.unpushedCommits) ||
		missingMessage
	const generateDisabled =
		input.loading ||
		actionState.generatingMessage ||
		actionState.publishing ||
		!input.dirty ||
		!input.hasReviewableChanges
	let commitMessagePlaceholder = 'No changes'
	if (input.loading) commitMessagePlaceholder = 'Loading'
	else if (input.dirty) commitMessagePlaceholder = 'Generate commit message'
	const messageLines = String.split(/\r?\n/)(trimmedCommitMessage)
	const messageSubject = String.trim(messageLines[0])
	const messageBody = pipe(Array.drop(messageLines, 1), Array.join('\n'), String.trim)
	let subjectContent = commitMessagePlaceholder
	if (String.isNonEmpty(messageSubject)) subjectContent = messageSubject
	if (actionState.generatingMessage) subjectContent = 'Generating commit message'
	const subjectMuted = String.isEmpty(messageSubject) || actionState.generatingMessage
	const showBody = String.isNonEmpty(messageBody) && !actionState.generatingMessage

	async function submitPublish() {
		if (publishDisabled) return

		try {
			await approvePublish(trimmedCommitMessage)
			commitMessageState[1]('')
			input.refreshReview()
		} catch (error) {
			toast.error(formatError(error))
		}
	}

	async function generateMessage() {
		if (generateDisabled) return

		try {
			commitMessageState[1](await generatePublishMessage(null))
		} catch (error) {
			toast.error(formatError(error))
		}
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
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				className="size-4"
				aria-label="Generate commit message"
				title="Generate commit message"
				disabled={generateDisabled}
				onClick={() => {
					void generateMessage()
				}}
			>
				{actionState.generatingMessage ? <Spinner className="size-2.5 border opacity-60" /> : <SparklesIcon />}
			</Button>
			<Button
				type="submit"
				variant="ghost"
				size="icon-xs"
				className="size-4"
				aria-label="Publish"
				title="Commit, push, and open a draft PR"
				disabled={publishDisabled}
			>
				{actionState.publishing ? <Spinner className="size-2.5 border opacity-60" /> : <UploadIcon />}
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
	readonly selectCommit: (commit: GitCommit) => void
	readonly selectScope: (target: GitReviewTarget) => void
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

	function renderScope(target: Exclude<GitReviewTarget, {_tag: 'commit'}>, label: string, detail: string) {
		const selected = input.selected._tag === target._tag

		return (
			<li className="w-full min-w-0">
				<button
					type="button"
					aria-current={selected ? 'page' : undefined}
					onClick={() => {
						input.selectScope(target)
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
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<ul className="min-h-0 flex-1 overflow-y-auto py-1">
				{renderScope({_tag: 'changes'}, 'Changes', 'worktree')}
				{showLocal && renderScope({_tag: 'local'}, 'Local', `${Array.length(input.localCommits)}`)}
				{Array.map(input.localCommits, renderCommit)}
				{showBranch && renderScope({_tag: 'branch'}, 'Branch', `${Array.length(input.branchCommits)}`)}
				{Array.map(input.branchCommits, renderCommit)}
			</ul>
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
	readonly selectedEntry?: GitDiff
	readonly unmarkReviewed: (marks: readonly GitReviewMark[]) => void
}) {
	const collapsedFoldersState = useState<ReadonlySet<string>>(new Set())
	const fileTree = buildFileTree(input.diffs)
	const marksByDiff = pipe(
		input.diffs,
		Array.reduce(HashMap.empty<string, readonly GitReviewMark[]>(), (marks, diff) =>
			HashMap.set(marks, diff.filePath, gitReviewMarksForDiff(diff))
		)
	)
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

		const marks = pipe(
			marksByDiff,
			HashMap.get(node.diff.filePath),
			Option.getOrElse(() => Array.empty<GitReviewMark>())
		)
		const state = gitReviewStateForMarks(marks, reviewedKeys)

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
