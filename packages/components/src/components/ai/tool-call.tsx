import type {ToolCall as ToolCallSchema} from '@ai-toolkit/ai/schema'
import {ChevronRightIcon, WrenchIcon} from 'lucide-react'

export function ToolCall(props: ToolCallSchema) {
	return (
		<details className="group border border-border">
			<summary className="flex w-full list-none items-center gap-1.5 bg-muted/40 px-3 py-1.5 text-left font-medium text-[11px] uppercase leading-none tracking-wide [&::-webkit-details-marker]:hidden [&::marker]:hidden">
				<ChevronRightIcon className="size-3 -translate-y-px text-muted-foreground transition-transform group-open:rotate-90" />
				<WrenchIcon className="size-3 -translate-y-px text-muted-foreground" />
				<span className="text-foreground">{props.toolName}</span>
			</summary>
			<pre className="overflow-x-auto border-border border-t px-3 py-1.5 font-mono text-[11px] text-muted-foreground leading-snug">
				{JSON.stringify(props.input, null, 2)}
			</pre>
		</details>
	)
}
