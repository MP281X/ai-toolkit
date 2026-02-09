import {Effect, Option, Stream, pipe} from 'effect'

import {cn} from '@ai-toolkit/components/utils'
import {Badge} from '@ai-toolkit/components/ui/badge'
import {Button} from '@ai-toolkit/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@ai-toolkit/components/ui/card'
import {Input} from '@ai-toolkit/components/ui/input'
import {Separator} from '@ai-toolkit/components/ui/separator'
import {Textarea} from '@ai-toolkit/components/ui/textarea'
import {
	AgentAnswer,
	type AgentEvent,
	type AgentId,
	type AgentQuestion,
	AgentRunRequest,
	type QuestionOption
} from '@ai-toolkit/ai/review'
import {type CommitSuggestion} from '@ai-toolkit/ai/commit'
import {
	type DiffFile,
	type DiffHunk,
	type DiffLine,
	DiffQuery,
	type RepoPath,
	RepoStatus,
	Repository,
	StageSelection
} from '@ai-toolkit/git/schema'
import {
	CommentDraft,
	type ReviewComment,
	ReviewSession,
	type ReviewSummary,
	SessionDraft,
	type SessionId
} from '@ai-toolkit/review/schema'
import {useAtomSet, useAtomSuspense} from '@effect-atom/atom-react'
import {createFileRoute} from '@tanstack/react-router'
import {type ChangeEvent, useEffect, useMemo, useState} from 'react'

import {ApiClient, AtomRuntime} from '#lib/atomRuntime.ts'

export const Route = createFileRoute('/(home)/')({component: RouteComponent})

const listRepositoriesAtom = AtomRuntime.atom(
	Effect.gen(function* () {
		const client = yield* ApiClient
		return yield* client('ListRepositories', undefined)
	})
)

const listSessionsAtom = AtomRuntime.atom(
	Effect.gen(function* () {
		const client = yield* ApiClient
		return yield* client('ListSessions', undefined)
	})
)

const saveRepositoryAtom = AtomRuntime.fn<Repository>()((repository, _get) =>
	Effect.gen(function* () {
		const client = yield* ApiClient
		return yield* client('SaveRepository', repository)
	})
)

const stageAtom = AtomRuntime.fn<StageSelection>()((selection, _get) =>
	Effect.gen(function* () {
		const client = yield* ApiClient
		return yield* client('Stage', selection)
	})
)

const createSessionAtom = AtomRuntime.fn<SessionDraft>()((draft, _get) =>
	Effect.gen(function* () {
		const client = yield* ApiClient
		return yield* client('CreateSession', draft)
	})
)

const addCommentAtom = AtomRuntime.fn<CommentDraft>()((draft, _get) =>
	Effect.gen(function* () {
		const client = yield* ApiClient
		return yield* client('AddComment', draft)
	})
)

const commitSuggestionsAtom = AtomRuntime.fn<RepoPath>()((repoPath, _get) =>
	Effect.gen(function* () {
		const client = yield* ApiClient
		return yield* client('CommitSuggestions', repoPath)
	})
)

const runAgentAtom = AtomRuntime.fn<AgentRunRequest>()((request, _get) =>
	Effect.gen(function* () {
		const client = yield* ApiClient
		return yield* client('RunAgent', request)
	})
)

const answerAgentAtom = AtomRuntime.fn<AgentAnswer>()((answer, _get) =>
	Effect.gen(function* () {
		const client = yield* ApiClient
		return yield* client('AnswerAgent', answer)
	})
)

function useStatusAtom(repository: Repository | undefined) {
	return useMemo(
		() =>
			AtomRuntime.atom(
				Effect.gen(function* () {
					if (!repository)
						return RepoStatus.make({branch: undefined, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: []})
					const client = yield* ApiClient
					return yield* client('Status', repository.path)
					})
				),
		[repository?.path, repository]
	)
}

function useDiffAtom(repository: Repository | undefined, source: 'working' | 'staged') {
	return useMemo(
		() =>
			AtomRuntime.atom(
				Effect.gen(function* () {
					if (!repository) return [] as readonly DiffFile[]
					const client = yield* ApiClient
					return yield* client('Diff', DiffQuery.make({repoPath: repository.path, source}))
				})
			),
		[repository?.path, source, repository]
	)
}

function useCommentsAtom(sessionId: SessionId | undefined) {
	return useMemo(
		() =>
			AtomRuntime.atom(
				Effect.gen(function* () {
					if (!sessionId) return [] as readonly ReviewComment[]
					const client = yield* ApiClient
					return yield* client('ListComments', sessionId)
				})
			),
		[sessionId]
	)
}

function useSummaryAtom(sessionId: SessionId | undefined) {
	return useMemo(
		() =>
			AtomRuntime.atom(
				Effect.gen(function* () {
					if (!sessionId) return Option.none<ReviewSummary>()
					const client = yield* ApiClient
					return yield* client('GetSummary', sessionId)
					})
				),
		[sessionId]
	)
}

type CommentTarget = {
	filePath: string
	hunkId: string
	line: number
	lineTag: 'context' | 'add' | 'del'
}

function linePositions(line: DiffLine) {
	return {
		newLine: line._tag === 'add' || line._tag === 'context' ? line.newLine : undefined,
		oldLine: line._tag === 'del' || line._tag === 'context' ? line.oldLine : undefined
	}
}

function StageToggle(props: {label: string; onClick: () => void}) {
	return (
		<Button variant="outline" size="xs" onClick={props.onClick}>
			{props.label}
		</Button>
	)
}

function DiffLineRow(props: {
	line: DiffLine
	onStage: () => void
	onSelectComment: () => void
	comments: ReviewComment[]
}) {
	const isAdd = props.line._tag === 'add'
	const isDel = props.line._tag === 'del'
	const positions = linePositions(props.line)
	const lineNumber = isAdd ? positions.newLine : positions.oldLine
	const lineColor = cn(
		'flex items-center gap-2 border-b border-border px-3 py-1 text-xs',
		isAdd && 'bg-emerald-50 text-emerald-900',
		isDel && 'bg-rose-50 text-rose-900'
	)

	return (
		<div className={lineColor}>
			<div className="w-14 text-right font-mono text-[11px] text-muted-foreground">{lineNumber}</div>
			<div className="flex-1 font-mono">{props.line.text}</div>
			<div className="flex items-center gap-2">
				<StageToggle label="Stage line" onClick={props.onStage} />
				<Button variant="ghost" size="xs" onClick={props.onSelectComment}>
					Comment
				</Button>
				{props.comments.length > 0 ? <Badge variant="secondary">{props.comments.length}</Badge> : null}
			</div>
		</div>
	)
}

function DiffHunkBlock(props: {
	filePath: string
	hunk: DiffHunk
	onStageHunk: () => void
	onStageLine: (line: DiffLine) => void
	onSelectComment: (line: DiffLine) => void
	comments: readonly ReviewComment[]
}) {
	return (
		<div className="rounded-md border border-border">
			<div className="flex items-center justify-between bg-muted px-3 py-2 font-semibold text-xs uppercase">
				<div className="font-mono">
					{props.hunk.header ||
						`@@ -${props.hunk.oldStart},${props.hunk.oldLines} +${props.hunk.newStart},${props.hunk.newLines} @@`}
				</div>
				<StageToggle label="Stage hunk" onClick={props.onStageHunk} />
			</div>
				<div className="divide-y divide-border">
					{props.hunk.lines.map((line: DiffLine) => {
					const positions = linePositions(line)
					const lineComments = props.comments.filter(comment => {
						const matchesNew = positions.newLine !== undefined ? comment.newLine === positions.newLine : false
						const matchesOld = positions.oldLine !== undefined ? comment.oldLine === positions.oldLine : false
						return comment.hunkId === props.hunk.id && (matchesNew || matchesOld)
					})
					return (
						<DiffLineRow
							key={`${props.hunk.id}:${positions.newLine ?? positions.oldLine ?? 0}:${line._tag}`}
							line={line}
							onStage={() => props.onStageLine(line)}
							onSelectComment={() => props.onSelectComment(line)}
							comments={lineComments}
						/>
					)
				})}
			</div>
		</div>
	)
}

function DiffPanel(props: {
	files: readonly DiffFile[]
	onStage: (selection: StageSelection) => void
	onSelectComment: (target: CommentTarget) => void
	comments: readonly ReviewComment[]
	repoPath: RepoPath
}) {
	return (
		<div className="space-y-4">
			{props.files.map(file => (
				<div key={file.path} className="space-y-2 rounded-lg border border-border bg-card">
					<div className="flex items-center justify-between border-border border-b px-4 py-3">
						<div className="flex items-center gap-3">
							<Badge variant="secondary">{file.status}</Badge>
							<div className="font-semibold">{file.path}</div>
						</div>
						<div className="flex items-center gap-2">
							<StageToggle
								label="Stage file"
								onClick={() =>
									props.onStage(
										StageSelection.make({
											repoPath: props.repoPath,
											path: file.path,
											kind: 'file'
										})
									)
								}
							/>
							<StageToggle
								label="Unstage"
								onClick={() =>
									props.onStage(
										StageSelection.make({
											repoPath: props.repoPath,
											path: file.path,
											kind: 'file',
											reverse: true
										})
									)
								}
							/>
						</div>
					</div>
					<div className="space-y-3 px-4 pb-4">
						{file.hunks.map((hunk: DiffHunk) => (
							<DiffHunkBlock
								key={hunk.id}
								filePath={file.path}
								hunk={hunk}
								onStageHunk={() =>
									props.onStage(
										StageSelection.make({
											repoPath: props.repoPath,
											path: file.path,
											kind: 'hunk',
											hunkId: hunk.id
										})
									)
								}
								onStageLine={line =>
									props.onStage(
										StageSelection.make({
											repoPath: props.repoPath,
											path: file.path,
											kind: 'line',
											hunkId: hunk.id,
											oldLine: linePositions(line).oldLine,
											newLine: linePositions(line).newLine
										})
									)
								}
								onSelectComment={line =>
									props.onSelectComment({
										filePath: file.path,
										hunkId: hunk.id,
										line: linePositions(line).newLine ?? linePositions(line).oldLine ?? 0,
										lineTag: line._tag
									})
								}
								comments={props.comments.filter(comment => comment.hunkId === hunk.id)}
							/>
						))}
					</div>
				</div>
			))}
		</div>
	)
}

function CommentList(props: {comments: readonly ReviewComment[]}) {
	return (
		<div className="space-y-3">
			{props.comments.map(comment => (
				<div key={comment.id} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
					<div className="mb-1 flex items-center justify-between text-muted-foreground text-xs uppercase">
						<span>{comment.filePath}</span>
						<span>
							Line {comment.newLine ?? comment.oldLine ?? 0} · {comment.lineTag}
						</span>
					</div>
					<div className="font-semibold">{comment.message}</div>
				</div>
			))}
		</div>
	)
}

function StatusBlock(props: {status: RepoStatus}) {
	return (
		<div className="grid grid-cols-3 gap-2 font-semibold text-xs uppercase">
			<div className="rounded-md border border-border bg-card px-3 py-2">
				<div className="text-muted-foreground">Branch</div>
				<div className="text-base">{props.status.branch ?? 'unknown'}</div>
			</div>
			<div className="rounded-md border border-border bg-card px-3 py-2">
				<div className="text-muted-foreground">Ahead/Behind</div>
				<div className="text-base">
					{props.status.ahead} / {props.status.behind}
				</div>
			</div>
			<div className="rounded-md border border-border bg-card px-3 py-2">
				<div className="text-muted-foreground">Files</div>
				<div className="text-base">
					{props.status.staged.length} staged · {props.status.unstaged.length} unstaged ·{' '}
					{props.status.untracked.length} new
				</div>
			</div>
		</div>
	)
}

function RouteComponent() {
	const {value: repositories} = useAtomSuspense(listRepositoriesAtom) as {value: readonly Repository[]}
	const {value: sessions} = useAtomSuspense(listSessionsAtom) as {value: readonly ReviewSession[]}

	const saveRepository = useAtomSet(saveRepositoryAtom, {mode: 'promise'})
	const stage = useAtomSet(stageAtom, {mode: 'promise'})
	const createSession = useAtomSet(createSessionAtom, {mode: 'promise'})
	const addComment = useAtomSet(addCommentAtom, {mode: 'promise'})
	const getCommitSuggestions = useAtomSet(commitSuggestionsAtom, {mode: 'promise'})
	const runAgent = useAtomSet(runAgentAtom, {mode: 'promise'})
	const answerAgent = useAtomSet(answerAgentAtom, {mode: 'promise'})

	const [repoInput, setRepoInput] = useState('')
	const [selectedRepo, setSelectedRepo] = useState<Repository | undefined>(repositories[0])
	useEffect(() => {
		if (!selectedRepo && repositories.length > 0) setSelectedRepo(repositories[0])
	}, [repositories, selectedRepo])

	const [diffSource, setDiffSource] = useState<'working' | 'staged'>('working')
	const statusAtom = useStatusAtom(selectedRepo)
	const diffAtom = useDiffAtom(selectedRepo, diffSource)
	const {value: status} = useAtomSuspense(statusAtom) as {value: RepoStatus}
	const {value: diff} = useAtomSuspense(diffAtom) as {value: readonly DiffFile[]}

	const repoSessions = sessions.filter(session => (selectedRepo ? session.repoPath === selectedRepo.path : false))
	const [sessionId, setSessionId] = useState<SessionId | undefined>(repoSessions[0]?.id)
	useEffect(() => {
		if (repoSessions.length > 0) setSessionId(repoSessions[0]?.id)
	}, [repoSessions])

	const commentsAtom = useCommentsAtom(sessionId)
	const summaryAtom = useSummaryAtom(sessionId)
	const {value: comments} = useAtomSuspense(commentsAtom) as {value: readonly ReviewComment[]}
	const {value: summaryOption} = useAtomSuspense(summaryAtom) as {value: Option.Option<ReviewSummary>}

	const [commentDraft, setCommentDraft] = useState('')
	const [commentTarget, setCommentTarget] = useState<CommentTarget | undefined>(undefined)

	const [commitIdeas, setCommitIdeas] = useState<readonly CommitSuggestion[]>([])
	const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([])
	const [pendingQuestion, setPendingQuestion] = useState<AgentQuestion | undefined>(undefined)
	const [agentRequest, setAgentRequest] = useState<AgentRunRequest | undefined>(undefined)
	const [agentAnswerText, setAgentAnswerText] = useState('')
	const [agentMessage, setAgentMessage] = useState('')

	const handleAddRepository = async () => {
		if (!repoInput.trim()) return
		const repository = Repository.make({
			path: repoInput.trim() as RepoPath,
			name: repoInput.split('/').filter(Boolean).at(-1) ?? repoInput.trim(),
			lastOpenedAt: Date.now()
		})
		await saveRepository(repository)
		setSelectedRepo(repository)
		setRepoInput('')
	}

	const handleCreateSession = async () => {
		if (!selectedRepo) return
		const draft = SessionDraft.make({
			repoPath: selectedRepo.path,
			title: `Session ${new Date().toLocaleString()}`,
			globalSummary: summaryOption._tag === 'Some' ? summaryOption.value.summary : undefined
		})
		const session = await createSession(draft)
		setSessionId(session.id)
	}

	const handleAddComment = async () => {
		if (!(sessionId && selectedRepo && commentTarget && commentDraft.trim())) return
		const draft = CommentDraft.make({
			sessionId,
			repoPath: selectedRepo.path,
			filePath: commentTarget.filePath,
			hunkId: commentTarget.hunkId,
			lineTag: commentTarget.lineTag,
			oldLine: commentTarget.lineTag === 'add' ? undefined : commentTarget.line,
			newLine: commentTarget.lineTag === 'del' ? undefined : commentTarget.line,
			message: commentDraft.trim()
		})
		await addComment(draft)
		setCommentDraft('')
		setCommentTarget(undefined)
	}

	const handleStage = async (selection: StageSelection) => {
		if (!selectedRepo) return
		await stage(StageSelection.make({...selection, repoPath: selectedRepo.path}))
	}

	const handleCommitSuggestions = async () => {
		if (!selectedRepo) return
		const ideas = await getCommitSuggestions(selectedRepo.path)
		setCommitIdeas(ideas)
	}

	const startAgentRun = async () => {
		if (!(selectedRepo && sessionId)) return
		const agentId = crypto.randomUUID() as AgentId
			const request = AgentRunRequest.make({
				agentId,
				sessionId,
				repoPath: selectedRepo.path,
				comments,
				globalSummary: summaryOption._tag === 'Some' ? summaryOption.value.summary : undefined,
				message: agentMessage.trim() ? agentMessage.trim() : undefined
			})
			setAgentRequest(request)
			setAgentEvents([])
			setPendingQuestion(undefined)
			const stream = await runAgent(request)
			await Effect.runPromise(
				pipe(
					stream,
					Stream.orDie,
					Stream.runForEach((event: AgentEvent) =>
						Effect.sync(() => {
							if (event._tag === 'question') {
								setPendingQuestion(event)
								return
							}
							setAgentEvents(current => [...current, event])
						})
					)
				)
			)
		}

	const handleAnswerQuestion = async () => {
		if (!(pendingQuestion && agentRequest)) return
		const answer = AgentAnswer.make({
			agentId: pendingQuestion.agentId,
			sessionId: pendingQuestion.sessionId,
			questionId: pendingQuestion.questionId,
			answer: agentAnswerText,
			selectedOption: pendingQuestion.options.at(0),
			submittedAt: Date.now()
		})
		const message = await answerAgent(answer)
		const next = AgentRunRequest.make({...agentRequest, message})
		setAgentEvents([])
		setPendingQuestion(undefined)
		setAgentAnswerText('')
			const stream = await runAgent(next)
			await Effect.runPromise(
				pipe(
					stream,
					Stream.orDie,
					Stream.runForEach((event: AgentEvent) =>
						Effect.sync(() => setAgentEvents(current => [...current, event]))
					)
				)
			)
		}

	return (
		<div className="flex h-svh w-full flex-col bg-background px-6 py-4 text-foreground">
			<div className="mb-4 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<h1 className="font-black text-2xl uppercase tracking-tight">AI Code Review</h1>
					<Badge variant="outline">multi-repo</Badge>
				</div>
				<div className="flex items-center gap-2">
					<Input
						value={repoInput}
						onChange={(event: ChangeEvent<HTMLInputElement>) => setRepoInput(event.target.value)}
						placeholder="/path/to/repo"
						className="w-64"
					/>
					<Button onClick={handleAddRepository}>Add repo</Button>
				</div>
			</div>

			<div className="grid grid-cols-3 gap-4">
				<div className="space-y-3">
					<Card>
						<CardHeader>
							<CardTitle>Repositories</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2">
							{repositories.map(repository => (
								<Button
									key={repository.path}
									variant={selectedRepo?.path === repository.path ? 'default' : 'outline'}
									className="w-full justify-start"
									onClick={() => setSelectedRepo(repository)}
								>
									{repository.name}
								</Button>
							))}
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Status</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2">
							<StatusBlock status={status} />
							<div className="flex items-center gap-2">
								<Button
									variant={diffSource === 'working' ? 'default' : 'outline'}
									onClick={() => setDiffSource('working')}
								>
									Working tree
								</Button>
								<Button
									variant={diffSource === 'staged' ? 'default' : 'outline'}
									onClick={() => setDiffSource('staged')}
								>
									Staged
								</Button>
								<Button variant="secondary" onClick={handleCommitSuggestions}>
									Commit ideas
								</Button>
							</div>
							{commitIdeas.length > 0 ? (
								<div className="space-y-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
									{commitIdeas.map(suggestion => (
										<div key={suggestion.branch} className="space-y-1">
											<div className="flex items-center justify-between text-muted-foreground text-xs uppercase">
												<span>{suggestion.branch}</span>
												<span className="font-semibold">{suggestion.message}</span>
											</div>
											<div>{suggestion.description}</div>
											<Separator />
										</div>
									))}
								</div>
							) : null}
						</CardContent>
					</Card>
				</div>

				<div className="col-span-2 space-y-4 overflow-y-auto pb-12">
					<Card>
						<CardHeader>
							<CardTitle>Sessions</CardTitle>
						</CardHeader>
						<CardContent className="flex items-center gap-2">
							<Button onClick={handleCreateSession}>New session</Button>
							{repoSessions.map(session => (
								<Button
									key={session.id}
									variant={sessionId === session.id ? 'default' : 'outline'}
									onClick={() => setSessionId(session.id)}
								>
									{session.title}
								</Button>
							))}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Diff</CardTitle>
						</CardHeader>
						<CardContent>
							{selectedRepo ? (
								<DiffPanel
									files={diff}
									onStage={handleStage}
									onSelectComment={target => setCommentTarget(target)}
									comments={comments}
									repoPath={selectedRepo.path}
								/>
							) : (
								<div className="text-sm text-muted-foreground">Select a repository to view diffs.</div>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Comments</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							{commentTarget ? (
								<div className="space-y-2 rounded-md border border-border bg-card px-3 py-2">
									<div className="text-muted-foreground text-xs uppercase">
										{commentTarget.filePath} · line {commentTarget.line}
									</div>
									<Textarea
										value={commentDraft}
										onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setCommentDraft(event.target.value)}
										placeholder="Add a review note"
									/>
									<div className="flex justify-end gap-2">
										<Button variant="ghost" onClick={() => setCommentTarget(undefined)}>
											Cancel
										</Button>
										<Button onClick={handleAddComment}>Save comment</Button>
									</div>
								</div>
							) : null}
							<CommentList comments={comments} />
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Agent</CardTitle>
						</CardHeader>
							<CardContent className="space-y-3">
								<Textarea
									value={agentMessage}
									onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setAgentMessage(event.target.value)}
									placeholder="Global instructions for the agent"
								/>
							<Button onClick={startAgentRun}>Start agent</Button>
							{pendingQuestion ? (
								<div className="rounded-md border border-border bg-card px-3 py-2">
									<div className="text-muted-foreground text-xs uppercase">Agent question</div>
									<div className="mb-2 font-semibold">{pendingQuestion.prompt}</div>
									<div className="flex flex-wrap gap-2">
										{pendingQuestion.options.map((option: QuestionOption) => (
											<Button
												key={option.id}
												variant="outline"
												size="sm"
												onClick={() => setAgentAnswerText(option.label)}
											>
												{option.label}
											</Button>
										))}
									</div>
									<Textarea
										value={agentAnswerText}
										onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setAgentAnswerText(event.target.value)}
										placeholder="Add your reply"
										className="mt-2"
									/>
									<div className="mt-2 flex justify-end">
										<Button onClick={handleAnswerQuestion}>Submit answer</Button>
									</div>
								</div>
							) : null}
							<div className="space-y-2 rounded-md border border-border bg-card px-3 py-2">
								{agentEvents.map((event: AgentEvent, index: number) => (
									<div key={`${event._tag}-${'timestamp' in event ? event.timestamp : index}`} className="text-sm">
										{event._tag === 'agent-message' ? <div className="font-mono">{event.content}</div> : null}
										{event._tag === 'progress' ? (
											<div className="text-muted-foreground text-xs uppercase">
												{event.stage}: {event.message}
											</div>
										) : null}
										{event._tag === 'agent-done' ? <Badge>Done</Badge> : null}
									</div>
								))}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
