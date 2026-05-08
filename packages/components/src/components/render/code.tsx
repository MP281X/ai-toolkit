import {highlightCode, resolveLanguage} from '#lib/shiki.ts'
import {cn} from '#lib/utils.ts'

export function Code(props: {readonly children: string; readonly lang: string; readonly className?: string}) {
	return (
		<div
			data-code-block
			// biome-ignore lint/security/noDangerouslySetInnerHtml: shiki html
			dangerouslySetInnerHTML={{__html: highlightCode(props.children, resolveLanguage(props.lang))}}
			className={cn('select-text overflow-hidden bg-muted/30 text-sm leading-relaxed', props.className)}
		/>
	)
}
