import {Effect, Option, Ref, Stream} from 'effect'

import {AiSdk} from '@ai-toolkit/ai/service'

import {
	type AgentAnswer,
	AgentDone,
	type AgentEvent,
	AgentMessage,
	AgentProgress,
	AgentQuestion,
	type AgentRunRequest,
	AgentState,
	QuestionOption,
	type StreamId,
	StreamState
} from './schema.ts'
import {ReviewStore} from './store.ts'

const buildQuestion = (request: AgentRunRequest) =>
	AgentQuestion.make({
		agentId: request.agentId,
		sessionId: request.sessionId,
		questionId: `${request.agentId}:instructions`,
		prompt: 'Add any extra instructions for the agent before it starts fixes.',
		options: [
			QuestionOption.make({id: 'proceed', label: 'Proceed with current comments'}),
			QuestionOption.make({id: 'needs-more', label: 'I will add more context'}),
			QuestionOption.make({id: 'commit-only', label: 'Only draft commit message'})
		],
		allowFreeform: true
	})

const streamFromAi = (request: AgentRunRequest) =>
	Stream.unwrap(
		Effect.gen(function* () {
			const ai = yield* AiSdk
			const store = yield* ReviewStore
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
${request.comments.map(comment => `- ${comment.filePath}:${comment.newLine ?? comment.oldLine ?? 0} ${comment.message}`).join('\n')}

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

export const runAgent = (request: AgentRunRequest) => {
	if (!request.message)
		return Stream.unwrap(
			Effect.gen(function* () {
				const store = yield* ReviewStore
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

export const answerQuestion = (answer: AgentAnswer) =>
	Effect.succeed(`${answer.selectedOption ? `Choice: ${answer.selectedOption.label}\n` : ''}${answer.answer}`)
