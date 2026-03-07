import type {TextPart} from '@ai-toolkit/ai/schema'

import {Markdown} from '#components/render/markdown.tsx'

export function TextDelta(props: {part: TextPart}) {
	return <Markdown>{props.part.text}</Markdown>
}
