import {Effect, Layer} from 'effect'

import {
	AlignJustify,
	Check,
	CircleDot,
	Download,
	FileCode2,
	GitBranch,
	GitPullRequest,
	Layers3,
	MessageSquare,
	RefreshCcw,
	Sparkles,
	Square,
	Undo2,
	UploadCloud
} from '@ai-toolkit/components/icons'
import {Badge} from '@ai-toolkit/components/ui/badge'
import {Button} from '@ai-toolkit/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@ai-toolkit/components/ui/card'
import {Input} from '@ai-toolkit/components/ui/input'
import {Textarea} from '@ai-toolkit/components/ui/textarea'
import {cn} from '@ai-toolkit/components/utils'
import {useAtomSuspense} from '@effect-atom/atom-react'
import {createFileRoute} from '@tanstack/react-router'
import * as Runtime from 'effect/Runtime'
import {useEffect, useMemo, useState} from 'react'

import {ApiClient, AtomRuntime, LiveLayers} from '#lib/atomRuntime.ts'
import type {
	AiContent,
	CommentInput,
	FileChange,
	FileDiff,
	PlanExport,
	PullRequestResult,
	RepoState,
	Comment as RpcComment,
	StageTarget
} from '#rpcs/repos/contracts.ts'

export const Route = createFileRoute('/(home)/')({component: RouteComponent})

type RepoStateType = typeof RepoState.Type
type FileChangeType = typeof FileChange.Type
type FileDiffType = typeof FileDiff.Type
type StageTargetType = typeof StageTarget.Type
type CommentType = typeof RpcComment.Type
type CommentInputType = typeof CommentInput.Type
type AiContentType = typeof AiContent.Type
type PlanExportType = typeof PlanExport.Type
type PullRequestResultType = typeof PullRequestResult.Type

const emptyState: RepoStateType = {name: '', path: '', branch: '', staged: [], unstaged: []}
const emptyDiff: FileDiffType = {repoPath: '', filePath: '', staged: false, hunks: []}

function RouteComponent() {
	const [reposKey, setReposKey] = useState(0)
	const [rootsKey, setRootsKey] = useState(0)
	const [stateKey, setStateKey] = useState(0)
	const [diffKey, setDiffKey] = useState(0)
	const [commentsKey, setCommentsKey] = useState(0)
	const [selectedRepo, setSelectedRepo] = useState<string>()
	const [selectedFile, setSelectedFile] = useState<FileChangeType>()
	const [scope, setScope] = useState<'staged' | 'unstaged'>('unstaged')
	const [rangeSelection, setRangeSelection] = useState<{hunkId: string; start: number; end: number}>()
	const [search, setSearch] = useState('')
	const [newRoot, setNewRoot] = useState('')
	const [commentText, setCommentText] = useState('')
	const [commentScope, setCommentScope] = useState<'global' | 'file' | 'range'>('global')
	const [aiContent, setAiContent] = useState<AiContentType>()
	const [planMarkdown, setPlanMarkdown] = useState('')
	const [branchInput, setBranchInput] = useState('')
	const [prTitle, setPrTitle] = useState('')
	const [prBody, setPrBody] = useState('')
	const clientLayer = useMemo(() => Layer.mergeAll(LiveLayers, ApiClient.layer), [])
	const runtime = useMemo(() => Effect.runPromise(Layer.toRuntime(clientLayer).pipe(Effect.scoped)), [clientLayer])

	const rootsAtom = useMemo(() => {
		const refresh = rootsKey
		return AtomRuntime.atom(
			Effect.gen(function* () {
				const client = yield* ApiClient
				void refresh
				return yield* client('ListRoots', void 0)
			})
		)
	}, [rootsKey])

	const reposAtom = useMemo(() => {
		const refresh = reposKey
		return AtomRuntime.atom(
			Effect.gen(function* () {
				const client = yield* ApiClient
				void refresh
				return yield* client('ListRepositories', void 0)
			})
		)
	}, [reposKey])

	const repoStateAtom = useMemo(() => {
		if (!selectedRepo) return AtomRuntime.atom(Effect.succeed(emptyState))

		return AtomRuntime.atom(
			Effect.gen(function* () {
				const client = yield* ApiClient
				const refresh = stateKey
				void refresh
				return yield* client('GetRepository', selectedRepo)
			})
		)
	}, [selectedRepo, stateKey])

	const diffAtom = useMemo(() => {
		if (!(selectedRepo && selectedFile)) return AtomRuntime.atom(Effect.succeed(emptyDiff))

		return AtomRuntime.atom(
			Effect.gen(function* () {
				const client = yield* ApiClient
				const refresh = diffKey
				void refresh
				return yield* client('GetDiff', {
					repoPath: selectedRepo,
					filePath: selectedFile.path,
					staged: scope === 'staged'
				})
			})
		)
	}, [selectedRepo, selectedFile, scope, diffKey])

	const commentsAtom = useMemo(() => {
		if (!selectedRepo) return AtomRuntime.atom(Effect.succeed<CommentType[]>([]))

		return AtomRuntime.atom(
			Effect.gen(function* () {
				const client = yield* ApiClient
				const refresh = commentsKey
				void refresh
				return yield* client('ListComments', selectedRepo)
			})
		)
	}, [selectedRepo, commentsKey])

	const {value: roots} = useAtomSuspense(rootsAtom)
	const {value: repositories} = useAtomSuspense(reposAtom)
	const {value: repoState} = useAtomSuspense(repoStateAtom)
	const {value: diff} = useAtomSuspense(diffAtom)
	const {value: comments} = useAtomSuspense(commentsAtom)

	function runEffect<T, E>(effect: Effect.Effect<T, E, ApiClient>) {
		return runtime.then(runtimeInstance => Runtime.runPromise(runtimeInstance, effect))
	}

	function rescan() {
		return runEffect(
			Effect.gen(function* () {
				const client = yield* ApiClient
				return yield* client('ScanRepositories', void 0)
			})
		)
	}

	function addRoot(root: string) {
		return runEffect(
			Effect.gen(function* () {
				const client = yield* ApiClient
				return yield* client('AddRoot', root)
			})
		)
	}

	function removeRoot(root: string) {
		return runEffect(
			Effect.gen(function* () {
				const client = yield* ApiClient
				return yield* client('RemoveRoot', root)
			})
		)
	}

	function stageTargets(input: {repoPath: string; targets: readonly StageTargetType[]}) {
		return runEffect(
			Effect.gen(function* () {
				const client = yield* ApiClient
				return yield* client('StageTargets', input)
			})
		)
	}

	function revertTargets(input: {repoPath: string; targets: readonly StageTargetType[]}) {
		return runEffect(
			Effect.gen(function* () {
				const client = yield* ApiClient
				return yield* client('RevertTargets', input)
			})
		)
	}

	function saveComment(input: {repoPath: string; comment: CommentInputType}) {
		return runEffect(
			Effect.gen(function* () {
				const client = yield* ApiClient
				return yield* client('SaveComment', {repoPath: input.repoPath, comment: input.comment})
			})
		)
	}

	function generateContent(repoPath: string) {
		return runEffect(
			Effect.gen(function* () {
				const client = yield* ApiClient
				return yield* client('GenerateContent', repoPath)
			})
		)
	}

	function exportPlan(repoPath: string) {
		return runEffect(
			Effect.gen(function* () {
				const client = yield* ApiClient
				return yield* client('ExportPlan', repoPath)
			})
		)
	}

	function createPullRequest(input: {repoPath: string; title: string; body: string; branch: string}) {
		return runEffect(
			Effect.gen(function* () {
				const client = yield* ApiClient
				return yield* client('CreatePullRequest', input)
			})
		)
	}

	useEffect(() => {
		if (!selectedRepo) return
		if (repoState.path.length === 0) return
		if (selectedFile) return

		const preferred = repoState.unstaged.at(0) ?? repoState.staged.at(0)
		if (preferred) {
			setSelectedFile(preferred)
			setScope(repoState.unstaged.length > 0 ? 'unstaged' : 'staged')
		}
	}, [selectedRepo, repoState, selectedFile])

	useEffect(() => {
		if (!repoState.path) return
		if (branchInput.length > 0) return
		setBranchInput(repoState.branch)
		setPrTitle(`Update ${repoState.name}`)
		setPrBody(`## Summary\n- Updates in ${repoState.name}`)
	}, [repoState, branchInput])

	function handleSelectRepo(pathValue: string) {
		setSelectedRepo(pathValue)
		setSelectedFile(undefined)
		setScope('unstaged')
		setRangeSelection(undefined)
		setStateKey(value => value + 1)
		setDiffKey(value => value + 1)
		setCommentsKey(value => value + 1)
		setAiContent(undefined)
		setPlanMarkdown('')
		setBranchInput('')
		setPrTitle('')
		setPrBody('')
	}

	function handleRescan() {
		rescan().then(() => {
			setReposKey(value => value + 1)
			setStateKey(value => value + 1)
		})
	}

	function handleAddRoot() {
		if (newRoot.trim().length === 0) return
		addRoot(newRoot.trim()).then(() => {
			setRootsKey(value => value + 1)
			handleRescan()
			setNewRoot('')
		})
	}

	function handleRemoveRoot(rootPath: string) {
		removeRoot(rootPath).then(() => {
			setRootsKey(value => value + 1)
			handleRescan()
		})
	}

	function handleSelectFile(file: FileChangeType, nextScope: 'staged' | 'unstaged') {
		setSelectedFile(file)
		setScope(nextScope)
		setRangeSelection(undefined)
		setDiffKey(value => value + 1)
	}

	function stageFiles(targets: readonly StageTargetType[]) {
		if (!selectedRepo) return
		stageTargets({repoPath: selectedRepo, targets}).then(() => {
			rescan().then(() => setReposKey(value => value + 1))
			setStateKey(value => value + 1)
			setDiffKey(value => value + 1)
		})
	}

	function revertFiles(targets: readonly StageTargetType[]) {
		if (!selectedRepo) return
		revertTargets({repoPath: selectedRepo, targets}).then(() => {
			rescan().then(() => setReposKey(value => value + 1))
			setStateKey(value => value + 1)
			setDiffKey(value => value + 1)
		})
	}

	function handleStageFile() {
		if (!(selectedRepo && selectedFile)) return
		stageFiles([{scope: 'file', filePath: selectedFile.path, staged: scope === 'staged'}])
	}

	function handleRevertFile() {
		if (!(selectedRepo && selectedFile)) return
		revertFiles([{scope: 'file', filePath: selectedFile.path, staged: scope === 'staged'}])
	}

	function handleStageHunk(hunkId: string) {
		if (!(selectedRepo && selectedFile)) return
		stageFiles([{scope: 'hunk', filePath: selectedFile.path, staged: scope === 'staged', hunkId}])
	}

	function handleRevertHunk(hunkId: string) {
		if (!(selectedRepo && selectedFile)) return
		revertFiles([{scope: 'hunk', filePath: selectedFile.path, staged: scope === 'staged', hunkId}])
	}

	function handleRangeSelection(hunkId: string, index: number) {
		if (rangeSelection && rangeSelection.hunkId === hunkId) {
			const start = Math.min(rangeSelection.start, index)
			const end = Math.max(rangeSelection.start, index)
			setRangeSelection({hunkId, start, end})
			return
		}
		setRangeSelection({hunkId, start: index, end: index})
	}

	function handleStageRange() {
		if (!(selectedRepo && selectedFile && rangeSelection)) return
		stageFiles([
			{
				scope: 'range',
				filePath: selectedFile.path,
				staged: scope === 'staged',
				hunkId: rangeSelection.hunkId,
				start: rangeSelection.start,
				end: rangeSelection.end
			}
		])
	}

	function handleRevertRange() {
		if (!(selectedRepo && selectedFile && rangeSelection)) return
		revertFiles([
			{
				scope: 'range',
				filePath: selectedFile.path,
				staged: scope === 'staged',
				hunkId: rangeSelection.hunkId,
				start: rangeSelection.start,
				end: rangeSelection.end
			}
		])
	}

	function handleSaveComment() {
		if (!selectedRepo) return
		if (commentText.trim().length === 0) return
		if ((commentScope === 'file' || commentScope === 'range') && !selectedFile) return
		if (commentScope === 'range' && !rangeSelection) return

		const base: CommentInputType = {
			scope: commentScope,
			text: commentText.trim()
		}

		const comment: CommentInputType =
			commentScope === 'global'
				? base
				: commentScope === 'file'
					? {...base, filePath: selectedFile?.path}
					: {
							...base,
							filePath: selectedFile?.path,
							hunkId: rangeSelection?.hunkId,
							start: rangeSelection?.start,
							end: rangeSelection?.end
						}

		saveComment({repoPath: selectedRepo, comment}).then(() => {
			setCommentsKey(value => value + 1)
			setCommentText('')
		})
	}

	function handleGenerateContent() {
		if (!selectedRepo) return
		generateContent(selectedRepo).then((content: AiContentType) => {
			setAiContent(content)
			setPrTitle(content.pullRequest.title)
			setPrBody(content.pullRequest.body)
			const primaryBranch = content.branchNames.at(0)
			if (primaryBranch) setBranchInput(primaryBranch)
		})
	}

	function handleExportPlan() {
		if (!selectedRepo) return
		exportPlan(selectedRepo).then((plan: PlanExportType) => setPlanMarkdown(plan.markdown))
	}

	function handleCreatePullRequest() {
		if (!selectedRepo) return
		createPullRequest({repoPath: selectedRepo, title: prTitle, body: prBody, branch: branchInput}).then(
			(result: PullRequestResultType) => {
				setPlanMarkdown(result.url ?? result.output)
			}
		)
	}

	const filteredRepos = repositories.filter(repo => {
		if (search.trim().length === 0) return true
		return (
			repo.name.toLowerCase().includes(search.toLowerCase()) || repo.path.toLowerCase().includes(search.toLowerCase())
		)
	})

	return (
		<div className="flex h-svh bg-background text-foreground">
			<div className="flex w-80 flex-col border-foreground/20 border-r">
				<div className="flex items-center justify-between border-foreground/20 border-b px-4 py-3">
					<div className="flex items-center gap-2 font-semibold text-sm">
						<Layers3 className="size-4" />
						<span>Repositories</span>
					</div>
					<Button size="icon" variant="ghost" onClick={handleRescan}>
						<RefreshCcw className="size-4" />
					</Button>
				</div>

				<div className="flex flex-col gap-3 px-4 py-3">
					<div className="flex items-center gap-2">
						<Input
							value={newRoot}
							onChange={event => setNewRoot(event.target.value)}
							placeholder="Add scan root"
							className="h-9"
						/>
						<Button size="icon" onClick={handleAddRoot}>
							<UploadCloud className="size-4" />
						</Button>
					</div>
					<div className="flex flex-wrap gap-2">
						{roots.map(root => (
							<button
								key={root}
								type="button"
								className={cn(
									'flex items-center gap-2 rounded border px-2 py-1 text-left text-xs',
									selectedRepo === root ? 'border-foreground' : 'border-foreground/30'
								)}
								onClick={() => handleRemoveRoot(root)}
							>
								<Square className="size-3" />
								<span className="truncate">{root}</span>
								<Undo2 className="size-3" />
							</button>
						))}
					</div>
					<Input
						value={search}
						onChange={event => setSearch(event.target.value)}
						placeholder="Search repos"
						className="h-9"
					/>
				</div>

				<div className="flex-1 overflow-y-auto px-2 pb-4">
					<div className="flex flex-col gap-2">
						{filteredRepos.map(repo => (
							<button
								key={repo.path}
								type="button"
								className={cn(
									'flex items-center justify-between rounded border px-3 py-2 text-left text-sm',
									selectedRepo === repo.path ? 'border-foreground' : 'border-foreground/20 hover:border-foreground/60'
								)}
								onClick={() => handleSelectRepo(repo.path)}
							>
								<div className="flex flex-col">
									<span className="font-semibold">{repo.name}</span>
									<span className="text-[11px] text-muted-foreground">{repo.path}</span>
								</div>
								<div className="flex items-center gap-2">
									<Badge variant="outline">{repo.branch}</Badge>
									<div className="flex items-center gap-1 text-[11px]">
										<CircleDot
											className={cn('size-3', repo.unstagedCount > 0 ? 'text-amber-500' : 'text-muted-foreground')}
										/>
										<span>{repo.unstagedCount}</span>
									</div>
									<div className="flex items-center gap-1 text-[11px]">
										<Check
											className={cn('size-3', repo.stagedCount > 0 ? 'text-emerald-500' : 'text-muted-foreground')}
										/>
										<span>{repo.stagedCount}</span>
									</div>
								</div>
							</button>
						))}
					</div>
				</div>
			</div>

			<div className="flex flex-1 flex-col gap-3 p-4">
				<div className="flex items-center justify-between rounded border border-foreground/30 px-3 py-2">
					<div className="flex items-center gap-3">
						<GitBranch className="size-4" />
						<div className="flex flex-col">
							<span className="font-semibold text-sm">{repoState.name || 'Select a repository'}</span>
							<span className="text-muted-foreground text-xs">{repoState.branch}</span>
						</div>
						<Badge variant="outline">{scope === 'staged' ? 'Staged' : 'Unstaged'}</Badge>
					</div>
					<div className="flex items-center gap-2">
						<Button size="sm" variant="outline" onClick={handleGenerateContent} disabled={!selectedRepo}>
							<Sparkles className="size-4" />
							<span>Generate AI</span>
						</Button>
						<Button size="sm" variant="outline" onClick={handleExportPlan} disabled={!selectedRepo}>
							<Download className="size-4" />
							<span>Export Plan</span>
						</Button>
						<Button size="sm" variant="default" onClick={handleCreatePullRequest} disabled={!selectedRepo}>
							<GitPullRequest className="size-4" />
							<span>Create PR</span>
						</Button>
					</div>
				</div>

				<div className="grid grid-cols-3 gap-3">
					<Card className="col-span-1">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<FileCode2 className="size-4" />
								<span>Changes</span>
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<section className="flex flex-col gap-2">
								<div className="flex items-center justify-between font-semibold text-xs uppercase">Unstaged</div>
								<div className="flex flex-col divide-y divide-foreground/10 rounded border border-foreground/20 border-dashed">
									{repoState.unstaged.map(file => (
										<button
											key={`${file.path}-unstaged`}
											type="button"
											onClick={() => handleSelectFile(file, 'unstaged')}
											className={cn(
												'flex items-center justify-between px-3 py-2 text-left',
												selectedFile?.path === file.path && scope === 'unstaged'
													? 'bg-foreground/5'
													: 'hover:bg-foreground/5'
											)}
										>
											<div className="flex flex-col">
												<span className="font-semibold text-sm">{file.path}</span>
												<span className="text-[11px] text-muted-foreground">{file.status}</span>
											</div>
											<div className="flex items-center gap-2">
												<Button
													size="icon"
													variant="ghost"
													onClick={event => {
														event.stopPropagation()
														stageFiles([{scope: 'file', filePath: file.path, staged: false}])
													}}
												>
													<UploadCloud className="size-4" />
												</Button>
												<Button
													size="icon"
													variant="ghost"
													onClick={event => {
														event.stopPropagation()
														revertFiles([{scope: 'file', filePath: file.path, staged: false}])
													}}
												>
													<Undo2 className="size-4" />
												</Button>
											</div>
										</button>
									))}
								</div>
							</section>

							<section className="flex flex-col gap-2">
								<div className="flex items-center justify-between font-semibold text-xs uppercase">Staged</div>
								<div className="flex flex-col divide-y divide-foreground/10 rounded border border-foreground/20 border-dashed">
									{repoState.staged.map(file => (
										<button
											key={`${file.path}-staged`}
											type="button"
											onClick={() => handleSelectFile(file, 'staged')}
											className={cn(
												'flex items-center justify-between px-3 py-2 text-left',
												selectedFile?.path === file.path && scope === 'staged'
													? 'bg-foreground/5'
													: 'hover:bg-foreground/5'
											)}
										>
											<div className="flex flex-col">
												<span className="font-semibold text-sm">{file.path}</span>
												<span className="text-[11px] text-muted-foreground">{file.status}</span>
											</div>
											<div className="flex items-center gap-2">
												<Button
													size="icon"
													variant="ghost"
													onClick={event => {
														event.stopPropagation()
														revertFiles([{scope: 'file', filePath: file.path, staged: true}])
													}}
												>
													<Undo2 className="size-4" />
												</Button>
											</div>
										</button>
									))}
								</div>
							</section>
						</CardContent>
					</Card>

					<Card className="col-span-2">
						<CardHeader className="flex flex-row items-center justify-between">
							<CardTitle className="flex items-center gap-2 text-base">
								<AlignJustify className="size-4" />
								<span>Diff</span>
							</CardTitle>
							<div className="flex items-center gap-2">
								<Button size="sm" variant="outline" onClick={handleStageFile} disabled={!selectedFile}>
									<UploadCloud className="size-4" />
									<span>Stage file</span>
								</Button>
								<Button size="sm" variant="outline" onClick={handleRevertFile} disabled={!selectedFile}>
									<Undo2 className="size-4" />
									<span>Revert file</span>
								</Button>
								<Button size="sm" variant="outline" onClick={handleStageRange} disabled={!rangeSelection}>
									<Check className="size-4" />
									<span>Stage range</span>
								</Button>
								<Button size="sm" variant="outline" onClick={handleRevertRange} disabled={!rangeSelection}>
									<Undo2 className="size-4" />
									<span>Revert range</span>
								</Button>
							</div>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							{diff.hunks.length === 0 ? (
								<div className="rounded border border-foreground/30 border-dashed px-4 py-6 text-center text-muted-foreground text-sm">
									No changes selected
								</div>
							) : (
								<div className="flex flex-col gap-4">
									{diff.hunks.map(hunk => (
										<div key={hunk.id} className="rounded border border-foreground/20">
											<div className="flex items-center justify-between border-foreground/20 border-b bg-foreground/5 px-3 py-2 font-semibold text-xs">
												<div className="flex items-center gap-2">
													<Layers3 className="size-3.5" />
													<span>{hunk.header}</span>
												</div>
												<div className="flex items-center gap-2">
													<Button size="xs" variant="ghost" onClick={() => handleStageHunk(hunk.id)}>
														<UploadCloud className="size-3.5" />
														<span>Stage hunk</span>
													</Button>
													<Button size="xs" variant="ghost" onClick={() => handleRevertHunk(hunk.id)}>
														<Undo2 className="size-3.5" />
														<span>Revert hunk</span>
													</Button>
												</div>
											</div>
											<div className="flex flex-col divide-y divide-foreground/10">
												{hunk.lines.map((line, index) => {
													const active =
														rangeSelection &&
														rangeSelection.hunkId === hunk.id &&
														index >= rangeSelection.start &&
														index <= rangeSelection.end

													return (
														<button
															key={`${hunk.id}-${index}`}
															type="button"
															onClick={() => handleRangeSelection(hunk.id, index)}
															className={cn(
																'flex w-full items-start gap-3 px-3 py-1 text-left font-mono text-[12px]',
																active ? 'bg-foreground/10' : ''
															)}
														>
															<div className="flex w-12 flex-col items-end text-[10px] text-muted-foreground">
																<span>{line.oldNumber ?? ''}</span>
																<span>{line.newNumber ?? ''}</span>
															</div>
															<div
																className={cn(
																	'w-full',
																	line.kind === 'add'
																		? 'text-emerald-600'
																		: line.kind === 'del'
																			? 'text-rose-600'
																			: 'text-foreground'
																)}
															>
																{line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}
																{line.content}
															</div>
														</button>
													)
												})}
											</div>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				<div className="grid grid-cols-3 gap-3">
					<Card className="col-span-2">
						<CardHeader className="flex flex-row items-center justify-between">
							<CardTitle className="flex items-center gap-2 text-base">
								<MessageSquare className="size-4" />
								<span>Comments</span>
							</CardTitle>
						</CardHeader>
						<CardContent className="grid grid-cols-2 gap-3">
							<div className="flex flex-col gap-2">
								<div className="flex flex-col gap-2">
									<div className="flex items-center gap-2">
										<Button
											size="sm"
											variant={commentScope === 'global' ? 'default' : 'outline'}
											onClick={() => setCommentScope('global')}
										>
											Global
										</Button>
										<Button
											size="sm"
											variant={commentScope === 'file' ? 'default' : 'outline'}
											onClick={() => setCommentScope('file')}
											disabled={!selectedFile}
										>
											File
										</Button>
										<Button
											size="sm"
											variant={commentScope === 'range' ? 'default' : 'outline'}
											onClick={() => setCommentScope('range')}
											disabled={!rangeSelection}
										>
											Range
										</Button>
									</div>
									<Textarea
										value={commentText}
										onChange={event => setCommentText(event.target.value)}
										placeholder="Add a comment"
										className="min-h-24"
									/>
									<Button onClick={handleSaveComment} disabled={!selectedRepo}>
										<MessageSquare className="size-4" />
										<span>Save comment</span>
									</Button>
								</div>
							</div>
							<div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded border border-foreground/20 p-2">
								{comments.map(comment => (
									<div key={comment.id} className="flex flex-col gap-1 rounded border border-foreground/10 px-2 py-2">
										<div className="flex items-center gap-2 font-semibold text-xs">
											<Badge variant="outline">{comment.scope}</Badge>
											{comment.filePath && (
												<span className="text-[11px] text-muted-foreground">{comment.filePath}</span>
											)}
										</div>
										<div className="text-sm">{comment.text}</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>

					<Card className="col-span-1">
						<CardHeader className="flex flex-row items-center justify-between">
							<CardTitle className="flex items-center gap-2 text-base">
								<Sparkles className="size-4" />
								<span>AI Output</span>
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							<div className="flex flex-col gap-2 rounded border border-foreground/20 p-2 text-sm">
								<div className="font-semibold text-muted-foreground text-xs uppercase">Commit messages</div>
								{aiContent?.commitMessages.map(item => (
									<div key={item} className="rounded border border-foreground/20 border-dashed px-2 py-1">
										{item}
									</div>
								))}
							</div>
							<div className="flex flex-col gap-2 rounded border border-foreground/20 p-2 text-sm">
								<div className="font-semibold text-muted-foreground text-xs uppercase">Branch names</div>
								{aiContent?.branchNames.map(item => (
									<div key={item} className="rounded border border-foreground/20 border-dashed px-2 py-1">
										{item}
									</div>
								))}
							</div>
							<div className="flex flex-col gap-2">
								<Input
									value={branchInput}
									onChange={event => setBranchInput(event.target.value)}
									placeholder="Branch name"
								/>
								<Input value={prTitle} onChange={event => setPrTitle(event.target.value)} placeholder="PR title" />
								<Textarea
									value={prBody}
									onChange={event => setPrBody(event.target.value)}
									placeholder="PR body"
									className="min-h-24"
								/>
							</div>
						</CardContent>
					</Card>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Download className="size-4" />
							<span>Actionable Plan</span>
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						<Textarea
							value={planMarkdown}
							onChange={event => setPlanMarkdown(event.target.value)}
							className="min-h-48 font-mono text-[12px]"
						/>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
