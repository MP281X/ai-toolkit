import type {ToolError, ToolResult as ToolResultSchema} from '@ai-toolkit/ai'
import {AlertTriangleIcon, CheckCircleIcon, ChevronRightIcon} from 'lucide-react'

import {Badge} from '#components/ui/badge.tsx'

export function ToolResult(props: ToolResultSchema | ToolError) {
	const isError = props._tag === 'tool-error'
	const StatusIcon = isError ? AlertTriangleIcon : CheckCircleIcon

	return (
		<details className={`group border ${isError ? 'border-destructive/50' : 'border-border'}`}>
			<summary
				className={`flex w-full list-none items-center gap-1.5 px-3 py-1.5 text-left font-medium text-[11px] uppercase leading-none tracking-wide [&::-webkit-details-marker]:hidden [&::marker]:hidden ${
					isError ? 'bg-destructive/10 text-destructive' : 'bg-muted/40 text-foreground'
				}`}
			>
				<ChevronRightIcon
					className={`size-3 transition-transform group-open:rotate-90 ${
						isError ? 'text-destructive' : 'text-muted-foreground'
					}`}
				/>
				<StatusIcon className={`size-3 ${isError ? 'text-destructive' : 'text-muted-foreground'}`} />
				<span>{props.toolName}</span>
				<Badge variant={isError ? 'destructive' : 'outline'} className="ml-auto font-mono text-[10px]">
					{props.toolCallId.slice(0, 8)}
				</Badge>
			</summary>
			<pre
				className={`overflow-x-auto border-t px-3 py-1.5 font-mono text-[11px] leading-snug ${
					isError ? 'border-destructive/50 text-destructive/80' : 'border-border text-muted-foreground'
				}`}
			>
				{JSON.stringify(isError ? props.error : (props as ToolResultSchema).output, null, 2)}
			</pre>
		</details>
	)
}
