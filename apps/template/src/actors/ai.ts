import {Message, ReasoningDelta, TextDelta} from '@ai-toolkit/ai/schema'
import {actor} from '@ai-toolkit/rivet/server'

const messages = [
	Message.make({
		model: {model: 'glm-4.7-free', provider: 'opencode_zen'},
		startedAt: 0,
		role: 'system',
		parts: [
			TextDelta.make({id: '000', text: 'ciao'}),
			ReasoningDelta.make({id: '000', text: 'reasoning01'}),
			TextDelta.make({id: '000', text: 'ciao2'})
		],
		finishReason: 'stop'
	})
]

export const ai = actor({
	state: {messages},
	actions: {
		listMessages: c => c.state.messages
	}
})
