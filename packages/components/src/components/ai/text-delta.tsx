import type {TextPart} from '@ai-toolkit/ai/schema'

export function TextDelta(props: TextPart) {
	return <span className="whitespace-pre-wrap">{props.text}</span>
}
