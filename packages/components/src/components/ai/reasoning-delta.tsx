import {Markdown} from '#components/render/markdown.tsx'

export function ReasoningDelta(props: {text: string}) {
	return <Markdown className="text-muted-foreground">{props.text}</Markdown>
}
