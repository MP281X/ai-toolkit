import {Predicate} from 'effect'

import type {ToolResultPart} from '@ai-toolkit/ai/schema'
import {CheckCircleIcon, ChevronRightIcon} from 'lucide-react'

import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '#components/ui/collapsible.tsx'

export function ToolResult(props: ToolResultPart) {
	const content = Predicate.isNotNullish(props.output)
		? (JSON.stringify(props.output, null, 2) ?? `${props.output}`)
		: undefined

	if (Predicate.isUndefined(content)) {
		return (
			<div className="flex items-center gap-1.5 border border-border bg-muted/40 px-3 py-1.5 text-[11px] uppercase leading-none tracking-wide">
				<CheckCircleIcon className="size-3 text-muted-foreground" />
				<span className="text-foreground">{props.toolName}</span>
			</div>
		)
	}

	return (
		<Collapsible className="border border-border">
			<CollapsibleTrigger className="group/collapsible flex w-full items-center gap-1.5 bg-muted/40 px-3 py-1.5 text-[11px] text-foreground uppercase leading-none tracking-wide">
				<ChevronRightIcon className="size-3 text-muted-foreground transition-transform group-aria-expanded/collapsible:rotate-90" />
				<CheckCircleIcon className="size-3 text-muted-foreground" />
				<span>{props.toolName}</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<pre className="overflow-x-auto border-border border-t px-3 py-1.5 font-mono text-[11px] text-muted-foreground leading-snug">
					{content}
				</pre>
			</CollapsibleContent>
		</Collapsible>
	)
}
