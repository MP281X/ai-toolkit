import type {TextDelta as TextDeltaSchema} from '@ai-toolkit/ai'

export function TextDelta(props: TextDeltaSchema) {
	return <span className="whitespace-pre-wrap">{props.text}</span>
}
