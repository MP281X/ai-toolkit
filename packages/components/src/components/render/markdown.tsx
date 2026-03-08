import {Marked} from 'marked'

import {resolveLanguage} from '#lib/shiki.ts'
import {cn} from '#lib/utils.ts'
import {Code} from './code.tsx'

const marked = new Marked({gfm: true, breaks: true, async: false})

function Inline(props: {content: string}) {
	const html = marked.parse(props.content)

	// biome-ignore lint/security/noDangerouslySetInnerHtml: markdown rendering requires innerHTML
	return <div dangerouslySetInnerHTML={{__html: html}} />
}

export function Markdown(props: {children: string; className?: string}) {
	const tokens = marked.lexer(props.children)

	return (
		<div className={cn('markdown wrap-break-word select-text text-wrap text-[12px] leading-relaxed', props.className)}>
			{tokens.map((token, index) => {
				// skip raw HTML block tokens
				if (token.type === 'html') return null

				// biome-ignore lint/suspicious/noArrayIndexKey: markdown
				if (token.type !== 'code') return <Inline key={index} content={token.raw} />

				return (
					<Code
						// biome-ignore lint/suspicious/noArrayIndexKey: markdown
						key={index}
						code={token.text}
						className="border border-border"
						lang={resolveLanguage(token.lang)}
					/>
				)
			})}
		</div>
	)
}
