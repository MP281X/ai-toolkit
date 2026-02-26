import type {TextPart as TextDeltaPart} from '@ai-toolkit/ai/schema'

export function TextDelta(props: TextDeltaPart) {
	return <span className="whitespace-pre-wrap">{props.text}</span>
}
