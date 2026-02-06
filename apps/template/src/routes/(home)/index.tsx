import {Message} from '@ai-toolkit/components/ai/message'
import {createFileRoute} from '@tanstack/react-router'
import {useQuery} from 'convex/react'

import {api} from '#convex/api.js'

export const Route = createFileRoute('/(home)/')({component: RouteComponent})

function RouteComponent() {
	const messages = useQuery(api.messages.list, {}) ?? []

	return (
		<div className="min-h-svh w-full bg-background text-foreground">
			<div className="flex h-svh flex-col overflow-y-auto">
				<div className="flex flex-col gap-2 px-3 py-3">
					{!messages && <div className="px-2 py-6 text-muted-foreground text-sm">Loading messages...</div>}
					{messages && messages.length === 0 && (
						<div className="px-2 py-6 text-muted-foreground text-sm">No messages yet.</div>
					)}
					{messages.map(message => (
						<Message key={message._id} message={message} />
					))}
				</div>
			</div>
		</div>
	)
}
