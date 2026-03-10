import {Match, pipe} from 'effect'

import type {AgentResponse, ConversationMessage} from '@ai-toolkit/ai/schema'

import {Attachment} from '#components/ai/attachment.tsx'
import {ErrorMessage} from '#components/ai/error.tsx'
import {ReasoningDelta} from '#components/ai/reasoning-delta.tsx'
import {TextDelta} from '#components/ai/text-delta.tsx'
import {ToolInteraction} from '#components/ai/tool-interaction.tsx'
import {Badge} from '#components/ui/badge.tsx'
import {cn, formatDuration, formatRelativeTime, formatTokens} from '#lib/utils.ts'

const tone = (message: ConversationMessage) => {
	if (message.role === 'user') return 'border-primary/50'
	if (message.state === 'error') return 'border-red-500/60'
	if (message.state === 'awaiting-response') return 'border-violet-500/60'
	return 'border-blue-500/60'
}

export function Message(props: {message: ConversationMessage; onRespond?: (response: AgentResponse) => void}) {
	return (
		<div className={cn('border-l-2 bg-background px-3 py-3', tone(props.message))}>
			<div className="mb-2 flex items-center gap-2 text-xs">
				<Badge variant="outline">{props.message.role}</Badge>
				<Badge variant="ghost">{props.message.model.provider}</Badge>
				<Badge variant="ghost">{props.message.model.model}</Badge>
				<Badge variant="ghost">{props.message.state}</Badge>
				<span className="text-muted-foreground">{formatRelativeTime(props.message.startedAt)}</span>
				{props.message.finishedAt !== undefined && (
					<>
						<span className="text-muted-foreground">
							{formatDuration(props.message.finishedAt - props.message.startedAt)}
						</span>
						<span className="text-muted-foreground">
							{formatTokens(props.message.usage.input + props.message.usage.output + props.message.usage.reasoning)}{' '}
							tokens
						</span>
					</>
				)}
			</div>

			<div className="space-y-2">
				{props.message.parts.map(part =>
					pipe(
						Match.value(part),
						Match.tag('text', value => <TextDelta key={value.id} text={value.text} />),
						Match.tag('reasoning', value => <ReasoningDelta key={value.id} text={value.text} />),
						Match.tag('file', value => <Attachment key={value.id} file={value.file} />),
						Match.tag('question', value => <ToolInteraction key={value.id} part={value} onRespond={props.onRespond} />),
						Match.tag('websearch', value => (
							<ToolInteraction key={value.id} part={value} onRespond={props.onRespond} />
						)),
						Match.tag('error', value => <ErrorMessage key={value.id} error={value.error} />),
						Match.exhaustive
					)
				)}
			</div>
		</div>
	)
}
