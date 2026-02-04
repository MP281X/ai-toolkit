import {Match, Predicate} from 'effect'

import type {Finish as FinishSchema} from '@ai-toolkit/ai'

import {Badge} from '#components/ui/badge.tsx'
import {Separator} from '#components/ui/separator.tsx'
import {formatTokens} from '#lib/utils.ts'

export function Finish(props: FinishSchema) {
	const badgeVariant = Match.value(props.finishReason).pipe(
		Match.when('stop', () => 'default' as const),
		Match.when('error', () => 'destructive' as const),
		Match.orElse(() => 'secondary' as const)
	)

	return (
		<div className="mt-4 flex flex-wrap items-center gap-2 border-border border-t pt-3">
			<Badge variant={badgeVariant} className="uppercase">
				{props.finishReason}
			</Badge>
			<Separator orientation="vertical" className="h-3" />
			{Predicate.isNotNullable(props.totalUsage.inputTokens) && (
				<span className="font-mono text-[10px] text-muted-foreground">
					in:{formatTokens(props.totalUsage.inputTokens)}
				</span>
			)}
			{Predicate.isNotNullable(props.totalUsage.outputTokens) && (
				<span className="font-mono text-[10px] text-muted-foreground">
					out:{formatTokens(props.totalUsage.outputTokens)}
				</span>
			)}
			{Predicate.isNotNullable(props.totalUsage.outputTokenDetails?.reasoningTokens) && (
				<span className="font-mono text-[10px] text-muted-foreground">
					reasoning:{formatTokens(props.totalUsage.outputTokenDetails.reasoningTokens)}
				</span>
			)}
			{Predicate.isNotNullable(props.totalUsage.inputTokenDetails?.cacheReadTokens) && (
				<span className="font-mono text-[10px] text-muted-foreground">
					cache-r:{formatTokens(props.totalUsage.inputTokenDetails.cacheReadTokens)}
				</span>
			)}
			{Predicate.isNotNullable(props.totalUsage.inputTokenDetails?.cacheWriteTokens) && (
				<span className="font-mono text-[10px] text-muted-foreground">
					cache-w:{formatTokens(props.totalUsage.inputTokenDetails.cacheWriteTokens)}
				</span>
			)}
			{Predicate.isNotNullable(props.totalUsage.totalTokens) && (
				<span className="font-mono text-[10px] text-muted-foreground">
					total:{formatTokens(props.totalUsage.totalTokens)}
				</span>
			)}
		</div>
	)
}
