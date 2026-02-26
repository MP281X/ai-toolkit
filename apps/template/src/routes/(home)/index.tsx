import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Effect, pipe, Stream} from 'effect'

import type {ModelId, ProviderId} from '@ai-toolkit/ai/catalog'
import {TextPart} from '@ai-toolkit/ai/schema'
import {ChatInput, Snippet, Snippets, Toolbar} from '@ai-toolkit/components/ai/input'
import {Message} from '@ai-toolkit/components/ai/message'
import {ModelSelector} from '@ai-toolkit/components/ai/model-selector'
import {Conversation} from '@ai-toolkit/components/conversation'
import {Loading} from '@ai-toolkit/components/fallbacks'
import {Code, CodeXml} from '@ai-toolkit/components/icons'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {Suspense, useState} from 'react'

import {AtomRuntime, RpcClient} from '#lib/atomRuntime.ts'

export const Route = createFileRoute('/(home)/')({
	component: RouteComponent
})

function RouteComponent() {
	return (
		<Suspense fallback={<Loading />}>
			<Session />
		</Suspense>
	)
}

const messagesAtom = Atom.keepAlive(
	AtomRuntime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('ai.listMessages', void 0)),
			Stream.unwrap
		)
	)
)

function Session() {
	const {value: messages} = useAtomSuspense(messagesAtom)
	const sendMessage = useAtomSet(RpcClient.mutation('ai.sendMessage'))
	const toolInteraction = useAtomSet(RpcClient.mutation('ai.tool'))
	const [model, setModel] = useState<{model: ModelId; provider: ProviderId}>({
		provider: 'openrouter',
		model: 'openai/gpt-oss-20b:free'
	})

	return (
		<div className="flex h-full w-full flex-col">
			<Conversation className="min-h-0 flex-1">
				{messages.map(message => (
					<Message
						key={`${message.startedAt}-${message.role}`}
						{...message}
						onToolResponse={response => toolInteraction({payload: response})}
					/>
				))}
			</Conversation>

			<ChatInput
				onSubmit={data =>
					sendMessage({
						payload: {
							model: model.model,
							provider: model.provider,
							parts: [new TextPart({text: data.text}), ...data.attachments]
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
