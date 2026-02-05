import {Predicate} from 'effect'

import type {Usage} from '@ai-toolkit/ai'
import {BookOpenTextIcon, HashIcon, InboxIcon} from 'lucide-react'

import {formatTokens} from '#lib/utils.ts'

export namespace Finish {
	export type Props = {usage: Usage}
}

export function Finish(props: Finish.Props) {
	const tokenItems = [
		{key: 'input', value: props.usage.inputTokens, icon: InboxIcon},
		{key: 'output', value: props.usage.outputTokens, icon: BookOpenTextIcon},
		{key: 'total', value: props.usage.totalTokens, icon: HashIcon}
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
