import DOMPurify from 'dompurify'

import {highlightCode} from '#lib/shiki.ts'
import {cn} from '#lib/utils.ts'

export function Code(props: {readonly children: string; readonly lang?: string; readonly className?: string}) {
	return (
		<div
			data-code-block
			dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(highlightCode({code: props.children, lang: props.lang}))}}
			className={cn('bg-muted/30 overflow-hidden select-text [&_*]:select-text', props.className)}
		/>
	)
}
