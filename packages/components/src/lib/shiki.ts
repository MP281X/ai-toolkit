import {Array, Match, Option, String, pipe} from 'effect'

export function resolveLanguage(lang?: string) {
	return pipe(
		Match.value(
			pipe(
				String.toLowerCase(lang ?? ''),
				String.split('.'),
				Array.last,
				Option.getOrElse(() => '')
			)
		),
		Match.when(Match.is('ts', 'tsx', 'js', 'jsx', 'javascript', 'typescript'), () => 'tsx' as const),
		Match.when(Match.is('sh', 'bash', 'zsh', 'shell'), () => 'shell' as const),
		Match.when(Match.is('md', 'markdown'), () => 'markdown' as const),
		Match.when(Match.is('json', 'jsonc', 'json5', 'lock'), () => 'jsonc' as const),
		Match.orElse(() => 'text' as const)
	)
}
