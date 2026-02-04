import {Predicate} from 'effect'

import type {Finish as FinishSchema} from '@ai-toolkit/ai'
import {BookOpenTextIcon, CpuIcon, DatabaseIcon, HashIcon, InboxIcon, PackageIcon} from 'lucide-react'

import {formatTokens} from '#lib/utils.ts'

export function Finish(props: FinishSchema) {
	const tokenItems = [
		{key: 'input', value: props.totalUsage.inputTokens, icon: InboxIcon},
		{key: 'output', value: props.totalUsage.outputTokens, icon: BookOpenTextIcon},
		{key: 'reasoning', value: props.totalUsage.outputTokenDetails?.reasoningTokens, icon: CpuIcon},
		{key: 'cache-r', value: props.totalUsage.inputTokenDetails?.cacheReadTokens, icon: DatabaseIcon},
		{key: 'cache-w', value: props.totalUsage.inputTokenDetails?.cacheWriteTokens, icon: PackageIcon},
		{key: 'total', value: props.totalUsage.totalTokens, icon: HashIcon}
	]

	return (
		<div className="flex flex-wrap items-center gap-1.5 border-border/60 border-t py-2 text-[11px] text-muted-foreground leading-none">
			{tokenItems
				.filter(item => Predicate.isNotNullable(item.value))
				.map(item => {
					const Icon = item.icon
					return (
						<span key={item.key} className="inline-flex items-center gap-1 font-mono">
							<Icon className="size-3" />
							{formatTokens(item.value ?? 0)}
						</span>
					)
				})}
		</div>
	)
}
