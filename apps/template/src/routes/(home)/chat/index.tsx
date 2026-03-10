import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, pipe, Stream} from 'effect'

import type {ModelId, ProviderId} from '@ai-toolkit/ai/catalog'
import {
	type AgentResponse,
	type ConversationEvent,
	PromptFilePart,
	PromptTextPart,
	reconstructMessages
} from '@ai-toolkit/ai/schema'
import {Message} from '@ai-toolkit/components/ai/message'
import {ModelSelector} from '@ai-toolkit/components/ai/model-selector'
import {Conversation} from '@ai-toolkit/components/conversation'
import {Code, CodeXml} from '@ai-toolkit/components/icons'
import {ChatInput, Snippet, Snippets, Toolbar} from '@ai-toolkit/components/input'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {useState} from 'react'

import {AtomRuntime, RpcClient} from '#lib/atomRuntime.ts'

export const Route = createFileRoute('/(home)/chat/')({
	component: RouteComponent
})

const messagesAtom = Atom.keepAlive(
	AtomRuntime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client =>
				client('ai.events', void 0).pipe(
					Stream.scan([] as readonly ConversationEvent[], (events, event) => [...events, event]),
					Stream.drop(1),
					Stream.map(events => reconstructMessages(events))
				)
			),
			Stream.unwrap
		),
		{initialValue: []}
	)
)

function RouteComponent() {
	const {value: messages} = useAtomSuspense(messagesAtom)
	const sendMessage = useAtomSet(RpcClient.mutation('ai.sendMessage'))
	const toolInteraction = useAtomSet(RpcClient.mutation('ai.tool'))
	const [model, setModel] = useState<{model: ModelId; provider: ProviderId}>({
		model: 'openai/gpt-oss-20b:free',
		provider: 'openrouter'
	})

	return (
		<div className="flex h-full w-full flex-col">
			<Conversation className="min-h-0 flex-1">
				{messages.map(message => (
					<Message
						key={message.id}
						message={message}
						onRespond={(response: AgentResponse) => toolInteraction({payload: response})}
					/>
				))}
			</Conversation>

			<ChatInput
				onSubmit={data =>
					sendMessage({
						payload: {
							model: {agent: 'ai', provider: model.provider, model: model.model},
							parts: [
								new PromptTextPart({text: data.text}),
								...Array.map(data.attachments, file => new PromptFilePart({file}))
							]
						}
					})
				}
			>
				<Toolbar>
					<ModelSelector model={model} onModelChange={setModel} />
				</Toolbar>

				<Snippets>
					<Snippet insert={'```\n\n```\n'}>
						<Code className="size-3.5" />
					</Snippet>
					<Snippet insert={'<section>\n\n</section>\n'}>
						<CodeXml className="size-3.5" />
					</Snippet>
				</Snippets>
			</ChatInput>
		</div>
	)
}
