/** biome-ignore-all lint/suspicious/noArrayIndexKey: llm tokens */

import type {TextStreamPart, Usage} from '@ai-toolkit/ai'

import {Error} from '#components/ai/error.tsx'
import {Finish} from '#components/ai/finish.tsx'
import {Markdown} from '#components/ai/markdown.tsx'
import {ReasoningDelta} from '#components/ai/reasoning-delta.tsx'
import {ToolCall} from '#components/ai/tool-call.tsx'
import {ToolResult} from '#components/ai/tool-result.tsx'

export namespace AiStream {
	export type Props = {parts: TextStreamPart[]; usage?: Usage}
}

export function AiStream(props: AiStream.Props) {
	return (
		<div className="flex flex-col gap-2">
			{props.parts.map((part, index) => {
				switch (part._tag) {
					case 'text-delta':
						return <Markdown key={index}>{part.text}</Markdown>
					case 'reasoning-delta':
						return <ReasoningDelta key={index} {...part} />
					case 'tool-call':
						return <ToolCall key={index} {...part} />
					case 'tool-result':
						return <ToolResult key={index} {...part} />
					case 'tool-error':
						return <ToolResult key={index} {...part} />
					case 'error':
						return <Error key={index} {...part} />
					default:
						return null
				}
			})}
			{props.usage && <Finish usage={props.usage} />}
		</div>
	)
}
