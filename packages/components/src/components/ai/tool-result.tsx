import type {ToolError, ToolResult as ToolResultSchema} from '@ai-toolkit/ai/schema'
import {AlertTriangleIcon, CheckCircleIcon, ChevronRightIcon} from 'lucide-react'

import {cn, formatError} from '#lib/utils.ts'

export function ToolResult(props: ToolResultSchema | ToolError) {
	const isError = props._tag === 'tool-error'
	const StatusIcon = isError ? AlertTriangleIcon : CheckCircleIcon

	return (
		<details className={cn('group border', isError ? 'border-destructive/50' : 'border-border')}>
			<summary
				className={cn(
					'flex w-full list-none items-center gap-1.5 px-3 py-1.5 text-left font-medium text-[11px] uppercase leading-none tracking-wide [&::-webkit-details-marker]:hidden [&::marker]:hidden',
					isError ? 'bg-destructive/10 text-destructive' : 'bg-muted/40 text-foreground'
				)}
			>
				<ChevronRightIcon
					className={cn(
						'size-3 -translate-y-px transition-transform group-open:rotate-90',
						isError ? 'text-destructive' : 'text-muted-foreground'
					)}
				/>
				<StatusIcon className={cn('size-3 -translate-y-px', isError ? 'text-destructive' : 'text-muted-foreground')} />
				<span>{props.toolName}</span>
			</summary>
			<pre
				className={cn(
					'overflow-x-auto border-t px-3 py-1.5 font-mono text-[11px] leading-snug',
					isError ? 'border-destructive/50 text-destructive/80' : 'border-border text-muted-foreground'
				)}
			>
				{isError ? formatError(props.error) : formatError(props.output)}
			</pre>
		</details>
	)
}
