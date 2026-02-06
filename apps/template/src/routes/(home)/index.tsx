import {ChatInput} from '@ai-toolkit/components/ai/input'
import {Message} from '@ai-toolkit/components/ai/message'
import {Conversation} from '@ai-toolkit/components/conversation'
import {createFileRoute} from '@tanstack/react-router'
import {useQuery} from 'convex/react'

import {api} from '#convex/api.js'

export const Route = createFileRoute('/(home)/')({component: RouteComponent})

function RouteComponent() {
	const messages = useQuery(api.messages.list, {}) ?? []

	return (
		<div className="flex h-svh w-full flex-col bg-background text-foreground">
			<Conversation className="min-h-0 flex-1">
				{messages.map(message => (
					<Message key={message._id} {...message} />
				))}
			</Conversation>

			<ChatInput
				onSubmit={input => {
					// biome-ignore lint/suspicious/noConsole: _
					console.log(input)
				}}
			/>
		</div>
	)
}
