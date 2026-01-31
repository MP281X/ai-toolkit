import type {ReasoningDeltaSchema} from '@ai-toolkit/ai/schemas'

import {Markdown} from '#components/ai/markdown.tsx'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '#components/ui/collapsible.tsx'

export function ReasoningDelta(props: ReasoningDeltaSchema) {
	return (
		<div>
			<Collapsible defaultOpen={true}>
				<CollapsibleTrigger>
					<span>Reasoning</span>
					<span>▼</span>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<Markdown>{props.text}</Markdown>
				</CollapsibleContent>
			</Collapsible>
		</div>
	)
}
