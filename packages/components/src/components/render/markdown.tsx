import {Array} from 'effect'

import {Marked} from 'marked'

import {cn} from '#lib/utils.ts'
import {Code} from './code.tsx'
import {Mermaid} from './mermaid.tsx'

const marked = new Marked({gfm: true, breaks: true, async: false})

export function Markdown(props: {readonly children: string; readonly className?: string}) {
	return (
		<div className={cn('markdown wrap-break-word select-text text-wrap text-[14px] leading-relaxed', props.className)}>
			{Array.map(marked.lexer(props.children), (token, index) => {
				// skip raw HTML block tokens
				if (token.type === 'html') return

				if (token.type !== 'code') {
					// biome-ignore lint/security/noDangerouslySetInnerHtml: markdown html
					return <div key={index} dangerouslySetInnerHTML={{__html: marked.parse(token.raw)}} />
				}

				if (token.lang === 'mermaid') {
					return (
						<Mermaid key={index} className="border border-border">
							{token.text}
						</Mermaid>
					)
				}

				return (
					<Code key={index} className="border border-border" lang={token.lang}>
						{token.text}
					</Code>
				)
			})}
		</div>
	)
}
