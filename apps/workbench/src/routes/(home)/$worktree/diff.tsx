import {useAtomRefresh, useAtomSet, useAtomSuspense, useAtomValue} from '@effect/atom-react'

import {Array, Effect, HashMap, HashSet, Match, Option, Order, Predicate, Schema, Stream, String, pipe} from 'effect'

import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute} from '@tanstack/react-router'
import {AsyncResult, Atom} from 'effect/unstable/reactivity'
import {startTransition, useEffect, useReducer, useState, type MouseEvent} from 'react'

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
	FolderTreeIcon,
	GitCompareIcon,
	ListPlusIcon,
	MinusIcon,
	SearchIcon,
	SparklesIcon,
	UploadIcon
} from '@deslop/components/icons'
import {PatchDiff, formatCopiedComment} from '@deslop/components/render/diff'
import {TreeExplorer, TreeExplorerRow, TreeExplorerSection} from '@deslop/components/tree-explorer'
import {Button, buttonVariants} from '@deslop/components/ui/button'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@deslop/components/ui/dialog'
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput} from '@deslop/components/ui/input-group'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@deslop/components/ui/resizable'
import {toast} from '@deslop/components/ui/sonner'
import {Spinner} from '@deslop/components/ui/spinner'
import {cn, formatError} from '@deslop/components/utils'
import {
	GitReviewState,
	type GitCommit,
	GitDiff,
	type GitReviewFileEntry,
	type GitReviewViewMode,
	GitReviewComment,
	GitReviewBranchTarget,
	GitReviewChangesTarget,
	GitReviewCommitTarget,
	GitReviewLocalTarget,
	GitReviewStagedTarget,
	GitReviewUnstagedTarget,
	type GitReviewMark,
	type GitReviewTarget,
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
function targetKey(target: GitReviewTarget) {
	return `${target._tag}\u0000${target._tag === 'commit' ? target.hash : ''}`
}

function targetFromKey(tag: string, hash = '') {
	return Match.value(tag).pipe(
		Match.when('commit', () => GitReviewCommitTarget.make({hash})),
		Match.when('local', () => GitReviewLocalTarget.make({})),
		Match.when('branch', () => GitReviewBranchTarget.make({})),
		Match.when('staged', () => GitReviewStagedTarget.make({})),
		Match.when('unstaged', () => GitReviewUnstagedTarget.make({})),
		Match.orElse(() => GitReviewChangesTarget.make({}))
	)
}

const reviewFileEntriesAtom = Atom.family((key: string) => {
	const parts = key.split('\u0000')
	const cwd = parts[0] ?? ''
	const target = targetFromKey(parts[1] ?? 'changes', parts[2] ?? '')
	const viewMode = (parts[3] === 'unfiltered' ? 'unfiltered' : 'filtered') satisfies GitReviewViewMode

	return RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('review.fileEntries', {cwd, target, viewMode})),
			Stream.unwrap
		)
	)
})

const reviewFileContentAtom = Atom.family((key: string) => {
	const parts = key.split('\u0000')
	const cwd = parts[0] ?? ''
	const target = targetFromKey(parts[1] ?? 'changes', parts[2] ?? '')
	const viewMode = (parts[3] === 'unfiltered' ? 'unfiltered' : 'filtered') satisfies GitReviewViewMode
	const filePath = parts[5] ?? ''

	if (String.isEmpty(filePath)) {
		return RpcClient.runtime.atom(
			Effect.succeed(GitDiff.make({filePath: '', segments: Array.empty(), status: 'modified'}))
		)
	}

	return RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.flatMap(client => client('review.fileContent', {cwd, filePath, target, viewMode}))
		)
	)
})

const reviewStateAtom = Atom.family((cwd: string) =>
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('review.state', {cwd})),
			Stream.unwrap
		)
	)
)

const emptyReviewState = GitReviewState.make({comments: Array.empty(), marks: Array.empty()})

const reviewStateValueAtom = Atom.family((cwd: string) =>
	Atom.map(reviewStateAtom(cwd), result => (AsyncResult.isSuccess(result) ? result.value : emptyReviewState))
)

const reviewActionsStateAtom = Atom.family(() =>
	Atom.optimistic(Atom.make(() => ({generatingMessage: false, publishing: false, stagingAll: false})))
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

const stageAllActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(reviewActionsStateAtom(cwd), {
		fn: RpcClient.runtime.fn<null>()(
			Effect.fn('DiffPage.stageAll')(function* (_) {
				const client = yield* RpcClient
				yield* client('review.stageAll', {cwd})
			})
		),
		reducer: state => ({...state, stagingAll: true})
	})
)

const commentResolutionStateAtom = Atom.family(() =>
	Atom.optimistic(Atom.make(() => ({resolving: HashSet.empty<GitReviewComment>(), resolvingAll: false})))
)

const resolveCommentActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(commentResolutionStateAtom(cwd), {
		fn: RpcClient.runtime.fn<{readonly comment: GitReviewComment & {readonly source: 'github' | 'local'}}>()(
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
			resolving: HashSet.add(state.resolving, GitReviewComment.make(resolveInput.comment)),
			resolvingAll: state.resolvingAll
		})
	})
)

const resolveCommentsActionAtom = Atom.family((cwd: string) =>
	Atom.optimisticFn(commentResolutionStateAtom(cwd), {
		fn: RpcClient.runtime.fn<readonly {readonly comment: GitReviewComment & {readonly source: 'github' | 'local'}}[]>()(
			Effect.fn('DiffPage.resolveComments')(function* (comments) {
				const client = yield* RpcClient

				yield* pipe(
					comments,
					Array.dedupeWith(
						(left, right) =>
							Predicate.isNotUndefined(left.comment.threadId) && left.comment.threadId === right.comment.threadId
					),
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

function groupCommentsByFile<Comment extends {readonly filePath: string}>(comments: readonly Comment[]) {
	return pipe(
		comments,
		Array.reduce(HashMap.empty<string, readonly Comment[]>(), (groups, comment) =>
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

async function copyReviewComments(
	commentsToCopy: readonly (GitReviewComment & {readonly source: 'github' | 'local'})[]
) {
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

function loadedDiffsReducer(current: HashMap.HashMap<string, GitDiff>, diff: GitDiff | null) {
	if (Predicate.isNull(diff)) return HashMap.empty<string, GitDiff>()
	return HashMap.set(current, diff.filePath, diff)
}

function fuzzyFileScore(filePath: string, query: string) {
	const normalizedPath = String.toLowerCase(filePath)
	const normalizedQuery = String.toLowerCase(String.trim(query))
	if (String.isEmpty(normalizedQuery)) return 0
	const exactMatch = String.indexOf(normalizedQuery)(normalizedPath)
	if (Option.isSome(exactMatch)) return exactMatch.value

	const match = pipe(
		Array.fromIterable(normalizedPath),
		Array.map((character, pathIndex) => ({character, pathIndex})),
		Array.reduce({queryIndex: 0, score: 0}, (current, item) =>
			current.queryIndex === String.length(normalizedQuery) || item.character !== normalizedQuery[current.queryIndex]
				? current
				: {queryIndex: current.queryIndex + 1, score: current.score + item.pathIndex}
		)
	)

	return match.queryIndex === String.length(normalizedQuery)
		? match.score + String.length(normalizedPath)
		: Number.POSITIVE_INFINITY
}

function filterReviewEntries(entries: readonly GitReviewFileEntry[], query: string) {
	const searched = pipe(
		entries,
		Array.map(entry => ({entry, score: fuzzyFileScore(entry.filePath, query)})),
		Array.filter(result => result.score < Number.POSITIVE_INFINITY),
		Array.sortWith(result => `${result.score}:${result.entry.filePath}`, Order.String),
		Array.map(result => result.entry)
	)
	return String.isEmpty(String.trim(query)) ? entries : searched
}

function ReviewViewPanel(input: {readonly cwd: string}) {
	const navigate = Route.useNavigate()
	const search = Route.useSearch()
	const suggestedMetadata = useAtomValue(suggestedMetadataAtom(input.cwd))
	const reviewStateValue = useAtomValue(reviewStateValueAtom(input.cwd))
	const shortcutsOpenState = useState(false)
	const selectedScopeState = useState<GitReviewTarget>(() => GitReviewChangesTarget.make({}))
	const viewModeState = useState<GitReviewViewMode>('filtered')
	const selectedFilePathState = useState('')
	const [fileSearch, setFileSearch] = useReducer<string, [string]>((_current, next) => next, '')
	const [loadedDiffs, updateLoadedDiffs] = useReducer(loadedDiffsReducer, HashMap.empty<string, GitDiff>())
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
	const reviewTarget = selectedCommit ? GitReviewCommitTarget.make({hash: selectedCommit.hash}) : selectedScopeState[0]
	const reviewEntries = reviewFileEntriesAtom(`${input.cwd}\u0000${targetKey(reviewTarget)}\u0000${viewModeState[0]}`)
	const reviewEntriesResult = useAtomValue(reviewEntries)
	const reviewEntriesValue = AsyncResult.isSuccess(reviewEntriesResult)
		? reviewEntriesResult.value
		: Array.empty<GitReviewFileEntry>()
	const searchingFiles = String.isNonEmpty(String.trim(fileSearch))
	const visibleReviewEntries = filterReviewEntries(reviewEntriesValue, fileSearch)
	const selectedFilePath =
		String.isNonEmpty(selectedFilePathState[0]) &&
		Array.some(visibleReviewEntries, entry => entry.filePath === selectedFilePathState[0])
			? selectedFilePathState[0]
			: ''
	const selectedListEntry =
		(String.isNonEmpty(selectedFilePath)
			? pipe(
					visibleReviewEntries,
					Array.findFirst(entry => entry.filePath === selectedFilePath),
					Option.getOrUndefined
				)
			: undefined) ?? (searchingFiles ? undefined : visibleReviewEntries[0])
	const selectedContentKey = selectedListEntry
		? `${input.cwd}\u0000${targetKey(reviewTarget)}\u0000${viewModeState[0]}\u0000${selectedListEntry.revision ?? ''}\u0000${selectedListEntry.filePath}`
		: ''
	const selectedContent = reviewFileContentAtom(selectedContentKey)
	const selectedContentResult = useAtomValue(selectedContent)
	const refreshSelectedContent = useAtomRefresh(selectedContent)
	function selectedReviewEntry() {
		if (
			AsyncResult.isSuccess(selectedContentResult) &&
			selectedContentResult.value.filePath === selectedListEntry?.filePath
		) {
			return selectedContentResult.value
		}
		if (selectedListEntry) {
			return pipe(
				loadedDiffs,
				HashMap.get(selectedListEntry.filePath),
				Option.getOrElse(() =>
					GitDiff.make({
						filePath: selectedListEntry.filePath,
						segments: Array.empty(),
						status: selectedListEntry.status
					})
				)
			)
		}
		return null
	}
	const selectedEntry = selectedReviewEntry()
	const refreshEntries = useAtomRefresh(reviewEntries)
	const refreshSuggestedMetadata = useAtomRefresh(suggestedMetadataAtom(input.cwd))
	const refreshReviewState = useAtomRefresh(reviewStateAtom(input.cwd))
	const saveComment = useAtomSet(RpcClient.mutation('review.comments.save'), {mode: 'promise'})
	const resolveComment = useAtomSet(resolveCommentActionAtom(input.cwd), {mode: 'promise'})
	const resolveComments = useAtomSet(resolveCommentsActionAtom(input.cwd), {mode: 'promise'})
	const commentResolutionState = useAtomValue(commentResolutionStateAtom(input.cwd))
	const markReviewed = useAtomSet(RpcClient.mutation('review.state.mark'), {mode: 'promise'})
	const unmarkReviewed = useAtomSet(RpcClient.mutation('review.state.unmark'), {mode: 'promise'})
	const loadReviewFileContent = useAtomSet(RpcClient.mutation('review.fileContent'), {mode: 'promise'})
	const effectiveComments = Array.map(reviewStateValue.comments, comment => ({
		...comment,
		resolved: comment.resolved === true,
		resolving: HashSet.has(commentResolutionState.resolving, comment),
		source: comment.source ?? 'local'
	}))
	const unresolvedComments = Array.filter(effectiveComments, comment => !comment.resolved)
	const unresolvedCommentInputs = Array.map(unresolvedComments, comment => ({comment}))
	const commentsByFile = groupCommentsByFile(unresolvedComments)
	const selectedEntryComments = selectedEntry
		? Array.filter(effectiveComments, comment => comment.filePath === selectedEntry.filePath)
		: Array.empty()
	const loadedReviewDiffs = Array.fromIterable(HashMap.values(loadedDiffs))
	const visibleSegmentKeys = pipe(loadedReviewDiffs, Array.flatMap(gitReviewMarksForDiff), HashSet.fromIterable)
	const validReviewMarks = Array.filter(reviewStateValue.marks, mark => HashSet.has(visibleSegmentKeys, mark))
	const emptyReviewLabel = Match.value({searching: searchingFiles, viewMode: viewModeState[0]}).pipe(
		Match.when({searching: true}, () => 'No matching files.'),
		Match.when({viewMode: 'filtered'}, () => 'No changed files.'),
		Match.orElse(() => 'No files.')
	)
	const modeToggleLabel = viewModeState[0] === 'filtered' ? 'Show all files' : 'Show changed files'

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

	async function markReviewFile(filePath: string) {
		try {
			const diff = await loadReviewFileContent({
				payload: {cwd: input.cwd, filePath, target: reviewTarget, viewMode: viewModeState[0]}
			})
			updateLoadedDiffs(diff)
			const marks = gitReviewMarksForDiff(diff)
			if (!Array.isReadonlyArrayEmpty(marks)) await markReviewed({payload: {cwd: input.cwd, marks}})
		} catch {
			toast.error('Failed to mark file reviewed.')
		}
	}

	function openFile(filePath: string) {
		selectedFilePathState[1](filePath)
		const marks = pipe(
			selectedEntry?.filePath === filePath ? [selectedEntry] : Array.empty<GitDiff>(),
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
		setFileSearch('')
		updateLoadedDiffs(null)
	}

	function refreshReview() {
		refreshEntries()
		refreshSuggestedMetadata()
		refreshReviewState()
		selectedFilePathState[1]('')
		updateLoadedDiffs(null)
	}

	async function saveQueuedComment(comment: typeof GitReviewComment.Type) {
		try {
			await saveComment({payload: {comment, cwd: input.cwd}})
		} catch {
			toast.error('Failed to save comment.')
		}
	}

	async function resolveReviewComment(comment: GitReviewComment & {readonly source: 'github' | 'local'}) {
		try {
			await resolveComment({comment})
			if (comment.source === 'github') refreshReviewState()
		} catch {
			toast.error(comment.source === 'github' ? 'Failed to resolve GitHub thread.' : 'Failed to resolve comment.')
		}
	}

	async function resolveReviewComments(
		commentsToResolve: readonly {readonly comment: GitReviewComment & {readonly source: 'github' | 'local'}}[]
	) {
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

	useEffect(() => {
		if (!selectedListEntry || !AsyncResult.isSuccess(reviewEntriesResult)) return
		refreshSelectedContent()
	}, [refreshSelectedContent, reviewEntriesResult, selectedListEntry])

	useEffect(() => {
		if (!AsyncResult.isSuccess(selectedContentResult)) return
		updateLoadedDiffs(selectedContentResult.value)
		const marks = gitReviewMarksForDiff(selectedContentResult.value)
		if (Array.isReadonlyArrayEmpty(marks)) return

		async function markLoadedFileReviewed() {
			try {
				await markReviewed({payload: {cwd: input.cwd, marks}})
			} catch {
				toast.error('Failed to mark file reviewed.')
			}
		}

		void markLoadedFileReviewed()
	}, [input.cwd, markReviewed, selectedContentResult])

	return (
		<>
			<Dialog
				open={shortcutsOpenState[0]}
				onOpenChange={open => {
					shortcutsOpenState[1](open)
				}}
			>
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
							hasReviewableChanges={
								AsyncResult.isSuccess(reviewEntriesResult) && !Array.isReadonlyArrayEmpty(reviewEntriesValue)
							}
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
									<div className="flex h-full min-h-0 flex-col">
										<div className="border-b p-2">
											<InputGroup>
												<InputGroupAddon>
													<SearchIcon />
												</InputGroupAddon>
												<InputGroupInput
													value={fileSearch}
													placeholder="Search files"
													onChange={event => {
														setFileSearch(event.currentTarget.value)
													}}
												/>
												<InputGroupAddon align="inline-end">
													<InputGroupButton
														size="icon-xs"
														aria-label={modeToggleLabel}
														title={modeToggleLabel}
														onClick={() => {
															viewModeState[1](current => (current === 'filtered' ? 'unfiltered' : 'filtered'))
															selectedFilePathState[1]('')
															updateLoadedDiffs(null)
														}}
													>
														{viewModeState[0] === 'filtered' ? <FolderTreeIcon /> : <GitCompareIcon />}
													</InputGroupButton>
												</InputGroupAddon>
											</InputGroup>
										</div>
										{AsyncResult.isSuccess(reviewEntriesResult) ? (
											<DiffList
												entries={visibleReviewEntries}
												loadedDiffs={loadedReviewDiffs}
												marks={validReviewMarks}
												markReviewed={marks => {
													void markFileReviewed(marks)
												}}
												unmarkReviewed={marks => {
													void unmarkFileReviewed(marks)
												}}
												selectedEntry={selectedEntry ?? undefined}
												markReviewEntry={filePath => {
													void markReviewFile(filePath)
												}}
												openReviewEntry={openFile}
												viewMode={viewModeState[0]}
											/>
										) : (
											<div className="flex min-h-0 flex-1">
												<Loading />
											</div>
										)}
									</div>
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
							{!AsyncResult.isSuccess(reviewEntriesResult) && (
								<div className="flex h-full min-h-0">
									<Loading />
								</div>
							)}
							{AsyncResult.isSuccess(reviewEntriesResult) && Array.isReadonlyArrayEmpty(visibleReviewEntries) && (
								<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
									{emptyReviewLabel}
								</div>
							)}
							{AsyncResult.isSuccess(reviewEntriesResult) &&
								!Array.isReadonlyArrayEmpty(visibleReviewEntries) &&
								!selectedEntry && (
									<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
										Select a file.
									</div>
								)}
							{AsyncResult.isSuccess(reviewEntriesResult) && selectedEntry && (
								<div className="flex h-full min-h-0 min-w-0 flex-col">
									<div className="grid h-8 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b px-3 text-xs">
										<div className="min-w-0 truncate font-mono" title={selectedEntry.filePath}>
											{selectedEntry.filePath}
										</div>
										<div className="flex min-w-0 items-center">
											<DiffStatus status={selectedEntry.status} />
										</div>
									</div>
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
	readonly upstream?: {readonly ahead: number; readonly behind: number}
}) {
	const commitMessageState = useState('')
	const actionState = useAtomValue(reviewActionsStateAtom(input.cwd))
	const generatePublishMessage = useAtomSet(generatePublishMessageActionAtom(input.cwd), {mode: 'promise'})
	const approvePublish = useAtomSet(approvePublishActionAtom(input.cwd), {mode: 'promise'})
	const stageAll = useAtomSet(stageAllActionAtom(input.cwd), {mode: 'promise'})
	const trimmedCommitMessage = pipe(commitMessageState[0], String.trim)
	const commitMessagePlaceholder = Match.value({dirty: input.dirty, loading: input.loading}).pipe(
		Match.when({loading: true}, () => 'Loading'),
		Match.when({dirty: true}, () => 'Generate commit message'),
		Match.orElse(() => 'No changes')
	)
	const messageLines = String.split(/\r?\n/)(trimmedCommitMessage)
	const messageSubject = String.trim(messageLines[0])
	const messageBody = pipe(Array.drop(messageLines, 1), Array.join('\n'), String.trim)
	const subjectContent = Match.value({
		generating: actionState.generatingMessage,
		hasSubject: String.isNonEmpty(messageSubject),
		publishing: actionState.publishing,
		staging: actionState.stagingAll
	}).pipe(
		Match.when({publishing: true}, () => 'Publishing'),
		Match.when({staging: true}, () => 'Staging files'),
		Match.when({generating: true}, () => 'Generating commit message'),
		Match.when({hasSubject: true}, () => messageSubject),
		Match.orElse(() => commitMessagePlaceholder)
	)

	async function submitPublish() {
		if (
			input.loading ||
			actionState.publishing ||
			(input.dirty ? !input.hasReviewableChanges : !input.unpushedCommits) ||
			(input.dirty && String.isEmpty(trimmedCommitMessage))
		) {
			return
		}

		try {
			await approvePublish(trimmedCommitMessage)
			commitMessageState[1]('')
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
			!input.dirty ||
			!input.hasReviewableChanges
		) {
			return
		}

		try {
			commitMessageState[1](await generatePublishMessage(null))
		} catch (error) {
			toast.error(formatError(error))
		}
	}

	async function stageAllFiles() {
		if (input.loading || actionState.stagingAll || actionState.publishing || !input.hasReviewableChanges) {
			return
		}

		try {
			await stageAll(null)
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
				title="Generate commit message"
				disabled={
					input.loading ||
					actionState.generatingMessage ||
					actionState.stagingAll ||
					actionState.publishing ||
					!input.dirty ||
					!input.hasReviewableChanges
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
				aria-label="Stage all files"
				title="Stage all files"
				disabled={input.loading || actionState.stagingAll || actionState.publishing || !input.hasReviewableChanges}
				onClick={() => {
					void stageAllFiles()
				}}
			>
				{actionState.stagingAll ? <Spinner className="size-2.5 border opacity-60" /> : <ListPlusIcon />}
			</Button>
			<Button
				type="submit"
				variant="ghost"
				size="icon-xs"
				className="size-4"
				aria-label="Publish"
				title="Commit, push, and open a draft PR"
				disabled={
					input.loading ||
					actionState.publishing ||
					actionState.stagingAll ||
					(input.dirty ? !input.hasReviewableChanges : !input.unpushedCommits) ||
					(input.dirty && String.isEmpty(trimmedCommitMessage))
				}
			>
				{actionState.publishing ? <Spinner className="size-2.5 border opacity-60" /> : <UploadIcon />}
			</Button>
			{input.loading ? (
				<span className="text-muted-foreground flex size-4 items-center justify-center">
					<Spinner className="size-2.5 border opacity-60" />
				</span>
			) : (
				String.isNonEmpty(input.prUrl ?? '') && (
					<a
						className={cn(buttonVariants({size: 'icon-xs', variant: 'ghost'}), 'size-4')}
						href={pipe(
							URL.parse(input.prUrl ?? ''),
							Option.fromNullishOr,
							Option.filter(parsed => parsed.protocol === 'https:' && parsed.hostname === 'github.com'),
							Option.map(parsed => parsed.href),
							Option.getOrUndefined
						)}
						target="_blank"
						rel="noopener noreferrer"
						aria-label="Open pull request"
						title="Open pull request"
					>
						<ExternalLinkIcon />
					</a>
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
	readonly branchCommits: readonly GitCommit[]
	readonly loading: boolean
	readonly localCommits: readonly GitCommit[]
	readonly selected: GitReviewTarget
	readonly selectCommit: (commit: GitCommit) => void
	readonly selectScope: (target: GitReviewTarget) => void
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
					detail="all"
					label="Changes"
					selected={input.selected}
					selectScope={input.selectScope}
					target={GitReviewChangesTarget.make({})}
				/>
				<CommitScopeRow
					detail="index"
					label="Staged"
					selected={input.selected}
					selectScope={input.selectScope}
					target={GitReviewStagedTarget.make({})}
				/>
				<CommitScopeRow
					detail="worktree"
					label="Unstaged"
					selected={input.selected}
					selectScope={input.selectScope}
					target={GitReviewUnstagedTarget.make({})}
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
	readonly detail: string
	readonly label: string
	readonly selected: GitReviewTarget
	readonly selectScope: (target: GitReviewTarget) => void
	readonly target: GitReviewTarget
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

type FileTreeNode =
	| {readonly children: FileTreeNode[]; readonly name: string; readonly path: string; readonly type: 'directory'}
	| {readonly entry: GitReviewFileEntry; readonly name: string; readonly path: string; readonly type: 'file'}

function buildFileTree(entries: readonly GitReviewFileEntry[]) {
	const root = {children: Array.empty<FileTreeNode>(), name: '', path: '', type: 'directory' as const}

	function insert(
		directory: Extract<FileTreeNode, {readonly type: 'directory'}>,
		parts: readonly string[],
		entry: GitReviewFileEntry
	) {
		if (Predicate.isUndefined(parts[0])) {
			directory.children.push({entry, name: entry.filePath, path: entry.filePath, type: 'file'})
			return
		}
		if (Array.length(parts) === 1) {
			directory.children.push({entry, name: parts[0], path: entry.filePath, type: 'file'})
			return
		}

		const path = directory.path ? `${directory.path}/${parts[0]}` : parts[0]
		const directoryChild = pipe(
			directory.children,
			Array.findFirst(child => child.name === parts[0]),
			Option.getOrUndefined
		)

		if (directoryChild?.type === 'directory') {
			insert(directoryChild, Array.drop(parts, 1), entry)
			return
		}

		const next = {children: Array.empty<FileTreeNode>(), name: parts[0], path, type: 'directory' as const}
		directory.children.push(next)
		insert(next, Array.drop(parts, 1), entry)
	}

	for (const entry of entries) {
		insert(root, String.split('/')(entry.filePath), entry)
	}

	return pipe(
		root.children,
		Array.map(node => (node.type === 'directory' ? collapseSingleChildDirectory(node) : node)),
		sortFileTreeNodes
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

function sortFileTreeNodes(nodes: readonly FileTreeNode[]): readonly FileTreeNode[] {
	return pipe(
		nodes,
		Array.map(node =>
			node.type === 'directory' ? {...node, children: Array.fromIterable(sortFileTreeNodes(node.children))} : node
		),
		Array.sortWith(node => `${node.type === 'directory' ? '0' : '1'}:${node.name}`, Order.String)
	)
}

function DiffList(input: {
	readonly entries: readonly GitReviewFileEntry[]
	readonly markReviewEntry: (filePath: string) => void
	readonly loadedDiffs: readonly GitDiff[]
	readonly markReviewed: (marks: readonly GitReviewMark[]) => void
	readonly marks: readonly GitReviewMark[]
	readonly openReviewEntry: (filePath: string) => void
	readonly selectedEntry?: GitDiff
	readonly unmarkReviewed: (marks: readonly GitReviewMark[]) => void
	readonly viewMode: GitReviewViewMode
}) {
	const collapsedFoldersState = useState(() => HashSet.empty<string>())
	const fileTree = buildFileTree(input.entries)
	const marksByDiff = pipe(
		input.loadedDiffs,
		Array.reduce(HashMap.empty<string, readonly GitReviewMark[]>(), (marks, diff) =>
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
							collapsedFoldersState[1](current =>
								HashSet.has(current, node.path) ? HashSet.remove(current, node.path) : HashSet.add(current, node.path)
							)
						}}
						actions={<span className="text-muted-foreground">{Array.length(node.children)}</span>}
					>
						{node.name}
					</TreeExplorerRow>
					{!HashSet.has(collapsedFoldersState[0], node.path) && (
						<ul className="border-border/70 ml-[19px] flex flex-col border-l pl-2">
							{Array.map(node.children, renderNode)}
						</ul>
					)}
				</li>
			)
		}

		const marks = pipe(
			marksByDiff,
			HashMap.get(node.entry.filePath),
			Option.getOrElse(() => Array.empty<GitReviewMark>())
		)
		const state = gitReviewStateForMarks(marks, reviewed)

		return (
			<li key={node.path} className="w-full min-w-0">
				<TreeExplorerRow
					selected={input.selectedEntry?.filePath === node.entry.filePath}
					icon={<FileIcon filePath={node.entry.filePath} className="size-3" />}
					actions={
						<div className="flex items-center gap-2">
							{node.entry.status !== 'unchanged' && (
								<ReviewCheckbox
									state={state}
									onClick={event => {
										event.stopPropagation()
										if (Array.isReadonlyArrayEmpty(marks)) {
											input.markReviewEntry(node.entry.filePath)
											return
										}
										if (state === 'checked') {
											input.unmarkReviewed(marks)
										} else {
											input.markReviewed(marks)
										}
									}}
								/>
							)}
							<DiffStatus status={node.entry.status} />
						</div>
					}
					onClick={() => {
						input.openReviewEntry(node.entry.filePath)
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
				{Array.isReadonlyArrayEmpty(input.entries) ? (
					<li className="text-muted-foreground flex flex-1 items-center justify-center px-2 py-2">
						{input.viewMode === 'filtered' ? 'No changed files.' : 'No files.'}
					</li>
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
		Match.when('unchanged', () => null),
		Match.orElse(() => <span className="text-amber-600 dark:text-amber-400">M</span>)
	)
}
