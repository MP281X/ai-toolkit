import {Match} from 'effect'

import {SiGnubash, SiMarkdown, SiReact} from '@icons-pack/react-simple-icons'
import {Braces, File} from 'lucide-react'

import {resolveLanguage} from '#lib/shiki.ts'
import {cn} from '#lib/utils.ts'

export * from '@icons-pack/react-simple-icons'
export * from 'lucide-react'

export function FileIcon(props: {filePath: string; className?: string}) {
	return Match.value(resolveLanguage(props.filePath)).pipe(
		Match.when('shell', () => <SiGnubash className={cn('size-3.5 shrink-0', props.className)} />),
		Match.when('markdown', () => <SiMarkdown className={cn('size-3.5 shrink-0', props.className)} />),
		Match.when('tsx', () => <SiReact className={cn('size-3.5 shrink-0 text-sky-400', props.className)} />),
		Match.when('jsonc', () => <Braces className={cn('size-3.5 shrink-0 text-amber-500', props.className)} />),
		Match.when('text', () => <File className={cn('size-3.5 shrink-0 text-muted-foreground', props.className)} />),
		Match.exhaustive
	)
}
