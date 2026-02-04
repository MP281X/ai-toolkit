import type {TextStreamPart} from '@ai-toolkit/ai'

import {Badge} from '#components/ui/badge.tsx'
import {Separator} from '#components/ui/separator.tsx'

export function ToolCall(props: Extract<TextStreamPart<never>, {type: 'tool-call'}>) {
	return (
		<div className="my-2 border border-border">
			<div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5">
				<span className="font-medium text-xs uppercase tracking-wide">{props.toolName}</span>
				<Separator orientation="vertical" className="h-3" />
				<Badge variant="outline" className="font-mono text-[10px]">
					{props.toolCallId.slice(0, 8)}
				</Badge>
			</div>
			<pre className="overflow-x-auto p-3 font-mono text-[11px] text-muted-foreground leading-relaxed">
				{JSON.stringify(props.input, null, 2)}
			</pre>
		</div>
	)
}
