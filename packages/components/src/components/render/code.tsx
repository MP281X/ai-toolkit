import DOMPurify from 'dompurify'

import {highlightCode} from '#lib/shiki.ts'
import {cn} from '#lib/utils.ts'

export function Code(props: {children: string; className?: string; lang?: string}) {
	return (
		<div
			data-code-block
			// Shiki output is sanitized immediately before this React HTML boundary.
			// oxlint-disable-next-line react/no-danger
			dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(highlightCode(props.children, props.lang))}}
			className={cn('bg-muted/30 overflow-hidden select-text [&_*]:select-text', props.className)}
		/>
	)
}
