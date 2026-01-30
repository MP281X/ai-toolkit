/** biome-ignore-all lint/suspicious/noArrayIndexKey: llm tokens */

import type { AiParts } from '@ai-toolkit/ai/schemas'
import { Error } from '#components/ai/error.tsx'
import { Finish } from '#components/ai/finish.tsx'
import { Markdown } from '#components/ai/markdown.tsx'
import { ReasoningDelta } from '#components/ai/reasoning-delta.tsx'
import { ToolCall } from '#components/ai/tool-call.tsx'
import { ToolResult } from '#components/ai/tool-result.tsx'

export namespace AiStream {
	export type Props = { parts: AiParts[] }
}

export function AiStream(props: { parts: AiParts[] }) {
	return props.parts.map((part, index) => {
		switch (part._tag) {
			case 'TextDeltaSchema':
				return <Markdown key={index}>{part.text}</Markdown>
			case 'ReasoningDeltaSchema':
				return <ReasoningDelta key={index} {...part} />
			case 'ToolCallSchema':
				return <ToolCall key={index} {...part} />
			case 'ToolResultSchema':
				return <ToolResult key={index} {...part} />
			case 'FinishSchema':
				return <Finish key={index} {...part} />
			case 'ErrorSchema':
				return <Error key={index} {...part} />
			default:
				return null
		}
	})
}
