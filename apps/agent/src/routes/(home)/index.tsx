import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, Match, pipe, Stream, String} from 'effect'

import {partsStreamReducer} from '@ai-toolkit/ai/schema'
import {Conversation} from '@ai-toolkit/components/conversation'
import {Code, CodeXml} from '@ai-toolkit/components/icons'
import {ChatInput, Snippet, Snippets, Toolbar} from '@ai-toolkit/components/input'
import {Markdown} from '@ai-toolkit/components/render/markdown'
import {createFileRoute} from '@tanstack/react-router'
import {Prompt} from 'effect/unstable/ai'
import {Atom} from 'effect/unstable/reactivity'

import {AtomRuntime, RpcClient} from '#lib/atomRuntime.ts'

export const Route = createFileRoute('/(home)/')({
	component: RouteComponent
})

const messagesAtom = Atom.keepAlive(
	AtomRuntime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('agent.events', void 0)),
			Effect.map(partsStreamReducer),
			Stream.unwrap
		),
		{initialValue: Array.empty()}
	)
)

const sendPromptAtom = AtomRuntime.fn(
	Effect.fnUntraced(function* (payload: {text: string; attachments: File[]}) {
		const client = yield* RpcClient

		const files = yield* Effect.forEach(
			payload.attachments,
			Effect.fnUntraced(function* (file) {
				const data = yield* Effect.promise(async () => new Uint8Array(await file.arrayBuffer()))
				return Prompt.makePart('file', {
					mediaType: file.type || 'application/octet-stream',
					fileName: file.name,
					data
				})
			}),
			{concurrency: 'unbounded'}
		)

		yield* client(
			'agent.prompt',
			Prompt.userMessage({content: [Prompt.makePart('text', {text: payload.text}), ...files]})
		)
	})
)

const stopAgentAtom = AtomRuntime.fn(
	Effect.fnUntraced(function* () {
		const client = yield* RpcClient
		yield* client('agent.stop', void 0)
	})
)

function RouteComponent() {
	const {value: messages} = useAtomSuspense(messagesAtom)
	const sendPrompt = useAtomSet(sendPromptAtom)
	const stopAgent = useAtomSet(stopAgentAtom)

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<Conversation className="gap-3 p-3">
				{Array.map(messages, (message, index) => (
					<div key={index} className="whitespace-pre-wrap bg-card">
						{pipe(
							Match.value(message),
							Match.when(Prompt.isMessage, message =>
								JSON.stringify({role: message.role, content: message.content}, null, 2)
							),
							Match.when({type: 'response-metadata'}, metadata =>
								JSON.stringify({modelId: metadata.modelId, timestamp: metadata.timestamp}, null, 2)
							),
							Match.when({type: 'text-delta'}, text => <Markdown>{text.delta}</Markdown>),
							Match.when({type: 'reasoning-delta'}, reasoning => (
								<Markdown className="text-muted-foreground">{reasoning.delta}</Markdown>
							)),
							Match.when({type: 'finish'}, finish =>
								JSON.stringify({reason: finish.reason, usage: finish.usage}, null, 2)
							),
							Match.when({type: 'tool-call'}, toolCall =>
								JSON.stringify({toolName: toolCall.name, input: toolCall.params}, null, 2)
							),
							Match.when({type: 'tool-result'}, toolResult => (
								<div className="flex flex-col gap-2 p-2">
									<div>{toolResult.name}</div>
									{Array.map(toolResult.result, (result, index) => (
										<div key={index} className="flex flex-col border-2 border-blue-500">
											<div>
												{result.title} - {result.url}
											</div>
											{Array.map(result.highlights, String.slice(0, 50))}
										</div>
									))}
								</div>
							)),
							Match.orElse(() => JSON.stringify(message, null, 2))
						)}
					</div>
				))}
			</Conversation>

			<ChatInput onSubmit={sendPrompt} onCancel={stopAgent}>
				<Toolbar>openrouter/free</Toolbar>

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
