import {Predicate} from 'effect'

import type {ToolErrorPart} from '@ai-toolkit/ai/schema'
import {AlertTriangleIcon, ChevronRightIcon} from 'lucide-react'

import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '#components/ui/collapsible.tsx'
import {formatError} from '#lib/utils.ts'

export function ToolError(props: ToolErrorPart) {
	const content = Predicate.isNotNullish(props.error) ? formatError(props.error) : undefined

	if (Predicate.isUndefined(content)) {
		return (
			<div className="flex items-center gap-1.5 border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive uppercase leading-none tracking-wide">
				<AlertTriangleIcon className="size-3 text-destructive" />
				<span>{props.toolName}</span>
			</div>
		)
	}

	return (
		<Collapsible className="border border-destructive/50">
			<CollapsibleTrigger className="group/collapsible flex w-full items-center gap-1.5 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive uppercase leading-none tracking-wide">
				<ChevronRightIcon className="size-3 text-destructive transition-transform group-aria-expanded/collapsible:rotate-90" />
				<AlertTriangleIcon className="size-3 text-destructive" />
				<span>{props.toolName}</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<pre className="overflow-x-auto border-destructive/50 border-t px-3 py-1.5 font-mono text-[11px] text-destructive/80 leading-snug">
					{content}
				</pre>
			</CollapsibleContent>
		</Collapsible>
	)
}
