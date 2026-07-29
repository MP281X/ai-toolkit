import DOMPurify from 'dompurify'

import {highlightCode} from '#lib/shiki.ts'
import {cn} from '#lib/utils.ts'

export function Code(props: {
	readonly children: string
	readonly className?: string
	readonly lang?: string | undefined
}) {
	return (
		<div
			data-code-block
			dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(highlightCode(props.children, props.lang))}}
			className={cn('bg-muted/30 overflow-hidden select-text [&_*]:select-text', props.className)}
		/>
	)
}
