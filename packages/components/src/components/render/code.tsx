import {highlightCode, resolveLanguage} from '#lib/shiki.ts'
import {cn} from '#lib/utils.ts'

export function Code(props: {code: string; lang: string; className?: string}) {
	const html = highlightCode(props.code, resolveLanguage(props.lang))

	return (
		<div
			data-code-block
			// biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output
			dangerouslySetInnerHTML={{__html: html}}
			className={cn(
				'select-text overflow-hidden border border-border bg-muted/30 font-mono text-[11px] leading-relaxed',
				props.className
			)}
		/>
	)
}
