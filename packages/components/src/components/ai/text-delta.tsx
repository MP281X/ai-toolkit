import type {TextStreamPart} from '@ai-toolkit/ai'

export function TextDelta(props: Extract<TextStreamPart<never>, {type: 'text-delta'}>) {
	return <span className="whitespace-pre-wrap">{props.text}</span>
}
