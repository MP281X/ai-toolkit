import type {TextDelta as TextDeltaSchema} from '@ai-toolkit/ai/schema'

export function TextDelta(props: TextDeltaSchema) {
	return <span className="whitespace-pre-wrap">{props.text}</span>
}
