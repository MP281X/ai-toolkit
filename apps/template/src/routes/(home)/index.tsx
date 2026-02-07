import type {Model} from '@ai-toolkit/ai'
import {Autocomplete, AutocompleteOption, ChatInput, Snippet, Snippets, Toolbar} from '@ai-toolkit/components/ai/input'
import {Message} from '@ai-toolkit/components/ai/message'
import {ModelSelector} from '@ai-toolkit/components/ai/model-selector'
import {Conversation} from '@ai-toolkit/components/conversation'
import {Code, CodeXml} from '@ai-toolkit/components/icons'
import {createFileRoute} from '@tanstack/react-router'
import {useQuery} from 'convex/react'
import {useState} from 'react'

import {api} from '#convex/api.js'

export const Route = createFileRoute('/(home)/')({component: RouteComponent})

function RouteComponent() {
	const messages = useQuery(api.messages.list, {}) ?? []
	const [model, setModel] = useState<Model>({provider: 'opencode_zen', model: 'kimi-k2.5-free'})

	return (
		<div className="flex h-svh w-full flex-col bg-background text-foreground">
			<Conversation className="min-h-0 flex-1">
				{messages.map(message => (
					<Message key={message._id} {...message} />
				))}
			</Conversation>

			<ChatInput
				onSubmit={payload => {
					// biome-ignore lint/suspicious/noConsole: _
					console.log(payload)
				}}
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
