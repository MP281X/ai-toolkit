import {Marked} from 'marked'

import {highlightCode, resolveLanguage} from '#lib/shiki.ts'
import {cn} from '#lib/utils.ts'

const marked = new Marked({gfm: true, breaks: true, async: false})

function Code(props: {code: string; lang?: string}) {
	const html = highlightCode(props.code, resolveLanguage(props.lang))

	return (
		<div
			data-code-block
			// biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output
			dangerouslySetInnerHTML={{__html: html}}
			className="overflow-hidden border bg-muted/30 font-mono text-[11px] leading-relaxed"
		/>
	)
}

function Inline(props: {content: string}) {
	const html = marked.parse(props.content)

	// biome-ignore lint/security/noDangerouslySetInnerHtml: markdown rendering requires innerHTML
	return <div dangerouslySetInnerHTML={{__html: html}} />
}

export function Markdown(props: {children: string; className?: string}) {
	const tokens = marked.lexer(props.children)

	return (
		<div className={cn('markdown wrap-break-word select-text text-wrap text-[13px] leading-relaxed', props.className)}>
			{tokens.map((token, index) => {
				// biome-ignore lint/suspicious/noArrayIndexKey: markdown
				if (token.type === 'code') return <Code key={index} code={token.text} lang={resolveLanguage(token.lang)} />

				// skip raw HTML block tokens
				if (token.type === 'html') return null

				// biome-ignore lint/suspicious/noArrayIndexKey: markdown
				return <Inline key={index} content={token.raw} />
			})}
		</div>
	)
}
