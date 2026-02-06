/** biome-ignore-all lint/suspicious/noArrayIndexKey: llm tokens */

import {Predicate} from 'effect'

import type {Message as MessageType} from '@ai-toolkit/ai'
import {BookOpenTextIcon, BotIcon, HashIcon, InboxIcon, UserIcon} from 'lucide-react'

import {Error} from '#components/ai/error.tsx'
import {Markdown} from '#components/ai/markdown.tsx'
import {ReasoningDelta} from '#components/ai/reasoning-delta.tsx'
import {ToolCall} from '#components/ai/tool-call.tsx'
import {ToolResult} from '#components/ai/tool-result.tsx'
import {cn, formatRelativeTime, formatTokens} from '#lib/utils.ts'

export function Message(props: MessageType) {
	return (
		<article className="flex items-start gap-2">
			<div
				className={cn(
					'mt-0.5 h-full w-0.5 shrink-0',
					props.role === 'user' && 'bg-primary',
					props.role === 'assistant' && 'bg-muted-foreground/40',
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
								case 'text-delta':
									return <Markdown key={index}>{part.text}</Markdown>
								case 'reasoning-delta':
									return <ReasoningDelta key={index} {...part} />
								case 'tool-call':
									return <ToolCall key={index} {...part} />
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
							{Predicate.isNotNullable(props.usage.input) && (
								<span className="inline-flex items-center gap-1 font-mono">
									<InboxIcon className="size-3" />
									{formatTokens(props.usage.input)}
								</span>
							)}
							{Predicate.isNotNullable(props.usage.output) && (
								<span className="inline-flex items-center gap-1 font-mono">
									<BookOpenTextIcon className="size-3" />
									{formatTokens(props.usage.output)}
								</span>
							)}
							{Predicate.isNotNullable(props.usage.reasoning) && (
								<span className="inline-flex items-center gap-1 font-mono">
									<HashIcon className="size-3" />
									{formatTokens(props.usage.output)}
								</span>
							)}
						</div>
					)}
				</div>
			</div>
		</article>
	)
}
