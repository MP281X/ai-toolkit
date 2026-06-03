import {useAtomRefresh, useAtomSet, useAtomSuspense, useAtomValue} from '@effect/atom-react'

import {Array, Effect, Match, Option, Predicate, Schema, Stream, String, pipe} from 'effect'

import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {startTransition, useEffect, useState, type MouseEvent} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom} from '#lib/state.ts'
import {ReviewComment} from '#rpcs/contracts.ts'
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
	MinusIcon,
	RotateCwIcon
} from '@deslop/components/icons'
import {PatchDiff, formatCopiedComment} from '@deslop/components/render/diff'
import {TreeExplorer, TreeExplorerRow, TreeExplorerSection} from '@deslop/components/tree-explorer'
import {Button} from '@deslop/components/ui/button'
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput} from '@deslop/components/ui/input-group'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@deslop/components/ui/resizable'
import {toast} from '@deslop/components/ui/sonner'
import {cn} from '@deslop/components/utils'
import type {GitCommit, GitDiff, GitHubReviewThread, GitReviewFile} from '@deslop/git/schema'

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

const reviewOverviewAtom = Atom.family((input: {readonly cwd: string; readonly target: ReviewTarget}) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client => client('review.overview.watch', {cwd: input.cwd, from: input.target.from})),
				Stream.unwrap
			)
		)
	)
)

const reviewCommentsAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client => client('review.comments.watch', input)),
				Stream.unwrap
			)
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

const reviewCommentsValueAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.map(reviewCommentsAtom(input), result =>
		result._tag === 'Success' ? result.value : Array.empty<QueuedComment>()
	)
)

const optimisticReviewCommentsAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.optimistic(reviewCommentsValueAtom(input))
)

const reviewedFilesAtom = Atom.family((input: {readonly cwd: string; readonly target: ReviewTarget}) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client =>
					client('review.reviewedFiles.watch', {cwd: input.cwd, from: input.target.from, type: input.target.type})
				),
				Stream.unwrap
			)
		)
	)
)

const reviewedFilesValueAtom = Atom.family((input: {readonly cwd: string; readonly target: ReviewTarget}) =>
	Atom.map(reviewedFilesAtom(input), result => (result._tag === 'Success' ? result.value : Array.empty<string>()))
)

const optimisticReviewedFilesAtom = Atom.family((input: {readonly cwd: string; readonly target: ReviewTarget}) =>
	Atom.optimistic(reviewedFilesValueAtom(input))
)

type SetReviewedFileInput = {readonly filePath: string; readonly reviewed: boolean}

const setReviewedFileAtom = Atom.family((input: {readonly cwd: string; readonly target: ReviewTarget}) =>
	Atom.optimisticFn(optimisticReviewedFilesAtom(input), {
		fn: RpcClient.runtime.fn<SetReviewedFileInput>()(
			Effect.fnUntraced(function* (reviewedFile) {
				const client = yield* RpcClient

				yield* client('review.reviewedFiles.set', {
					cwd: input.cwd,
					filePath: reviewedFile.filePath,
					from: input.target.from,
					reviewed: reviewedFile.reviewed,
					type: input.target.type
				})
			})
		),
		reducer: (files, reviewedFile) =>
			reviewedFile.reviewed
				? pipe(Array.append(files, reviewedFile.filePath), Array.dedupe)
				: Array.filter(files, filePath => filePath !== reviewedFile.filePath)
	})
)

const saveQueuedCommentAtom = Atom.family((input: {readonly base: string; readonly cwd: string}) =>
	Atom.optimisticFn(optimisticReviewCommentsAtom(input), {
		fn: RpcClient.runtime.fn<QueuedComment>()(
			Effect.fnUntraced(function* (comment) {
				const client = yield* RpcClient
				return yield* client('review.comments.save', {base: input.base, comment, cwd: input.cwd})
			})
		),
		reducer: (comments, comment: QueuedComment) => {
			const key = commentKey(comment)
			return Array.append(
				Array.filter(comments, currentComment => commentKey(currentComment) !== key),
				new ReviewComment({...comment, resolved: false})
			)
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
	const reviewCommentsResult = useAtomValue(reviewCommentsAtom({base, cwd: input.cwd}))
	const reviewCommentsLoaded = reviewCommentsResult._tag === 'Success'
	const reviewComments = useAtomValue(optimisticReviewCommentsAtom({base, cwd: input.cwd}))
	const comments = reviewCommentsLoaded ? reviewComments : Array.empty<QueuedComment>()
	const [githubThreads, setGithubThreads] = useState<readonly GitHubReviewThread[]>(Array.empty())
	const [githubThreadsLoading, setGithubThreadsLoading] = useState(false)
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
	const reviewedFilePaths = useAtomValue(optimisticReviewedFilesAtom({cwd: input.cwd, target: reviewTarget}))
	const reviewedFiles = new Set(reviewedFilePaths)
	const reviewOverviewResult = useAtomValue(reviewOverviewAtom({cwd: input.cwd, target: reviewTarget}))
	const reviewOverviewLoaded = reviewOverviewResult._tag === 'Success'
	const reviewOverview = reviewOverviewLoaded ? reviewOverviewResult.value : undefined
	const reviewFilesValue = reviewOverview?.files ?? Array.empty<GitReviewFile>()
	const selectedEntry =
		pipe(
			reviewFilesValue,
			Array.findFirst(file => file.filePath === selectedFilePath),
			Option.getOrUndefined
		) ?? reviewFilesValue[0]
	const selectedDiff =
		selectedEntry === undefined
			? undefined
			: pipe(
					reviewOverview?.diffs ?? Array.empty<GitDiff>(),
					Array.findFirst(diff => diff.filePath === selectedEntry.filePath),
					Option.getOrUndefined
				)
	const refreshSuggestedMetadata = useAtomRefresh(suggestedMetadataAtom(input.cwd))
	const refreshOverview = useAtomRefresh(reviewOverviewAtom({cwd: input.cwd, target: reviewTarget}))
	const loadGithubThreads = useAtomSet(RpcClient.mutation('review.githubThreads'), {mode: 'promise'})
	const setReviewedFile = useAtomSet(setReviewedFileAtom({cwd: input.cwd, target: reviewTarget}), {mode: 'promise'})
	const saveComment = useAtomSet(saveQueuedCommentAtom({base, cwd: input.cwd}), {mode: 'promise'})
	const resolveComment = useAtomSet(resolveCommentActionAtom({base, cwd: input.cwd}), {mode: 'promise'})
	const resolveComments = useAtomSet(resolveCommentsActionAtom({base, cwd: input.cwd}), {mode: 'promise'})
	const commentResolutionState = useAtomValue(commentResolutionStateAtom(input.cwd))
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
	const selectedEntryComments = selectedDiff
		? Array.filter(unresolvedComments, comment => comment.filePath === selectedDiff.filePath)
		: Array.empty()
	useEffect(() => {
		const firstFilePath = reviewFilesValue[0]?.filePath

		if (Predicate.isUndefined(firstFilePath)) {
			if (String.isNonEmpty(selectedFilePath)) setSelectedFilePath('')
			return
		}

		if (!Array.some(reviewFilesValue, file => file.filePath === selectedFilePath)) {
			setSelectedFilePath(firstFilePath)
		}
	}, [reviewFilesValue, selectedFilePath])

	useEffect(() => {
		setGithubThreadsLoading(true)
		void loadGithubThreads({payload: {cwd: input.cwd}})
			.then(setGithubThreads)
			.catch(() => {
				toast.error('Failed to load GitHub comments.')
			})
			.finally(() => {
				setGithubThreadsLoading(false)
			})
	}, [input.cwd, loadGithubThreads])

	function loadGithubComments(errorMessage: string) {
		setGithubThreadsLoading(true)
		void loadGithubThreads({payload: {cwd: input.cwd}})
			.then(setGithubThreads)
			.catch(() => {
				toast.error(errorMessage)
			})
			.finally(() => {
				setGithubThreadsLoading(false)
			})
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
		refreshOverview()
	}

	function refreshGithubThreads() {
		loadGithubComments('Failed to refresh GitHub comments.')
	}

	async function markFilesReviewed(filePaths: readonly string[]) {
		try {
			await Promise.all(
				pipe(
					filePaths,
					Array.dedupe,
					Array.map(filePath => setReviewedFile({filePath, reviewed: true}))
				)
			)
		} catch {
			toast.error('Failed to update reviewed files.')
		}
	}

	function openFile(filePath: string) {
		setSelectedFilePath(filePath)
		void markFilesReviewed([filePath])
	}

	function setFileReviewed(filePath: string, reviewed: boolean) {
		void setReviewedFile({filePath, reviewed}).catch(() => {
			toast.error('Failed to update reviewed file.')
		})
	}

	function saveQueuedComment(comment: QueuedComment) {
		void saveComment(comment).catch(() => {
			toast.error('Failed to save comment.')
		})
	}

	function resolveReviewComment(comment: DisplayComment) {
		void resolveComment({comment, key: commentKey(comment)})
			.then(() => {
				if (comment.source === 'github') refreshGithubThreads()
			})
			.catch(() => {
				toast.error(comment.source === 'github' ? 'Failed to resolve GitHub thread.' : 'Failed to resolve comment.')
			})
	}

	function resolveReviewComments(commentsToResolve: readonly ResolveCommentInput[]) {
		void resolveComments(commentsToResolve)
			.then(refreshGithubThreads)
			.catch(() => {
				toast.error('Failed to resolve comment.')
			})
	}

	function copyReviewComments(commentsToCopy: readonly DisplayComment[]) {
		void copyComments(commentsToCopy)
			.then(() => markFilesReviewed(Array.map(commentsToCopy, comment => comment.filePath)))
			.catch(() => {
				toast.error('Failed to copy comments.')
			})
	}

	return (
		<ResizablePanelGroup orientation="horizontal">
			<ResizablePanel defaultSize="34%" minSize="24%" maxSize="46%">
				<div className="flex h-full flex-col border-r">
					<CommitActionForm
						base={base}
						cwd={input.cwd}
						dirty={suggestedMetadata.value.dirty}
						githubThreadsLoading={githubThreadsLoading}
						hasWipCommits={hasWipCommits}
						prUrl={suggestedMetadata.value.prUrl}
						refreshGithubThreads={refreshGithubThreads}
						refreshReview={refreshReview}
					/>
					<ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
						<ResizablePanel defaultSize="55%" minSize="15%">
							<div className="h-full min-h-0">
								{reviewOverviewLoaded ? (
									<DiffList
										files={reviewFilesValue}
										reviewedFiles={reviewedFiles}
										selectedEntry={selectedEntry}
										openReviewEntry={openFile}
										setFileReviewed={setFileReviewed}
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
						{!reviewOverviewLoaded && <PaneLoading />}
						{reviewOverviewLoaded && !selectedEntry && (
							<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
								No changed files.
							</div>
						)}
						{reviewOverviewLoaded && selectedEntry && selectedDiff && (
							<div className="h-full min-h-0 min-w-0">
								<PatchDiff
									content={selectedDiff.content}
									filePath={selectedDiff.filePath}
									patch={selectedDiff.patch}
									comments={selectedEntryComments}
									onCopyComment={comment => {
										void markFilesReviewed([comment.filePath])
									}}
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
									onClick={() => {
										copyReviewComments(unresolvedComments)
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
	)
}

function CommitActionForm(input: {
	readonly base: string
	readonly cwd: string
	readonly dirty: boolean
	readonly githubThreadsLoading: boolean
	readonly hasWipCommits: boolean
	readonly prUrl?: string
	readonly refreshGithubThreads: () => void
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
					aria-label="Refresh GitHub comments"
					title="Refresh GitHub comments"
					disabled={input.githubThreadsLoading}
					className="border-r-0"
					onClick={input.refreshGithubThreads}
				>
					{input.githubThreadsLoading ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />}
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
	| {readonly file: GitReviewFile; readonly name: string; readonly path: string; readonly type: 'file'}

function buildFileTree(files: readonly GitReviewFile[]) {
	const root = {children: Array.empty<FileTreeNode>(), name: '', path: '', type: 'directory' as const}

	for (const file of files) {
		const parts = file.filePath.split('/')
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

		directory.children.push({file, name: parts.at(-1) ?? file.filePath, path: file.filePath, type: 'file'})
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
	readonly files: readonly GitReviewFile[]
	readonly openReviewEntry: (filePath: string) => void
	readonly reviewedFiles: ReadonlySet<string>
	readonly selectedEntry?: GitReviewFile
	readonly setFileReviewed: (filePath: string, reviewed: boolean) => void
}) {
	const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(new Set())
	const fileTree = buildFileTree(input.files)

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

		const reviewed = input.reviewedFiles.has(node.file.filePath)

		return (
			<li key={node.path} className="w-full min-w-0">
				<TreeExplorerRow
					selected={input.selectedEntry?.filePath === node.file.filePath}
					icon={<FileIcon filePath={node.file.filePath} className="size-3" />}
					actions={
						<div className="flex items-center gap-2">
							<ReviewCheckbox
								state={reviewed ? 'checked' : 'unchecked'}
								onClick={event => {
									event.stopPropagation()
									input.setFileReviewed(node.file.filePath, !reviewed)
								}}
							/>
							<DiffStatus status={node.file.status} />
						</div>
					}
					onClick={() => {
						input.openReviewEntry(node.file.filePath)
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
				{Array.isReadonlyArrayEmpty(input.files) ? (
					<li className="text-muted-foreground flex flex-1 items-center justify-center px-2 py-2">No changed files.</li>
				) : (
					Array.map(fileTree, renderNode)
				)}
			</TreeExplorerSection>
		</TreeExplorer>
	)
}

function commentKey(input: {
	readonly filePath: string
	readonly lineNumber: number
	readonly side?: 'additions' | 'deletions'
}) {
	return `${input.filePath}:${input.side ?? 'additions'}:${input.lineNumber}`
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
