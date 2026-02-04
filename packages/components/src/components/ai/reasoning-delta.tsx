import type {TextStreamPart} from '@ai-toolkit/ai'

import {Markdown} from '#components/ai/markdown.tsx'
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from '#components/ui/accordion.tsx'

export function ReasoningDelta(props: Extract<TextStreamPart<never>, {type: 'reasoning-delta'}>) {
	return (
		<Accordion className="border-muted-foreground/30 border-l-2 pl-3">
			<AccordionItem value="reasoning" className="border-none">
				<AccordionTrigger className="py-1 text-muted-foreground uppercase tracking-wide hover:no-underline">
					Reasoning
				</AccordionTrigger>
				<AccordionContent>
					<Markdown className="text-muted-foreground">{props.text}</Markdown>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	)
}
