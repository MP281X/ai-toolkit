/** biome-ignore-all lint/suspicious/noArrayIndexKey: reconstructed stream order */

import {Array} from 'effect'

import type {ConversationMessage, ToolMessagePart} from '@ai-toolkit/ai/schema'
import {BookOpenTextIcon, ClockIcon, HashIcon, InboxIcon, SparklesIcon, UserIcon} from 'lucide-react'

import {Attachment} from '#components/ai/attachment.tsx'
import {Error} from '#components/ai/error.tsx'
import {ReasoningDelta} from '#components/ai/reasoning-delta.tsx'
import {TextDelta} from '#components/ai/text-delta.tsx'
import {ToolInteraction} from '#components/ai/tool-interaction.tsx'
import {cn, formatDuration, formatRelativeTime, formatTokens} from '#lib/utils.ts'

type MessageTheme = {bar: string; border: string; bg: string}

function messageTheme(message: ConversationMessage): MessageTheme {
	if (message.parts.some(p => p._tag === 'tool' && p.status === 'pending-approval'))
		return {bar: 'bg-violet-500/60', border: 'border-violet-500/30', bg: ''}
	if (message.state === 'error') return {bar: 'bg-destructive/60', border: 'border-destructive/30', bg: ''}
	if (message.role === 'user') return {bar: 'bg-primary', border: 'border-primary/20', bg: 'bg-primary/1'}
	if (message.state === 'complete') return {bar: 'bg-blue-500/60', border: 'border-blue-500/30', bg: 'bg-blue-500/1'}
	return {bar: 'bg-muted-foreground/40', border: 'border-border', bg: ''}
}

function hasUsage(usage: ConversationMessage['usage']) {
	return usage.input > 0 || usage.output > 0
}

export function Message(props: {message: ConversationMessage; onToolResponse?: (response: ToolMessagePart) => void}) {
	const m = props.message
	const duration = m.role !== 'user' && m.finishedAt ? formatDuration(m.finishedAt - m.startedAt) : null
	const theme = messageTheme(m)

	return (
		<article className="flex gap-2">
			<div className={cn('w-0.5 shrink-0', theme.bar)} />
			<div className="min-w-0 flex-1">
				<div className={cn('w-full border-2 px-3', theme.border, theme.bg)}>
					<div className="flex items-center gap-1.5 border-border/60 border-b py-2 font-mono text-[11px] text-muted-foreground leading-none">
						{m.role === 'user' ? (
							<UserIcon className="size-3 shrink-0 text-primary" />
						) : (
							<SparklesIcon className="size-3 shrink-0" />
						)}
						<span className="min-w-0 truncate">
							<span className="text-muted-foreground/50">{m.model.provider}/</span>
							<span>{m.model.model}</span>
						</span>
						<span className="ml-auto flex shrink-0 items-center gap-3">
							{hasUsage(m.usage) && (
								<>
									<span className="flex items-center gap-1" title="Input tokens">
										<InboxIcon className="size-3 shrink-0" />
										{formatTokens(m.usage.input)}
									</span>
									<span className="flex items-center gap-1" title="Output tokens">
										<BookOpenTextIcon className="size-3 shrink-0" />
										{formatTokens(m.usage.output)}
									</span>
									{m.usage.reasoning > 0 && (
										<span className="flex items-center gap-1" title="Reasoning tokens">
											<HashIcon className="size-3 shrink-0" />
											{formatTokens(m.usage.reasoning)}
										</span>
									)}
								</>
							)}
							{duration && (
								<span className="flex items-center gap-1 text-muted-foreground/40" title="Duration">
									<ClockIcon className="size-3 shrink-0" />
									{duration}
								</span>
							)}
							<span className="text-muted-foreground/40">{formatRelativeTime(m.startedAt)}</span>
						</span>
					</div>

					<div className="flex flex-col gap-2 py-2 text-[13px] leading-relaxed">
						{m.state === 'streaming' && Array.isReadonlyArrayEmpty(m.parts) ? (
							<div className="flex gap-1 py-0.5">
								<span
									className="inline-block size-1.5 animate-pulse bg-muted-foreground/60"
									style={{animationDelay: '0ms'}}
								/>
								<span
									className="inline-block size-1.5 animate-pulse bg-muted-foreground/60"
									style={{animationDelay: '200ms'}}
								/>
								<span
									className="inline-block size-1.5 animate-pulse bg-muted-foreground/60"
									style={{animationDelay: '300ms'}}
								/>
							</div>
						) : (
							m.parts.map((part, index) => {
								switch (part._tag) {
									case 'text':
										return <TextDelta key={index} part={part} />
									case 'reasoning':
										return <ReasoningDelta key={index} part={part} />
									case 'file':
										return <Attachment key={index} part={part} />
									case 'tool':
										return <ToolInteraction key={index} part={part} onResponse={props.onToolResponse} />
									case 'error':
										return <Error key={index} part={part} />
									default:
										return null
								}
							})
						)}
					</div>
				</div>
			</div>
		</article>
	)
}
