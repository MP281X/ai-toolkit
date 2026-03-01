/** biome-ignore-all lint/suspicious/noArrayIndexKey: llm tokens */

import type {ConversationMessage, ToolResponsePart} from '@ai-toolkit/ai/schema'
import {BookOpenTextIcon, BotIcon, HashIcon, InboxIcon, UserIcon} from 'lucide-react'

import {Attachment} from '#components/ai/attachment.tsx'
import {Error} from '#components/ai/error.tsx'
import {ReasoningDelta} from '#components/ai/reasoning-delta.tsx'
import {ToolInteraction} from '#components/ai/tool-interaction.tsx'
import {ToolResult} from '#components/ai/tool-result.tsx'
import {Markdown} from '#components/render/markdown.tsx'
import {cn, formatRelativeTime, formatTokens} from '#lib/utils.ts'

export function Message(props: ConversationMessage & {onToolResponse?: (response: ToolResponsePart) => void}) {
	return (
		<article className="flex items-start gap-2">
			<div
				className={cn(
					'mt-0.5 h-full w-0.5 shrink-0',
					props.role === 'user' && 'bg-primary',
					(props.role === 'assistant' || props.role === 'tool') && 'bg-muted-foreground/40',
					props.role === 'system' && 'bg-muted-foreground/30'
				)}
			/>
			<div className="min-w-0 flex-1">
				<div
					className={cn(
						'w-full px-3',
						props.role === 'user' && 'border border-primary/20 bg-primary/1',
						props.role !== 'user' && props.finishReason === 'stop' && 'border border-blue-500/30 bg-blue-500/1'
					)}
				>
					<div className="flex items-center gap-1.5 border-border/60 border-b py-2 font-mono text-[11px] text-muted-foreground leading-none">
						<span className="flex items-center gap-1">
							{props.role === 'user' ? <UserIcon className="size-3" /> : <BotIcon className="size-3" />}
							{props.model.provider}/{props.model.model}
						</span>
						<span className="ml-auto">{formatRelativeTime(props.startedAt)}</span>
					</div>
					<div className="flex flex-col gap-2 py-2 text-[13px] leading-relaxed">
						{props.parts.map((part, index) => {
							switch (part._tag) {
								case 'text-part':
									return <Markdown key={index}>{part.text}</Markdown>
								case 'reasoning-part':
									return <ReasoningDelta key={index} {...part} />
								case 'file-part':
									return <Attachment key={index} {...part} />
								case 'tool-call':
									return <ToolInteraction key={index} part={part} onResponse={props.onToolResponse} />
								case 'tool-approval-request':
									return <ToolInteraction key={index} part={part} onResponse={props.onToolResponse} />
								case 'tool-output-denied':
									return <ToolInteraction key={index} part={part} onResponse={props.onToolResponse} />
								case 'tool-result':
									return <ToolResult key={index} {...part} />
								case 'tool-error':
									return <ToolResult key={index} {...part} />
								case 'error':
									return <Error key={index} {...part} />
								default:
									return null
							}
						})}
					</div>
					{props.usage && (
						<div className="flex flex-wrap items-center gap-1.5 border-border/60 border-t py-2 text-[11px] text-muted-foreground leading-none">
							<span className="inline-flex items-center gap-1 font-mono">
								<InboxIcon className="size-3" />
								{formatTokens(props.usage.input)}
							</span>
							<span className="inline-flex items-center gap-1 font-mono">
								<BookOpenTextIcon className="size-3" />
								{formatTokens(props.usage.output)}
							</span>
							<span className="inline-flex items-center gap-1 font-mono">
								<HashIcon className="size-3" />
								{formatTokens(props.usage.output)}
							</span>
						</div>
					)}
				</div>
			</div>
		</article>
	)
}
