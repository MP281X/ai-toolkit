import {flow, Match} from 'effect'

import {createHighlighterCore} from 'shiki/core'
import {createOnigurumaEngine} from 'shiki/engine/oniguruma'

export const highlighter = await createHighlighterCore({
	themes: [import('shiki/themes/github-light-default.mjs'), import('shiki/themes/github-dark-default.mjs')],
	langs: [import('shiki/langs/tsx.mjs'), import('shiki/langs/shell.mjs'), import('shiki/langs/markdown.mjs')],
	engine: createOnigurumaEngine(import('shiki/wasm'))
})

export const resolveLanguage = flow(
	(lang?: string) => Match.value(lang?.toLowerCase().split('.').pop()),
	Match.when(Match.is('ts', 'tsx', 'js', 'jsx', 'javascript', 'typescript'), () => 'tsx'),
	Match.when(Match.is('sh', 'bash', 'zsh', 'shell'), () => 'shell'),
	Match.when(Match.is('md', 'markdown'), () => 'markdown'),
	Match.orElse(() => 'text')
)

export function highlightCode(code: string, lang?: string) {
	return highlighter.codeToHtml(code, {
		lang: resolveLanguage(lang),
		themes: {light: 'github-light-default', dark: 'github-dark-default'},
		defaultColor: false
	})
}
