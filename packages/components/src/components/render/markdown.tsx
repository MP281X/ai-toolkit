import {Array} from 'effect'

import {Marked} from 'marked'

import {Code} from './code.tsx'
import {Mermaid} from './mermaid.tsx'

import {cn} from '#lib/utils.ts'

const marked = new Marked({async: false, breaks: true, gfm: true})

export function Markdown(props: {readonly children: string; readonly className?: string}) {
	return (
		<div className={cn('markdown text-wrap wrap-break-word select-text', props.className)}>
			{Array.map(marked.lexer(props.children), (token, index) => {
				// Skip raw HTML block tokens
				if (token.type === 'html') return

				if (token.type !== 'code') {
					return <div key={index} dangerouslySetInnerHTML={{__html: marked.parse(token.raw)}} />
				}

				if (token.lang === 'mermaid') {
					return (
						<Mermaid key={index} className="border-border border">
							{token.text}
						</Mermaid>
					)
				}

				return (
					<Code key={index} className="border-border border" lang={token.lang}>
						{token.text}
					</Code>
				)
			})}
		</div>
	)
}
