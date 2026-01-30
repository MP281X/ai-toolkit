import type { ToolResultSchema } from '@ai-toolkit/ai/schemas'
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card.tsx'

export function ToolResult(props: ToolResultSchema) {
	if (props.isError) {
		return (
			<Card size="sm">
				<CardHeader>
					<CardTitle>
						<span>{props.toolName} - Error</span>
						<span>{props.toolCallId.slice(0, 8)}</span>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<pre>{JSON.stringify(props.result, null, 2)}</pre>
				</CardContent>
			</Card>
		)
	}

	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>
					<span>{props.toolName} - Result</span>
					<span>{props.toolCallId.slice(0, 8)}</span>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<pre>{JSON.stringify(props.result, null, 2)}</pre>
			</CardContent>
		</Card>
	)
}
