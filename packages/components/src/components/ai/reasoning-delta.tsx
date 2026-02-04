import type {ReasoningDelta as ReasoningDeltaSchema} from '@ai-toolkit/ai'
import {BrainIcon, ChevronRightIcon} from 'lucide-react'

import {Markdown} from '#components/ai/markdown.tsx'

export function ReasoningDelta(props: ReasoningDeltaSchema) {
	return (
		<details className="group border-muted-foreground/30 border-l-2 pl-3">
			<summary className="flex w-full list-none items-center gap-1.5 py-1.5 text-left text-[11px] text-muted-foreground uppercase leading-none tracking-wide [&::-webkit-details-marker]:hidden [&::marker]:hidden">
				<ChevronRightIcon className="size-3 transition-transform group-open:rotate-90" />
				<BrainIcon className="size-3" />
				<span>Reasoning</span>
			</summary>
			<Markdown className="text-muted-foreground">{props.text}</Markdown>
		</details>
	)
}
