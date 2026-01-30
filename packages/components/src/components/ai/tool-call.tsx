import type { ToolCallSchema } from '@ai-toolkit/ai/schemas'
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card.tsx'

export function ToolCall(props: ToolCallSchema) {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>
					<span>{props.toolName}</span>
					<span>{props.toolCallId.slice(0, 8)}</span>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<pre>{JSON.stringify(props.args, null, 2)}</pre>
			</CardContent>
		</Card>
	)
}
