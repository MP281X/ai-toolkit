import {highlightCode, resolveLanguage} from '#lib/shiki.ts'
import {cn} from '#lib/utils.ts'

export function Code(props: {readonly children: string; readonly lang: string; readonly className?: string}) {
	return (
		<div
			data-code-block
			dangerouslySetInnerHTML={{__html: highlightCode(props.children, resolveLanguage(props.lang))}}
			className={cn('bg-muted/30 overflow-hidden text-sm leading-relaxed select-text', props.className)}
		/>
	)
}
