import {AiStream} from '@ai-toolkit/components/ai/ai-stream'
import {BotIcon, UserIcon} from '@ai-toolkit/components/icons'
import {formatRelativeTime} from '@ai-toolkit/components/utils'
import {createFileRoute} from '@tanstack/react-router'
import {useQuery} from 'convex/react'

import {api} from '#convex/api.js'

export const Route = createFileRoute('/(home)/')({component: RouteComponent})

function RouteComponent() {
	const messages = useQuery(api.messages.list, {})
	const displayMessages = messages ? [...messages].reverse() : []

	return (
		<div className="min-h-svh w-full bg-background text-foreground">
			<div className="flex h-svh flex-col overflow-y-auto">
				<div className="flex flex-col gap-2 px-3 py-3">
					{!messages && <div className="px-2 py-6 text-muted-foreground text-sm">Loading messages...</div>}
					{messages && displayMessages.length === 0 && (
						<div className="px-2 py-6 text-muted-foreground text-sm">No messages yet.</div>
					)}
					{displayMessages.map(message => {
						const isStopFinish = message.finishReason === 'stop'
						const highlightVariant = message.role === 'user' ? 'primary' : isStopFinish ? 'stop' : 'none'
						const RoleIcon = message.role === 'user' ? UserIcon : BotIcon
						const highlightClassName =
							highlightVariant === 'primary'
								? 'border border-primary/20 bg-primary/[0.01]'
								: 'border border-blue-500/30 bg-blue-500/[0.01]'
						return (
							<article key={message._id} className="flex items-start gap-2">
								<div
									className={`mt-0.5 h-full w-0.5 shrink-0 ${
										message.role === 'user'
											? 'bg-primary'
											: message.role === 'assistant'
												? 'bg-muted-foreground/40'
												: 'bg-muted-foreground/30'
									}`}
								/>
								<div className="min-w-0 flex-1">
									<div className={`w-full px-3 ${highlightVariant === 'none' ? '' : highlightClassName}`}>
										<div className="flex items-center gap-1.5 border-border/60 border-b py-2 font-mono text-[11px] text-muted-foreground leading-none">
											<span className="flex items-center gap-1">
												<RoleIcon className="size-3" />
												{message.providerId}/{message.modelId}
											</span>
											<span className="ml-auto">{formatRelativeTime(message._creationTime)}</span>
										</div>
										<div className="flex flex-col gap-2 py-2 text-[13px] leading-relaxed">
											<AiStream parts={message.parts} usage={message.usage} />
										</div>
									</div>
								</div>
							</article>
						)
					})}
				</div>
			</div>
		</div>
	)
}
