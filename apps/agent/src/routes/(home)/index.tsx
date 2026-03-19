import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, Match, pipe, Stream, String} from 'effect'

import {partsStreamReducer} from '@ai-toolkit/ai/schema'
import {Conversation} from '@ai-toolkit/components/conversation'
import {ArrowUpIcon, BotIcon, Square} from '@ai-toolkit/components/icons'
import {AutocompleteInput} from '@ai-toolkit/components/input'
import {Markdown} from '@ai-toolkit/components/render/markdown'
import {Button} from '@ai-toolkit/components/ui/button'
import {createFileRoute} from '@tanstack/react-router'
import {Prompt} from 'effect/unstable/ai'
import {Atom} from 'effect/unstable/reactivity'
import {useRef} from 'react'

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
	const inputRef = useRef<AutocompleteInput.Handle<{id: number; label: string}>>(null)

	function submit() {
		const text = inputRef.current?.getText() ?? ''
		if (String.isEmpty(text)) return

		sendPrompt({text, attachments: Array.fromIterable(inputRef.current?.getFiles() ?? [])})
		inputRef.current?.clear()
	}

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

			<div className="border-border/60 border-t bg-background px-3 py-3">
				<div className="flex flex-col gap-2">
					<AutocompleteInput
						ref={inputRef}
						onSubmit={submit}
						placeholder="Send a message..."
						options={{
							'@': {
								color: '#60a5fa',
								values: Array.makeBy(50, i => ({id: i, label: `openrouter/${i}`}))
							},
							'#': {
								color: '#56815f',
								values: Array.makeBy(50, i => ({id: i, label: `ciao/${i}`}))
							}
						}}
					>
						{entry => (
							<>
								{/* biome-ignore lint/plugin: dynamic colors are part of the autocomplete entry API here */}
								<BotIcon className="size-4 shrink-0" style={{color: entry.color}} />
								<span className="truncate text-foreground">{entry.value.label}</span>
							</>
						)}
					</AutocompleteInput>

					<div className="flex items-center justify-between">
						<div className="text-muted-foreground text-xs">openrouter/free</div>
						<div className="flex items-center gap-2">
							<Button onClick={() => stopAgent()} variant="outline" size="icon-xs">
								<Square className="size-3.5 fill-current" />
							</Button>
							<Button onClick={submit} size="icon-xs">
								<ArrowUpIcon className="size-3.5" />
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
