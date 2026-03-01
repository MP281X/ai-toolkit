import type {ReasoningPart} from '@ai-toolkit/ai/schema'
import {BrainIcon, ChevronRightIcon} from 'lucide-react'

import {Markdown} from '#components/render/markdown.tsx'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '#components/ui/collapsible.tsx'

export function ReasoningDelta(props: ReasoningPart) {
	return (
		<Collapsible className="border border-border">
			<CollapsibleTrigger className="group/collapsible flex w-full items-center gap-1.5 bg-muted/40 px-3 py-1.5 text-[11px] uppercase leading-none tracking-wide">
				<ChevronRightIcon className="size-3 text-muted-foreground transition-transform group-aria-expanded/collapsible:rotate-90" />
				<BrainIcon className="size-3 text-muted-foreground" />
				<span className="text-foreground">Reasoning</span>
			</CollapsibleTrigger>
			<CollapsibleContent className="border-border border-t px-3 py-2">
				<Markdown className="text-muted-foreground">{props.text}</Markdown>
			</CollapsibleContent>
		</Collapsible>
	)
}
