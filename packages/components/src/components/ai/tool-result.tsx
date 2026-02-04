import type {ToolError, ToolResult as ToolResultSchema} from '@ai-toolkit/ai'

import {Badge} from '#components/ui/badge.tsx'
import {Separator} from '#components/ui/separator.tsx'

export function ToolResult(props: ToolResultSchema | ToolError) {
	const isError = props._tag === 'tool-error'

	return (
		<div className={`my-2 border ${isError ? 'border-destructive/50' : 'border-border'}`}>
			<div className={`flex items-center gap-2 px-3 py-1.5 ${isError ? 'bg-destructive/10' : 'bg-muted/30'}`}>
				<span className={`font-medium text-xs uppercase tracking-wide ${isError ? 'text-destructive' : ''}`}>
					{props.toolName}
				</span>
				<Separator orientation="vertical" className={`h-3 ${isError ? 'bg-destructive/30' : ''}`} />
				<span className={`text-[10px] uppercase ${isError ? 'text-destructive' : 'text-muted-foreground'}`}>
					{isError ? 'Error' : 'Result'}
				</span>
				<Badge variant={isError ? 'destructive' : 'outline'} className="ml-auto font-mono text-[10px]">
					{props.toolCallId.slice(0, 8)}
				</Badge>
			</div>
			<pre
				className={`overflow-x-auto p-3 font-mono text-[11px] leading-relaxed ${isError ? 'text-destructive/80' : 'text-muted-foreground'}`}
			>
				{JSON.stringify(isError ? props.error : (props as ToolResultSchema).output, null, 2)}
			</pre>
		</div>
	)
}
