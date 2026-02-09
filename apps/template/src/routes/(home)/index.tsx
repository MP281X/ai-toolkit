import {Effect, Layer, Stream, pipe} from 'effect'

import {type Model, modelCatalog} from '@ai-toolkit/ai/schema'
import {Markdown} from '@ai-toolkit/components/ai/markdown'
import {ModelSelector} from '@ai-toolkit/components/ai/model-selector'
import {Badge} from '@ai-toolkit/components/ui/badge'
import {Button} from '@ai-toolkit/components/ui/button'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@ai-toolkit/components/ui/card'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@ai-toolkit/components/ui/collapsible'
import {Input} from '@ai-toolkit/components/ui/input'
import {Textarea} from '@ai-toolkit/components/ui/textarea'
import {createFileRoute} from '@tanstack/react-router'
import {useAtomSet} from '@effect-atom/atom-react'
import {useCallback, useEffect, useState} from 'react'

import {ApiClient, AtomRuntime, LiveLayers} from '#lib/atomRuntime.ts'
import {
	type Citation,
	type CouncilAnswer,
	type ResearchPlan,
	type SearchHistoryEntry,
	type SearchJob,
	SearchRequest,
	type SearchStreamPart,
	type TaskResult
} from '#rpcs/search/schema.ts'

const clientLayer = Layer.mergeAll(LiveLayers, ApiClient.layer)
const runSearchAtom = AtomRuntime.fn<SearchRequestType>((input, get) =>
	get(ApiClient).pipe(Effect.flatMap(client => client('RunSearch', input)))
)

type SearchRequestType = typeof SearchRequest.Type
type SearchHistoryEntryType = typeof SearchHistoryEntry.Type
type SearchJobType = typeof SearchJob.Type
type TaskResultType = typeof TaskResult.Type
type CitationType = typeof Citation.Type
type CouncilAnswerData = typeof CouncilAnswer.Type
type ResearchPlanType = typeof ResearchPlan.Type

export const Route = createFileRoute('/(home)/')({component: RouteComponent})

type RunState = {
	mode: SearchRequestType['mode']
	answer: string
	sources: readonly CitationType[]
	plan?: ResearchPlanType
	tasks: readonly TaskResultType[]
	council: readonly CouncilAnswerData[]
	jobId?: string
	running: boolean
	error?: string
}

function SourcesList(props: {sources: readonly CitationType[]}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Sources</span>
				<span className="text-[11px] text-muted-foreground">{props.sources.length}</span>
			</div>
			<div className="flex flex-col gap-2">
				{props.sources.map(source => (
					<a
						key={source.id}
						href={source.url}
						target="_blank"
						rel="noreferrer"
						className="flex gap-2 border border-border/60 border-dashed px-3 py-2 text-sm hover:border-foreground"
					>
						<span className="font-mono text-muted-foreground text-xs">[{source.id}]</span>
						<div className="flex flex-col gap-1">
							<span className="font-semibold">{source.title}</span>
							<span className="line-clamp-2 text-muted-foreground text-xs">{source.snippet}</span>
						</div>
					</a>
				))}
			</div>
		</div>
	)
}

function PlanView(props: {plan?: ResearchPlanType; tasks: readonly TaskResultType[]}) {
	if (!props.plan) return null

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Plan</span>
				<span className="text-[11px] text-muted-foreground">{props.plan.phases.length} phases</span>
			</div>
			<div className="flex flex-col gap-2">
				{props.plan.phases.map((phase, phaseIndex) => (
					<Card key={`${phase.title}-${phaseIndex}`} className="border border-border/80 bg-muted/30">
						<CardHeader className="pb-2">
							<CardTitle className="text-sm">{phase.title}</CardTitle>
							<CardDescription className="text-xs">{phase.tasks.length} tasks</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							{phase.tasks.map((task, taskIndex) => {
								const match = props.tasks.find(
									entry => entry.phaseIndex === phaseIndex && entry.taskIndex === taskIndex
								)
								const status = match?.status ?? 'pending'
								return (
									<div
										key={`${phase.title}-${task.title}-${taskIndex}`}
										className="flex flex-col gap-1 border border-border/60 border-dashed px-3 py-2"
									>
										<div className="flex items-center gap-2 font-semibold text-sm">
											<span className="font-mono text-muted-foreground text-xs">
												{phaseIndex + 1}.{taskIndex + 1}
											</span>
											<span>{task.title}</span>
											<Badge variant="outline" className="ml-auto">
												{status}
											</Badge>
										</div>
										<span className="text-muted-foreground text-xs">Query: {task.query}</span>
										<span className="text-muted-foreground text-xs">Deliverable: {task.deliverable}</span>
										{match?.claims && match.claims.length > 0 && (
											<ul className="ml-3 list-disc text-sm leading-relaxed">
												{match.claims.map(claim => (
													<li key={claim}>{claim}</li>
												))}
											</ul>
										)}
									</div>
								)
							})}
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	)
}

function CouncilView(props: {answers: readonly CouncilAnswerData[]}) {
	if (props.answers.length === 0) return null

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Model Council</span>
				<span className="text-[11px] text-muted-foreground">{props.answers.length}</span>
			</div>
			<div className="flex flex-col gap-2">
				{props.answers.map(entry => (
					<Collapsible key={`${entry.model.provider}-${entry.model.model}`} className="border border-border/80">
						<CollapsibleTrigger className="flex w-full items-center justify-between bg-muted/30 px-3 py-2 text-left font-semibold text-sm">
							<span>
								{entry.model.provider}/{entry.model.model}
							</span>
							<span className="text-muted-foreground text-xs">View</span>
						</CollapsibleTrigger>
						<CollapsibleContent className="px-3 py-2">
							<Markdown className="text-sm leading-relaxed">{entry.answer.text}</Markdown>
						</CollapsibleContent>
					</Collapsible>
				))}
			</div>
		</div>
	)
}

export function RouteComponent() {
	const [query, setQuery] = useState('')
	const [details, setDetails] = useState('')
	const [mode, setMode] = useState<SearchRequestType['mode']>('normal')
	const [model, setModel] = useState<Model>({provider: 'opencode_zen', model: 'kimi-k2.5-free'})
	const [councilModels, setCouncilModels] = useState<readonly Model[]>([
		{provider: 'opencode_zen', model: 'glm-4.7-free'},
		{provider: 'opencode_zen', model: 'kimi-k2.5-free'},
		{provider: 'opencode_zen', model: 'minimax-m2.1-free'}
	])
	const [history, setHistory] = useState<readonly SearchHistoryEntryType[]>([])
	const [jobs, setJobs] = useState<readonly SearchJobType[]>([])
	const [run, setRun] = useState<RunState>({
		mode: 'normal',
		answer: '',
		sources: [],
		tasks: [],
		council: [],
		running: false
	})

	useEffect(() => {
		const stored = localStorage.getItem('last-model')
		if (stored) {
			try {
				const parsed = JSON.parse(stored)
				setModel(parsed)
			} catch {
				// ignore
			}
		}
	}, [])

	useEffect(() => {
		localStorage.setItem('last-model', JSON.stringify(model))
	}, [model])

	const refreshHistory = useCallback(
		() =>
			Effect.runPromise(
				pipe(
					Effect.gen(function* () {
						const client = yield* ApiClient
						return yield* client('ListHistory', void 0)
					}),
					Effect.provide(clientLayer)
				)
			).then(setHistory),
		[]
	)

	const refreshJobs = useCallback(
		() =>
			Effect.runPromise(
				pipe(
					Effect.gen(function* () {
						const client = yield* ApiClient
						return yield* client('ListJobs', void 0)
					}),
					Effect.provide(clientLayer)
				)
			).then(setJobs),
		[]
	)

	useEffect(() => {
		void refreshHistory()
		void refreshJobs()
	}, [refreshHistory, refreshJobs])

	const modes: {id: SearchRequestType['mode']; label: string; description: string}[] = [
		{id: 'normal', label: 'Normal Search', description: 'Single Exa sweep with citations'},
		{id: 'deep', label: 'Deep Research', description: 'Plan, parallel tasks, synthesis'},
		{id: 'council', label: 'Model Council', description: 'Multiple models merged'}
	]

	const modelCards = modelCatalog.map(entry => ({
		id: entry.id,
		label: entry.label,
		description: entry.description,
		strengths: entry.strengths
	}))

	const startSearch = async () => {
		const combinedQuery = details ? `${query}\n${details}` : query
		if (!combinedQuery.trim()) return
		setRun({
			mode,
			answer: '',
			sources: [],
			plan: undefined,
			tasks: [],
			council: [],
		jobId: undefined,
		running: true
	})
	const runSearch = useAtomSet(runSearchAtom, {mode: 'promise'})

		const request = SearchRequest.make({
			query: combinedQuery,
			mode,
			model,
			councilModels: mode === 'council' ? councilModels : undefined
		})

		try {
			const stream = await runSearch(request)

			for await (const part of Stream.toAsyncIterable(stream)) {
				setRun(current => {
					const base = {...current, mode, running: true, error: undefined}
					switch (part._tag) {
						case 'search-started':
							return {...base, jobId: part.jobId}
						case 'sources-ready':
							return {...base, sources: part.sources}
						case 'plan-generated':
							return {...base, plan: part.plan}
						case 'task-updated': {
							const nextTasks = current.tasks.filter(
								entry => !(entry.phaseIndex === part.task.phaseIndex && entry.taskIndex === part.task.taskIndex)
							)
							return {...base, tasks: [...nextTasks, part.task]}
						}
						case 'answer-delta':
							return {...base, answer: `${current.answer}${part.chunk}`}
						case 'answer-completed':
							return {
								...base,
								answer: part.answer.text,
								plan: part.plan ?? current.plan,
								tasks: part.tasks ?? current.tasks,
								sources: part.sources,
								jobId: part.jobId ?? current.jobId,
								running: false
							}
						case 'council-answer':
							return {...base, council: [...current.council, part]}
						case 'job-snapshot':
							setJobs(list => [...list.filter(item => item.id !== part.job.id), part.job])
							return base
						case 'history-stored':
							void refreshHistory()
							return {...base, running: false}
						default:
							return base
					}
				})
			}
			setRun(current => ({...current, running: false}))
		} catch (error) {
			setRun(current => ({
				...current,
				running: false,
				error: error instanceof Error ? error.message : globalThis.String(error)
			}))
		}
	}

	const loadHistoryEntry = (entry: SearchHistoryEntryType) => {
		setQuery(entry.query)
		setDetails('')
		setMode(entry.mode)
		setModel(entry.model)
		setRun({
			mode: entry.mode,
			answer: entry.answer.text,
			sources: entry.sources,
			plan: entry.plan,
			tasks: entry.tasks ?? [],
			council: [],
			jobId: entry.jobId,
			running: false
		})
	}

	const loadJob = (job: SearchJobType) => {
		setQuery(job.request.query)
		setDetails('')
		setMode(job.request.mode)
		setModel(job.request.model)
		setRun({
			mode: job.request.mode,
			answer: job.answer?.text ?? '',
			sources: job.sources ?? [],
			plan: job.plan,
			tasks: job.tasks ?? [],
			council: [],
			jobId: job.id,
			running: job.status === 'running'
		})
	}

	return (
		<div className="flex h-svh w-full bg-background text-foreground">
			<aside className="flex w-80 flex-col border-border/80 border-r bg-muted/20">
				<div className="border-border/80 border-b px-4 py-3">
					<h2 className="font-semibold text-sm uppercase tracking-wide">History</h2>
					<p className="text-muted-foreground text-xs">Queries, models, answers</p>
				</div>
				<div className="flex-1 overflow-y-auto px-3 py-3">
					<div className="flex flex-col gap-2">
						{history.map(entry => (
							<Button
								key={entry.id}
								variant="ghost"
								className="justify-start border border-border/60 bg-background px-3 py-2 text-left hover:border-foreground"
								onClick={() => loadHistoryEntry(entry)}
							>
								<div className="flex flex-col gap-1">
									<div className="flex items-center gap-2 text-muted-foreground text-xs">
										<Badge variant="outline">{entry.mode}</Badge>
										<span>
											{entry.model.provider}/{entry.model.model}
										</span>
										<span>{new Date(entry.createdAt).toLocaleString()}</span>
									</div>
									<div className="line-clamp-2 font-semibold text-sm">{entry.query}</div>
								</div>
							</Button>
						))}
					</div>
				</div>
				<div className="border-border/80 border-t px-4 py-3">
					<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Jobs</h3>
					<div className="mt-2 flex flex-col gap-2">
						{jobs.map(job => (
							<Button key={job.id} variant="outline" className="justify-start" onClick={() => loadJob(job)}>
								<span className="font-mono text-muted-foreground text-xs">#{job.id.slice(0, 6)}</span>
								<span className="ml-2 text-sm">{job.request.query}</span>
								<Badge variant="outline" className="ml-auto">
									{job.status}
								</Badge>
							</Button>
						))}
					</div>
				</div>
			</aside>

			<main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
				<div className="flex flex-col gap-2 border border-border/80 bg-muted/20 px-4 py-3">
					<h1 className="font-semibold text-2xl leading-tight">AI Search Tool</h1>
					<p className="text-muted-foreground text-sm">
						Normal search, deep research with planning, and model council answers with citations.
					</p>
					<div className="flex flex-wrap items-center gap-2">
						{modes.map(entry => (
							<Button
								key={entry.id}
								variant={mode === entry.id ? 'default' : 'outline'}
								onClick={() => setMode(entry.id)}
								className="border-border/80"
							>
								{entry.label}
							</Button>
						))}
					</div>
					<div className="text-muted-foreground text-xs">
						{modes.find(entry => entry.id === mode)?.description ?? ''}
					</div>
				</div>

				<Card className="border border-border/80">
					<CardHeader className="gap-2">
						<CardTitle>Search</CardTitle>
						<CardDescription>Choose model, enter query, stream answers with citations.</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="flex flex-wrap items-center gap-3">
							<ModelSelector model={model} onModelChange={setModel} />
							{mode === 'council' && (
								<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
									<span>Council models</span>
									<div className="flex flex-wrap gap-2">
										{modelCards.map(entry => (
											<Button
												key={`${entry.id.provider}-${entry.id.model}`}
												variant={
													councilModels.some(
														item => item.provider === entry.id.provider && item.model === entry.id.model
													)
														? 'default'
														: 'outline'
												}
												size="sm"
												onClick={() => {
													setCouncilModels(list => {
														const exists = list.some(
															item => item.provider === entry.id.provider && item.model === entry.id.model
														)
														if (exists)
															return list.filter(
																item => !(item.provider === entry.id.provider && item.model === entry.id.model)
															)
														return [...list, entry.id].slice(0, 4)
													})
												}}
											>
												{entry.label}
											</Button>
										))}
									</div>
								</div>
							)}
						</div>
						<div className="flex flex-col gap-2">
							<Input
								placeholder="Ask anything..."
								value={query}
								onChange={event => setQuery(event.target.value)}
								className="h-12 border border-border/80 bg-background"
							/>
							<Textarea
								placeholder="Add details or constraints"
								className="min-h-[120px] border border-border/70 border-dashed bg-background"
								value={details}
								onChange={event => setDetails(event.target.value)}
							/>
						</div>
						<div className="flex items-center gap-3">
							<Button onClick={startSearch} disabled={run.running}>
								{run.running ? 'Running...' : 'Run search'}
							</Button>
							{run.jobId && (
								<Badge variant="outline" className="font-mono text-xs">
									Job {run.jobId}
								</Badge>
							)}
							{run.error && <Badge variant="destructive">{run.error}</Badge>}
						</div>
					</CardContent>
				</Card>

				<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
					<Card className="border border-border/80 lg:col-span-2">
						<CardHeader className="flex flex-col gap-1">
							<CardTitle>Answer</CardTitle>
							<CardDescription>Streaming synthesis with citations</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							{run.answer ? (
								<Markdown className="text-base leading-relaxed">{run.answer}</Markdown>
							) : (
								<div className="text-muted-foreground text-sm">Awaiting output...</div>
							)}
							<SourcesList sources={run.sources} />
						</CardContent>
					</Card>
					<Card className="border border-border/80">
						<CardHeader>
							<CardTitle>Research Plan</CardTitle>
							<CardDescription>Phases, tasks, progress</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							<PlanView plan={run.plan} tasks={run.tasks} />
						</CardContent>
					</Card>
				</div>

				<Card className="border border-border/80">
					<CardHeader>
						<CardTitle>Model Council</CardTitle>
						<CardDescription>Individual model outputs</CardDescription>
					</CardHeader>
					<CardContent>
						<CouncilView answers={run.council} />
					</CardContent>
				</Card>

				<Card className="border border-border/80">
					<CardHeader>
						<CardTitle>Model Registry</CardTitle>
						<CardDescription>Capabilities and fit</CardDescription>
					</CardHeader>
					<CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
						{modelCards.map(entry => (
							<div
								key={`${entry.id.provider}-${entry.id.model}`}
								className="flex flex-col gap-1 border border-border/60 border-dashed px-3 py-2"
							>
								<div className="font-semibold text-sm">{entry.label}</div>
								<div className="text-muted-foreground text-xs">{entry.description}</div>
								<div className="flex flex-wrap gap-1 pt-1">
									{entry.strengths.map(item => (
										<Badge key={item} variant="outline" className="text-[11px]">
											{item}
										</Badge>
									))}
								</div>
							</div>
						))}
					</CardContent>
				</Card>
			</main>
		</div>
	)
}
