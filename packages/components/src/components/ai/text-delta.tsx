import type { TextDeltaSchema } from '@ai-toolkit/ai/schemas'

export function TextDelta(props: TextDeltaSchema) {
	return <div>{props.text}</div>
}
