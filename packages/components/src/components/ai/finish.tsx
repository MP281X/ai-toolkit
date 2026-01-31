import {Predicate} from 'effect'

import type {FinishSchema} from '@ai-toolkit/ai/schemas'

import {Badge} from '#components/ui/badge.tsx'
import {formatTokens} from '#lib/utils.ts'

export function Finish(props: FinishSchema) {
	return (
		<div>
			<div>
				{props.status === 'success' && <Badge variant="default">{props.status.toUpperCase()}</Badge>}
				{props.status === 'error' && <Badge variant="destructive">{props.status.toUpperCase()}</Badge>}
				{props.status === 'cancelled' && <Badge variant="outline">{props.status.toUpperCase()}</Badge>}
				{props.status === 'incomplete' && <Badge variant="secondary">{props.status.toUpperCase()}</Badge>}
				<span>{props.reason}</span>
			</div>
			<div>
				{Predicate.isNotNullable(props.usage.inputTokens) && <span>in: {formatTokens(props.usage.inputTokens)}</span>}
				{Predicate.isNotNullable(props.usage.outputTokens) && (
					<span>out: {formatTokens(props.usage.outputTokens)}</span>
				)}
				{Predicate.isNotNullable(props.usage.reasoningTokens) && (
					<span>reasoning: {formatTokens(props.usage.reasoningTokens)}</span>
				)}
				{Predicate.isNotNullable(props.usage.cacheReadTokens) && (
					<span>cache read: {formatTokens(props.usage.cacheReadTokens)}</span>
				)}
				{Predicate.isNotNullable(props.usage.cacheWriteTokens) && (
					<span>cache write: {formatTokens(props.usage.cacheWriteTokens)}</span>
				)}
				{Predicate.isNotNullable(props.usage.totalTokens) && (
					<span>total: {formatTokens(props.usage.totalTokens)}</span>
				)}
			</div>
		</div>
	)
}
