import type {ReasoningPart} from '@ai-toolkit/ai/schema'

import {Markdown} from '#components/render/markdown.tsx'

export function ReasoningDelta(props: {part: ReasoningPart}) {
	return (
		<div className="border-muted-foreground/20 border-l-2 pl-3">
			<Markdown className="text-muted-foreground">{props.part.text}</Markdown>
		</div>
	)
}
