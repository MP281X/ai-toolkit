import {mkdir, readFile, writeFile} from 'node:fs/promises'

import {Config, Effect, Array as EffectArray, Match, PubSub, pipe, Schema, Stream} from 'effect'

import {Model} from '@ai-toolkit/ai/schema'
import {resolveLanguageModel} from '@ai-toolkit/ai/service'
import type {LanguageModel} from 'ai'
import {streamText} from 'ai'
import Exa from 'exa-js'

import {SearchRpcs} from './contracts.ts'
import {
	AnswerCompleted,
	AnswerDelta,
	Citation,
	CouncilAnswer,
	HistoryStored,
	JobSnapshot,
	PlanGenerated,
	ResearchPlan,
	SearchError,
	SearchHistoryEntry,
	SearchJob,
	type SearchRequest,
	SearchStarted,
	type SearchStreamPart,
	SourcesReady,
	TaskResult,
	TaskUpdated
} from './schema.ts'

const dataDir = `${process.cwd()}/data`
const historyPath = `${dataDir}/search-history.json`
const jobsPath = `${dataDir}/search-jobs.json`

type HistoryEntryType = typeof SearchHistoryEntry.Type
type JobEntryType = typeof SearchJob.Type
type SearchRequestType = typeof SearchRequest.Type
type ModelType = typeof Model.Type

const ensureDataDir = Effect.tryPromise({
	try: async () => {
		await mkdir(dataDir, {recursive: true})
	},
	catch: cause => cause
})

const readJson = <A>(path: string, fallback: A) =>
	Effect.tryPromise({
		try: async () => {
			const content = await readFile(path, 'utf8').catch(() => '')
			if (!content) return fallback
			return JSON.parse(content)
		},
		catch: cause => cause
	})

const writeJson = <A>(path: string, value: A) =>
	Effect.tryPromise({
		try: async () => {
			await Effect.runPromise(ensureDataDir)
			await writeFile(path, JSON.stringify(value, null, 2), 'utf8')
		},
		catch: cause => cause
	})

const historySchema = Schema.Array(SearchHistoryEntry)
const jobsSchema = Schema.Array(SearchJob)

const emptyHistory: HistoryEntryType[] = []
const emptyJobs: JobEntryType[] = []

const loadHistory = pipe(
	readJson(historyPath, emptyHistory),
	Effect.flatMap(value =>
		pipe(
			Schema.decodeUnknown(historySchema)(value),
			Effect.orElseSucceed(() => emptyHistory)
		)
	)
)

const loadJobs = pipe(
	readJson(jobsPath, emptyJobs),
	Effect.flatMap(value =>
		pipe(
			Schema.decodeUnknown(jobsSchema)(value),
			Effect.orElseSucceed(() => emptyJobs)
		)
	)
)

const saveHistory = (entries: readonly HistoryEntryType[]) =>
	pipe(
		Schema.encode(historySchema)(entries),
		Effect.flatMap(encoded => writeJson(historyPath, encoded))
	)

const saveJobs = (entries: readonly JobEntryType[]) =>
	pipe(
		Schema.encode(jobsSchema)(entries),
		Effect.flatMap(encoded => writeJson(jobsPath, encoded))
	)

const withSearchError = <A>(effect: Effect.Effect<A, unknown>) =>
	pipe(
		effect,
		Effect.mapError(error =>
			SearchError.make({message: error instanceof Error ? error.message : globalThis.String(error)})
		)
	)

const makeExa = Effect.map(Config.string('AI_EXA'), key => new Exa(key))

const assignCitations = (results: {title: string | null; url: string | null; publishedDate?: string; text?: string}[]) =>
	results.map((result, index) =>
		Citation.make({
			id: index + 1,
			title: result.title ?? 'Untitled',
			url: result.url ?? '',
			publishedDate: result.publishedDate,
			snippet: result.text
		})
	)

const searchWithExa = (exa: Exa, query: string, take: number) =>
	Effect.tryPromise({
		try: async () =>
			exa.searchAndContents(query, {
				numResults: take,
				livecrawl: 'always',
				text: {maxCharacters: 1200}
			}),
		catch: cause => cause
	})

const gatherSources = (exa: Exa, query: string, take: number) =>
	pipe(
		searchWithExa(exa, query, take),
		Effect.map(response => assignCitations(response.results))
	)

const normalizeModel = (model: ModelType | string) =>
	Effect.runSync(Schema.decodeUnknown(Model)(model))

const collectText = (parts: AsyncIterable<{type: string; textDelta?: string}>) =>
	Effect.tryPromise({
		try: async () => {
			let result = ''
			for await (const part of parts) {
				if (part.type === 'text-delta' && part.textDelta) result += part.textDelta
			}
			return result
		},
		catch: cause => cause
	})

const planPrompt = (query: string) =>
	[
		'You are an AI research planner.',
		'Return a JSON object with phases, each containing tasks.',
		'Each task needs title, query, deliverable.',
		'Keep tasks parallel when possible.',
		`User query: ${query}`
	].join('\n')

const makeFallbackPlan = (query: string) =>
	ResearchPlan.make({
		phases: [
			{
				title: 'Background',
				tasks: [
					{title: 'Clarify terms', query, deliverable: 'Key definitions and framing'},
					{title: 'Find core sources', query: `${query} core sources`, deliverable: 'Top sources and dates'}
				]
			},
			{
				title: 'Evidence',
				tasks: [
					{title: 'Recent findings', query: `${query} recent updates`, deliverable: 'Recent developments with sources'},
					{title: 'Contrasts', query: `${query} alternative views`, deliverable: 'Contrasting takes and disagreements'}
				]
			}
		]
	})

const generatePlan = (model: LanguageModel, query: string) =>
	pipe(
		Effect.tryPromise({
			try: async () => streamText({model, prompt: planPrompt(query)}),
			catch: cause => cause
		}),
		Effect.flatMap(result => collectText(result.fullStream)),
		Effect.flatMap(text =>
			pipe(
				Effect.try(() => JSON.parse(text)),
				Effect.flatMap(parsed => Schema.decodeUnknown(ResearchPlan)(parsed)),
				Effect.orElseSucceed(() => makeFallbackPlan(query))
			)
		)
	)

const taskPrompt = (query: string, sources: readonly Citation[]) =>
	[
		'You are researching a task. Use the numbered sources to produce concise notes and claims.',
		'Return bullet points, each ending with citation markers like [1][2].',
		'Stay short and factual.',
		`Task query: ${query}`,
		'Sources:',
		...sources.map(source => `[${source.id}] ${source.title} - ${source.url}\n${source.snippet ?? ''}`)
	].join('\n\n')

const answerPrompt = (query: string, notes: readonly string[], sources: readonly Citation[]) =>
	[
		'You are summarizing research.',
		'Write a clear answer with inline citation numbers like [1][2].',
		'Keep paragraphs tight.',
		`User question: ${query}`,
		'Notes:',
		...notes,
		'Sources:',
		...sources.map(source => `[${source.id}] ${source.title} - ${source.url}`)
	].join('\n\n')

const mergeCouncilPrompt = (query: string, answers: readonly {model: string; text: string}[]) =>
	[
		'You are merging multiple model answers.',
		'Extract the best insights, note agreements and disagreements.',
		'Keep citations intact.',
		`Question: ${query}`,
		...answers.map(answer => `Model ${answer.model} answer:\n${answer.text}`)
	].join('\n\n')

const streamAnswer = (
	model: LanguageModel,
	prompt: string,
	publish: (chunk: string) => Effect.Effect<void>,
	citations: readonly number[]
) =>
	pipe(
		Effect.tryPromise({
			try: async () => streamText({model, prompt}),
			catch: cause => cause
		}),
		Effect.flatMap(result =>
			Effect.tryPromise({
				try: async () => {
					let text = ''
					for await (const part of result.fullStream) {
						if (part.type === 'text-delta' && part.text) {
							text += part.text
							await Effect.runPromise(publish(part.text))
						}
					}
					return text
				},
				catch: cause => cause
			})
		),
		Effect.map(text => ({
			text,
			citations
		}))
	)

const runTask = (model: LanguageModel, exa: Exa, query: string, phaseIndex: number, taskIndex: number) =>
	Effect.gen(function* () {
		const sources = yield* gatherSources(exa, query, 4)
		const prompt = taskPrompt(query, sources)
		const notes = yield* streamAnswer(
			model,
			prompt,
			Effect.succeed,
			sources.map(source => source.id)
		)

		return TaskResult.make({
			phaseIndex,
			taskIndex,
			status: 'completed',
			notes: notes.text,
			claims: notes.text.split('\n').filter(Boolean),
			citations: notes.citations,
			sources
		})
	})

const persistJob = (job: JobEntryType) =>
	pipe(
		loadJobs,
		Effect.map(existing => {
			const filtered = existing.filter(entry => entry.id !== job.id)
			return [...filtered, job]
		}),
		Effect.tap(saveJobs)
	)

const persistHistoryEntry = (entry: HistoryEntryType) =>
	pipe(
		loadHistory,
		Effect.map(existing => [entry, ...existing].slice(0, 50)),
		Effect.tap(saveHistory)
	)

const runNormalSearch = (request: SearchRequestType, exa: Exa) =>
	Stream.unwrap(
		withSearchError(
			Effect.gen(function* () {
				const events = yield* PubSub.unbounded<SearchStreamPart>()
				const sources = yield* gatherSources(exa, request.query, 6)
				yield* PubSub.publish(events, SearchStarted.make({request}))
				yield* PubSub.publish(events, SourcesReady.make({sources}))

				const model: LanguageModel = yield* resolveLanguageModel(request.model)
				const prompt = answerPrompt(request.query, [], sources)

				const answer = yield* streamAnswer(
					model,
					prompt,
					chunk => PubSub.publish(events, AnswerDelta.make({chunk})),
					sources.map(source => source.id)
				)

				const history = SearchHistoryEntry.make({
					id: crypto.randomUUID(),
					query: request.query,
					mode: request.mode,
					model: request.model,
					answer,
					sources,
					createdAt: Date.now()
				})

				yield* PubSub.publish(events, AnswerCompleted.make({answer, sources}))
				yield* persistHistoryEntry(history)
				yield* PubSub.publish(events, HistoryStored.make({entry: history}))
				yield* PubSub.shutdown(events)

				return Stream.fromPubSub(events)
			})
		)
	)

const runDeepResearch = (request: SearchRequestType, exa: Exa) =>
	Stream.unwrap(
		withSearchError(
			Effect.gen(function* () {
				const events = yield* PubSub.unbounded<SearchStreamPart>()
				const jobId = request.jobId ?? crypto.randomUUID()
				yield* PubSub.publish(events, SearchStarted.make({request, jobId}))
				if (request.jobId) {
					const previousJobs = yield* loadJobs
					const existing = previousJobs.find(job => job.id === request.jobId)
					if (existing) {
						if (existing.sources) yield* PubSub.publish(events, SourcesReady.make({sources: existing.sources ?? []}))
						if (existing.plan) yield* PubSub.publish(events, PlanGenerated.make({plan: existing.plan}))
						if (existing.tasks) {
							for (const task of existing.tasks) {
								yield* PubSub.publish(events, TaskUpdated.make({task}))
							}
						}
						if (existing.answer) {
							yield* PubSub.publish(
								events,
								AnswerCompleted.make({
									answer: existing.answer,
									sources: existing.sources ?? [],
									plan: existing.plan,
									tasks: existing.tasks,
									jobId: existing.id
								})
							)
						}
						yield* PubSub.publish(events, JobSnapshot.make({job: existing}))
						yield* PubSub.shutdown(events)
						return Stream.fromPubSub(events)
					}
				}

				const sources = yield* gatherSources(exa, request.query, 6)
				yield* PubSub.publish(events, SourcesReady.make({sources}))

				const model: LanguageModel = yield* resolveLanguageModel(request.model)
				const plan = yield* generatePlan(model, request.query)
				yield* PubSub.publish(events, PlanGenerated.make({plan}))

				let tasks: TaskResult[] = []

				for (const [phaseIndex, phase] of plan.phases.entries()) {
					const results = yield* Effect.forEach(
						phase.tasks,
						(task, taskIndex) =>
							pipe(
								runTask(model, exa, task.query, phaseIndex, taskIndex),
								Effect.tap(result => PubSub.publish(events, TaskUpdated.make({task: result})))
							),
						{concurrency: 3}
					)
					tasks = [...tasks, ...results]
				}

				const allSources = pipe(
					tasks.flatMap(task => task.sources ?? []),
					EffectArray.dedupeWith((a, b) => a.url === b.url)
				)
				const notes = tasks.flatMap(task => task.claims ?? [])
				const prompt = answerPrompt(request.query, notes, allSources.length ? allSources : sources)

				const answer = yield* streamAnswer(
					model,
					prompt,
					chunk => PubSub.publish(events, AnswerDelta.make({chunk})),
					(allSources.length ? allSources : sources).map(source => source.id)
				)

				const job = SearchJob.make({
					id: jobId,
					request,
					status: 'completed',
					sources: allSources.length ? allSources : sources,
					plan,
					tasks,
					answer,
					updatedAt: Date.now()
				})

				const history = SearchHistoryEntry.make({
					id: crypto.randomUUID(),
					query: request.query,
					mode: request.mode,
					model: request.model,
					answer,
					sources: job.sources ?? [],
					plan,
					tasks,
					jobId,
					createdAt: Date.now()
				})

				yield* persistJob(job)
				yield* PubSub.publish(events, JobSnapshot.make({job}))
				yield* PubSub.publish(events, AnswerCompleted.make({answer, sources: job.sources ?? [], plan, tasks, jobId}))
				yield* persistHistoryEntry(history)
				yield* PubSub.publish(events, HistoryStored.make({entry: history}))
				yield* PubSub.shutdown(events)

				return Stream.fromPubSub(events)
			})
		)
	)

const councilModels = (request: SearchRequestType) =>
	(request.councilModels && request.councilModels.length > 0
		? request.councilModels.map(normalizeModel)
		: (() => {
				const base = normalizeModel(request.model)
				return [
					base,
					normalizeModel(`${base.provider}:kimi-k2.5-free`),
					normalizeModel(`${base.provider}:minimax-m2.1-free`)
				]
			})())

const runCouncil = (request: SearchRequestType, exa: Exa) =>
	Stream.unwrap(
		withSearchError(
			Effect.gen(function* () {
				const events = yield* PubSub.unbounded<SearchStreamPart>()
				const sources = yield* gatherSources(exa, request.query, 6)
				yield* PubSub.publish(events, SearchStarted.make({request}))
				yield* PubSub.publish(events, SourcesReady.make({sources}))

				const models = councilModels(request)
				const answers = yield* Effect.forEach(
					models,
					modelChoice =>
						Effect.gen(function* () {
							const model = yield* resolveLanguageModel(modelChoice)
							const prompt = answerPrompt(request.query, [], sources)
							const result = yield* streamAnswer(
								model,
								prompt,
								Effect.succeed,
								sources.map(source => source.id)
							)
							return {model: modelChoice, answer: result}
						}),
					{concurrency: 3}
				)

				for (const answer of answers) {
					yield* PubSub.publish(events, CouncilAnswer.make({model: answer.model, answer: answer.answer}))
				}

				const model: LanguageModel = yield* resolveLanguageModel(request.model)
				const mergedPrompt = mergeCouncilPrompt(
					request.query,
					answers.map(item => ({
						model: `${item.model.provider}:${item.model.model}`,
						text: item.answer.text
					}))
				)

				const merged = yield* streamAnswer(
					model,
					mergedPrompt,
					chunk => PubSub.publish(events, AnswerDelta.make({chunk})),
					sources.map(source => source.id)
				)

				const history = SearchHistoryEntry.make({
					id: crypto.randomUUID(),
					query: request.query,
					mode: request.mode,
					model: request.model,
					councilModels: models,
					answer: merged,
					sources,
					createdAt: Date.now()
				})

				yield* PubSub.publish(events, AnswerCompleted.make({answer: merged, sources}))
				yield* persistHistoryEntry(history)
				yield* PubSub.publish(events, HistoryStored.make({entry: history}))
				yield* PubSub.shutdown(events)

				return Stream.fromPubSub(events)
			})
		)
	)

const runByMode = (request: SearchRequestType, exa: Exa) =>
	Match.value(request.mode).pipe(
		Match.when('normal', () => runNormalSearch(request, exa)),
		Match.when('deep', () => runDeepResearch(request, exa)),
		Match.when('council', () => runCouncil(request, exa)),
		Match.orElse(() => runNormalSearch(request, exa))
	)

export const SearchLive = SearchRpcs.toLayer(
	Effect.gen(function* () {
		const exa = yield* makeExa

		return SearchRpcs.of({
			RunSearch: request => runByMode(request, exa),
			ListHistory: () => withSearchError(loadHistory),
			ListJobs: () => withSearchError(loadJobs)
		})
	})
)
