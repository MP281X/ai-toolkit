import type { TextStreamPart } from 'ai'
import {
	AiFinish,
	AiStreamError,
	AiStreamFinish,
	AiStreamReasoningDelta,
	AiStreamTextDelta,
	AiStreamToolCall,
	AiStreamToolResult,
	AiUsage
} from '../schemas.ts'

export const fromAiSdkStreamPart = (part: TextStreamPart<never>) => {
	switch (part.type) {
		case 'text-delta':
			return AiStreamTextDelta.make({ text: part.text })
		case 'reasoning-delta':
			return AiStreamReasoningDelta.make({ text: part.text })
		case 'tool-call':
			return AiStreamToolCall.make({
				toolCallId: part.toolCallId,
				toolName: part.toolName,
				args: 'input' in part ? part.input : {}
			})
		case 'tool-result':
			return AiStreamToolResult.make({
				toolCallId: part.toolCallId,
				toolName: part.toolName,
				result: part.output,
				isError: undefined
			})
		case 'tool-error':
			return AiStreamToolResult.make({
				toolCallId: part.toolCallId,
				toolName: part.toolName,
				result: part.error,
				isError: true
			})
		case 'finish':
			return AiStreamFinish.make({
				finish: AiFinish.make({
					reason: part.finishReason,
					status: part.finishReason === 'error' ? 'error' : 'success'
				}),
				usage: AiUsage.make({
					inputTokens: part.totalUsage.inputTokens,
					outputTokens: part.totalUsage.outputTokens,
					totalTokens: part.totalUsage.totalTokens
				})
			})
		case 'error':
			return AiStreamError.make({ error: part.error ?? new Error('Unknown error') })
		default:
			return undefined
	}
}
