import {flow, Match} from 'effect'

import {getSharedHighlighter} from '@pierre/diffs'

export const HIGHLIGHT_THEMES = {light: 'github-light-default', dark: 'github-dark-default'} as const
export const HIGHLIGHT_LANGS = ['tsx', 'shell', 'markdown', 'diff'] as const

const highlighter = await getSharedHighlighter({
	themes: [HIGHLIGHT_THEMES.light, HIGHLIGHT_THEMES.dark],
	langs: [...HIGHLIGHT_LANGS]
})

export const resolveLanguage = flow(
	(lang?: string) => Match.value(lang?.toLowerCase().split('.').pop()),
	Match.when(Match.is('ts', 'tsx', 'js', 'jsx', 'javascript', 'typescript'), () => 'tsx' as const),
	Match.when(Match.is('sh', 'bash', 'zsh', 'shell'), () => 'shell' as const),
	Match.when(Match.is('md', 'markdown'), () => 'markdown' as const),
	Match.orElse(() => 'text' as const)
)

export function highlightCode(code: string, lang?: string) {
	return highlighter.codeToHtml(code, {
		lang: resolveLanguage(lang),
		themes: HIGHLIGHT_THEMES,
		defaultColor: false
	})
}
