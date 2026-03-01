/** biome-ignore-all lint/suspicious/noArrayIndexKey: llm tokens */

import {Array} from 'effect'

import type {ConversationMessage, ToolMessagePart} from '@ai-toolkit/ai/schema'
import {BookOpenTextIcon, BotIcon, HashIcon, InboxIcon, SparklesIcon, WrenchIcon} from 'lucide-react'

import {Attachment} from '#components/ai/attachment.tsx'
import {Error} from '#components/ai/error.tsx'
import {ReasoningDelta} from '#components/ai/reasoning-delta.tsx'
import {ToolApproval} from '#components/ai/tool-approval.tsx'
import {ToolError} from '#components/ai/tool-error.tsx'
import {ToolInteraction} from '#components/ai/tool-interaction.tsx'
import {ToolResult} from '#components/ai/tool-result.tsx'
import {Markdown} from '#components/render/markdown.tsx'
import {cn, formatRelativeTime, formatTokens} from '#lib/utils.ts'

export function Message(props: ConversationMessage & {onToolResponse?: (response: ToolMessagePart) => void}) {
	const hasApproval = props.parts.some(p => p._tag === 'tool-approval-request')
	return (
		<article className="flex gap-2">
			<div
				className={cn(
					'w-0.5 shrink-0',
					props.finishReason === 'stop' ? 'bg-blue-500/60' : 'bg-muted-foreground/40',
					hasApproval && 'bg-violet-500/60',
					props.role === 'user' && 'bg-primary'
				)}
			/>
			<div className="min-w-0 flex-1">
				<div
					className={cn(
						'w-full border-2 px-3',
						props.finishReason === 'stop' ? 'border-blue-500/30 bg-blue-500/1' : 'border-border',
						hasApproval && 'border-violet-500/30',
						props.role === 'user' && 'border-primary/20 bg-primary/1'
					)}
				>
					<div className="flex items-center gap-1.5 border-border/60 border-b py-2 font-mono text-[11px] text-muted-foreground leading-none">
						{props.role === 'user' && <BotIcon className="size-3 text-primary" />}
						{props.role === 'assistant' && <SparklesIcon className="size-3" />}
						{props.role === 'tool' && <WrenchIcon className="size-3" />}
						<span>
							{props.model.provider}/{props.model.model}
						</span>
						<span className="ml-auto">{formatRelativeTime(props.startedAt)}</span>
					</div>
					<div className="flex flex-col gap-2 py-2 text-[13px] leading-relaxed">
						{Array.isReadonlyArrayEmpty(props.parts) ? (
							<div className="flex gap-1 py-0.5">
								<div className="size-1.5 animate-pulse bg-muted-foreground/60" style={{animationDelay: '0ms'}} />
								<div className="size-1.5 animate-pulse bg-muted-foreground/60" style={{animationDelay: '200ms'}} />
								<div className="size-1.5 animate-pulse bg-muted-foreground/60" style={{animationDelay: '400ms'}} />
							</div>
						) : (
							props.parts.map((part, index) => {
								switch (part._tag) {
									case 'text':
										return <Markdown key={index}>{part.text}</Markdown>
									case 'reasoning':
										return <ReasoningDelta key={index} {...part} />
									case 'file':
										return <Attachment key={index} {...part} />
									case 'tool-approval-request':
										return <ToolApproval key={index} part={part} onResponse={props.onToolResponse} />
									case 'tool-call':
										return <ToolInteraction key={index} part={part} onResponse={props.onToolResponse} />
									case 'tool-result':
										return <ToolResult key={index} {...part} />
									case 'tool-error':
										return <ToolError key={index} {...part} />
									case 'error':
										return <Error key={index} {...part} />
									default:
										return null
								}
							})
						)}
					</div>
					{(props.usage.input > 0 || props.usage.output > 0) && (
						<div className="flex flex-wrap items-center gap-1.5 border-border/60 border-t py-2 font-mono text-[11px] text-muted-foreground leading-none">
							<span className="flex items-center gap-1">
								<InboxIcon className="size-3" />
								{formatTokens(props.usage.input)}
							</span>
							<span className="flex items-center gap-1">
								<BookOpenTextIcon className="size-3" />
								{formatTokens(props.usage.output)}
							</span>
							{props.usage.reasoning > 0 && (
								<span className="flex items-center gap-1">
									<HashIcon className="size-3" />
									{formatTokens(props.usage.reasoning)}
								</span>
							)}
						</div>
					)}
				</div>
			</div>
		</article>
	)
}
