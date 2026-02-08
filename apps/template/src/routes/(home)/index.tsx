import {Effect, Stream} from 'effect'

import type {Model} from '@ai-toolkit/ai/schema'
import {Autocomplete, AutocompleteOption, ChatInput, Snippet, Snippets, Toolbar} from '@ai-toolkit/components/ai/input'
import {Message} from '@ai-toolkit/components/ai/message'
import {ModelSelector} from '@ai-toolkit/components/ai/model-selector'
import {Conversation} from '@ai-toolkit/components/conversation'
import {Code, CodeXml} from '@ai-toolkit/components/icons'
import {useAtomSuspense} from '@effect-atom/atom-react'
import {createFileRoute} from '@tanstack/react-router'
import {useState} from 'react'

import {ApiClient, AtomRuntime} from '#lib/atomRuntime.ts'

export const Route = createFileRoute('/(home)/')({component: RouteComponent})

const listMessagesAtom = AtomRuntime.atom(
	Effect.gen(function* () {
		const client = yield* ApiClient
		return client('ListMessages', void 0)
	}).pipe(Stream.unwrap)
)

function RouteComponent() {
	const [model, setModel] = useState<Model>({provider: 'opencode_zen', model: 'kimi-k2.5-free'})

	const {value: messages} = useAtomSuspense(listMessagesAtom)

	return (
		<div className="flex h-svh w-full flex-col bg-background text-foreground">
			<Conversation className="min-h-0 flex-1">
				{messages.map((message, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: _
					<Message key={index} {...message} />
				))}
			</Conversation>

			<ChatInput
				// biome-ignore lint/suspicious/noConsole: TMP
				onSubmit={console.log}
			>
				<Toolbar>
					<ModelSelector model={model} onModelChange={setModel} />
				</Toolbar>

				<Autocomplete trigger="@" color="#38bdf8">
					<AutocompleteOption value="file" description="Attach a file" />
					<AutocompleteOption value="image" description="Attach an image" />
				</Autocomplete>
				<Autocomplete trigger="#" color="#e879f9">
					<AutocompleteOption value="agent" description="Change agent or system prompt" />
				</Autocomplete>
				<Autocomplete trigger="/" color="#34d399">
					<AutocompleteOption value="command" description="Run a slash command" />
				</Autocomplete>

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
