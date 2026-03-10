import {Markdown} from '#components/render/markdown.tsx'

export function TextDelta(props: {text: string}) {
	return <Markdown>{props.text}</Markdown>
}
