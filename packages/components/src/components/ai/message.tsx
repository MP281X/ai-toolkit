/** biome-ignore-all lint/suspicious/noArrayIndexKey: stream-derived UI */

import {Array, Predicate} from 'effect'

import type {ConversationMessage, ToolResponse} from '@ai-toolkit/ai/schema'
import {BookOpenTextIcon, ClockIcon, HashIcon, InboxIcon, SparklesIcon, UserIcon} from 'lucide-react'

import {Attachment} from '#components/ai/attachment.tsx'
import {Error} from '#components/ai/error.tsx'
import {ReasoningDelta} from '#components/ai/reasoning-delta.tsx'
import {TextDelta} from '#components/ai/text-delta.tsx'
import {ToolInteraction} from '#components/ai/tool-interaction.tsx'
import {cn, formatDuration, formatRelativeTime, formatTokens} from '#lib/utils.ts'

export function Message(props: {message: ConversationMessage; onToolResponse?: (response: ToolResponse) => void}) {
	let theme = {bar: 'bg-muted-foreground/40', border: 'border-border', bg: ''}
	if (props.message.state === 'complete') {
		theme = {bar: 'bg-blue-500/60', border: 'border-blue-500/30', bg: 'bg-blue-500/1'}
	}
	if (props.message.role === 'user') {
		theme = {bar: 'bg-primary', border: 'border-primary/20', bg: 'bg-primary/1'}
	}
	if (props.message.state === 'error') {
		theme = {bar: 'bg-destructive/60', border: 'border-destructive/30', bg: ''}
	}
	if (props.message.parts.some(part => part._tag === 'tool' && part.state === 'pending-approval')) {
		theme = {bar: 'bg-violet-500/60', border: 'border-violet-500/30', bg: ''}
	}
	const duration = props.message.finishedAt ? formatDuration(props.message.finishedAt - props.message.startedAt) : null
	return (
		<article className="flex gap-2">
			<div className={cn('w-0.5 shrink-0', theme.bar)} />
			<div className="min-w-0 flex-1">
				<div className={cn('w-full border-2 px-3', theme.border, theme.bg)}>
					<div className="flex items-center gap-1.5 border-border/60 border-b py-2 font-mono text-[11px] text-muted-foreground leading-none">
						{props.message.role === 'user' ? (
							<UserIcon className="size-3 shrink-0 text-primary" />
						) : (
							<SparklesIcon className="size-3 shrink-0" />
						)}
						<span className="min-w-0 truncate">
							<span className="text-muted-foreground/50">{props.message.model.provider}/</span>
							<span>{props.message.model.model}</span>
						</span>
						<span className="ml-auto flex shrink-0 items-center gap-3">
							{props.message.role !== 'user' && props.message.usage.input > 0 && (
								<>
									<span className="flex items-center gap-1" title="Input tokens">
										<InboxIcon className="size-3 shrink-0" />
										{formatTokens(props.message.usage.input)}
									</span>
									<span className="flex items-center gap-1" title="Output tokens">
										<BookOpenTextIcon className="size-3 shrink-0" />
										{formatTokens(props.message.usage.output)}
									</span>
									{props.message.usage.reasoning > 0 && (
										<span className="flex items-center gap-1" title="Reasoning tokens">
											<HashIcon className="size-3 shrink-0" />
											{formatTokens(props.message.usage.reasoning)}
										</span>
									)}
								</>
							)}
							{props.message.role !== 'user' && Predicate.isNotNullish(duration) && duration !== '0ms' && (
								<span className="flex items-center gap-1 text-muted-foreground/40" title="Duration">
									<ClockIcon className="size-3 shrink-0" />
									{duration}
								</span>
							)}
							<span className="text-muted-foreground/40">{formatRelativeTime(props.message.startedAt)}</span>
						</span>
					</div>

					<div className="flex flex-col gap-2 py-2 text-[13px] leading-relaxed">
						{props.message.state === 'streaming' && Array.isReadonlyArrayEmpty(props.message.parts) ? (
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
							props.message.parts.map((part, index) => {
								if (part._tag === 'text') {
									return <TextDelta key={index} part={part} />
								}
								if (part._tag === 'reasoning') {
									return <ReasoningDelta key={index} part={part} />
								}
								if (part._tag === 'file') {
									return <Attachment key={index} part={part} />
								}
								if (part._tag === 'tool') {
									return <ToolInteraction key={index} part={part} onResponse={props.onToolResponse} />
								}
								return <Error key={index} part={part} />
							})
						)}
					</div>
				</div>
			</div>
		</article>
	)
}
