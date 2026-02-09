import * as KeyValueStore from '@effect/platform/KeyValueStore'
import {Effect, Option, Ref, Schema, Stream} from 'effect'

import {ReviewComment, SessionId} from '@ai-toolkit/review/schema'

import {AiSdk} from './service.ts'

export type AgentId = typeof AgentId.Type
export const AgentId = Schema.String.pipe(Schema.brand('AgentId'))

export type StreamId = typeof StreamId.Type
export const StreamId = Schema.String.pipe(Schema.brand('StreamId'))

export type QuestionId = typeof QuestionId.Type
export const QuestionId = Schema.String.pipe(Schema.brand('QuestionId'))

export const Timestamp = Schema.Number

type QuestionOptionProps = {
	readonly id: string
	readonly label: string
}
export class QuestionOption extends Schema.Class<QuestionOptionProps>('QuestionOption')({
	id: Schema.String,
	label: Schema.String
}) {}

type AgentQuestionProps = {
	readonly agentId: AgentId
	readonly sessionId: SessionId
	readonly questionId: QuestionId
	readonly prompt: string
	readonly options: QuestionOption[]
	readonly allowFreeform: boolean
}
export class AgentQuestion extends Schema.TaggedClass<AgentQuestionProps>()('question', {
	agentId: AgentId,
	sessionId: SessionId,
	questionId: QuestionId,
	prompt: Schema.String,
	options: Schema.Array(QuestionOption),
	allowFreeform: Schema.Boolean
}) {}

type AgentLogProps = {
	readonly agentId: AgentId
	readonly sessionId: SessionId
	readonly message: string
	readonly timestamp: number
}
export class AgentLog extends Schema.TaggedClass<AgentLogProps>()('log', {
	agentId: AgentId,
	sessionId: SessionId,
	message: Schema.String,
	timestamp: Timestamp
}) {}

type AgentProgressProps = {
	readonly agentId: AgentId
	readonly sessionId: SessionId
	readonly message: string
	readonly stage: string
	readonly timestamp: number
}
export class AgentProgress extends Schema.TaggedClass<AgentProgressProps>()('progress', {
	agentId: AgentId,
	sessionId: SessionId,
	message: Schema.String,
	stage: Schema.String,
	timestamp: Timestamp
}) {}

type AgentErrorProps = {
	readonly agentId: AgentId
	readonly sessionId: SessionId
	readonly error: string
	readonly timestamp: number
}
export class AgentError extends Schema.TaggedClass<AgentErrorProps>()('agent-error', {
	agentId: AgentId,
	sessionId: SessionId,
	error: Schema.String,
	timestamp: Timestamp
}) {}

type AgentDoneProps = {
	readonly agentId: AgentId
	readonly sessionId: SessionId
	readonly timestamp: number
}
export class AgentDone extends Schema.TaggedClass<AgentDoneProps>()('agent-done', {
	agentId: AgentId,
	sessionId: SessionId,
	timestamp: Timestamp
}) {}

type AgentMessageProps = {
	readonly agentId: AgentId
	readonly sessionId: SessionId
	readonly role: 'assistant' | 'system'
	readonly content: string
	readonly timestamp: number
}
export class AgentMessage extends Schema.TaggedClass<AgentMessageProps>()('agent-message', {
	agentId: AgentId,
	sessionId: SessionId,
	role: Schema.Literal('assistant', 'system'),
	content: Schema.String,
	timestamp: Timestamp
}) {}

type AgentAnswerProps = {
	readonly agentId: AgentId
	readonly sessionId: SessionId
	readonly questionId: QuestionId
	readonly answer: string
	readonly selectedOption?: QuestionOption
	readonly submittedAt: number
}
export class AgentAnswer extends Schema.Class<AgentAnswerProps>('AgentAnswer')({
	agentId: AgentId,
	sessionId: SessionId,
	questionId: QuestionId,
	answer: Schema.String,
	selectedOption: Schema.optional(QuestionOption),
	submittedAt: Timestamp
}) {}

type AgentRunRequestProps = {
	readonly agentId: AgentId
	readonly sessionId: SessionId
	readonly repoPath: string
	readonly comments: ReviewComment[]
	readonly globalSummary?: string
	readonly message?: string
}
export class AgentRunRequest extends Schema.Class<AgentRunRequestProps>('AgentRunRequest')({
	agentId: AgentId,
	sessionId: SessionId,
	repoPath: Schema.String,
	comments: Schema.Array(ReviewComment),
	globalSummary: Schema.optional(Schema.String),
	message: Schema.optional(Schema.String)
}) {}

export type AgentEvent = typeof AgentEvent.Type
export const AgentEvent = Schema.Union(AgentQuestion, AgentLog, AgentProgress, AgentError, AgentDone, AgentMessage)

const AgentStateSchema = Schema.Class<AgentState>('AgentState')({
	agentId: AgentId,
	sessionId: Schema.String,
	status: Schema.Literal('idle', 'running', 'waiting_for_answer', 'completed', 'failed'),
	lastEventAt: Timestamp
})
export const AgentState = AgentStateSchema

const StreamStateSchema = Schema.Class<StreamState>('StreamState')({
	id: StreamId,
	position: Schema.Number,
	buffer: Schema.String,
	updatedAt: Timestamp
})
export const StreamState = StreamStateSchema

export class AgentStore extends Effect.Service<AgentStore>()('@ai-toolkit/ai/AgentStore', {
	accessors: true,
	effect: Effect.gen(function* () {
		const kv = KeyValueStore.prefix('ai:')(yield* KeyValueStore.KeyValueStore)
		const streamStore = kv.forSchema(StreamState)
		const agentStore = kv.forSchema(AgentState)

		return {
			saveStreamState: Effect.fnUntraced(function* (state: StreamState) {
				yield* streamStore.set(`stream:${state.id}`, state)
				return state
			}),

			getStreamState: Effect.fnUntraced(function* (id: StreamId) {
				return yield* streamStore.get(`stream:${id}`)
			}),

			saveAgentState: Effect.fnUntraced(function* (state: AgentState) {
				yield* agentStore.set(`agent:${state.agentId}:state`, state)
				return state
			}),

			getAgentState: Effect.fnUntraced(function* (id: AgentId) {
				return yield* agentStore.get(`agent:${id}:state`)
			})
		}
	})
}) {}

function buildQuestion(request: AgentRunRequest) {
	return AgentQuestion.make({
		agentId: request.agentId,
		sessionId: request.sessionId,
		questionId: `${request.agentId}:instructions` as QuestionId,
		prompt: 'Add any extra instructions for the agent before it starts fixes.',
		options: [
			QuestionOption.make({id: 'proceed', label: 'Proceed with current comments'}),
			QuestionOption.make({id: 'needs-more', label: 'I will add more context'}),
			QuestionOption.make({id: 'commit-only', label: 'Only draft commit message'})
		],
		allowFreeform: true
	})
}

function streamFromAi(request: AgentRunRequest) {
	return Stream.unwrap(
		Effect.gen(function* () {
			const ai = yield* AiSdk
			const store = yield* AgentStore
			const bufferRef = yield* Ref.make('')

			yield* store.saveAgentState(
				AgentState.make({
					agentId: request.agentId,
					sessionId: request.sessionId,
					status: 'running',
					lastEventAt: Date.now()
				})
			)

	const prompt = `
You are reviewing a codebase. Apply fixes for the following comments:
${request.comments
	.map((comment: ReviewComment) => `- ${comment.filePath}:${comment.newLine ?? comment.oldLine ?? 0} ${comment.message}`)
	.join('\n')}

Global summary:
${request.globalSummary ?? 'n/a'}

User message:
${request.message ?? 'n/a'}

Respond with step-by-step actions and code edits.`

			const aiStream = ai.stream({
				prompt,
				model: {provider: 'opencode_zen', model: 'kimi-k2.5-free'}
			})

			const streamId = `${request.agentId}-stream` as StreamId

			const events = aiStream.pipe(
				Stream.mapEffect(part =>
					Effect.gen(function* () {
						if (typeof part !== 'object' || part === null) return Option.none()

						if ((part as {readonly _tag?: string})._tag === 'start') {
							return Option.some(
								AgentProgress.make({
									agentId: request.agentId,
									sessionId: request.sessionId,
									message: 'Agent started',
									stage: 'start',
									timestamp: Date.now()
								})
							)
						}

						if ((part as {readonly _tag?: string})._tag === 'text-delta') {
							const text = `${(part as {readonly text?: string}).text ?? ''}`
							const buffer = yield* Ref.updateAndGet(bufferRef, current => `${current}${text}`)
							yield* store.saveStreamState(
								StreamState.make({
									id: streamId,
									position: buffer.length,
									buffer,
									updatedAt: Date.now()
								})
							)
							return Option.some(
								AgentMessage.make({
									agentId: request.agentId,
									sessionId: request.sessionId,
									role: 'assistant',
									content: text,
									timestamp: Date.now()
								})
							)
						}

						if ((part as {readonly _tag?: string})._tag === 'finish') {
							yield* store.saveAgentState(
								AgentState.make({
									agentId: request.agentId,
									sessionId: request.sessionId,
									status: 'completed',
									lastEventAt: Date.now()
								})
							)
							return Option.some(
								AgentDone.make({
									agentId: request.agentId,
									sessionId: request.sessionId,
									timestamp: Date.now()
								})
							)
						}

						return Option.none()
					})
				),
				Stream.filterMap((option: Option.Option<AgentEvent>) => option)
			)

			return events
		})
	)
}

export function runAgent(request: AgentRunRequest) {
	if (!request.message)
		return Stream.unwrap(
			Effect.gen(function* () {
				const store = yield* AgentStore
				yield* store.saveAgentState(
					AgentState.make({
						agentId: request.agentId,
						sessionId: request.sessionId,
						status: 'waiting_for_answer',
						lastEventAt: Date.now()
					})
				)
				return Stream.fromIterable([buildQuestion(request)])
			})
		)
	return streamFromAi(request)
}

export function answerQuestion(answer: AgentAnswer) {
	return Effect.succeed(`${answer.selectedOption ? `Choice: ${answer.selectedOption.label}\n` : ''}${answer.answer}`)
}
