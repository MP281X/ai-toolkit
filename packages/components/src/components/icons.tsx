import {Match, pipe} from 'effect'

import {Braces, File, Loader2Icon, OctagonXIcon, TriangleAlertIcon} from 'lucide-react'

import {resolveLanguage} from '#lib/shiki.ts'
import {cn} from '#lib/utils.ts'
import {BashDark} from './ui/svgs/bashDark.tsx'
import {CodexDark} from './ui/svgs/codexDark.tsx'
import {EffectDark} from './ui/svgs/effectDark.tsx'
import {MarkdownDark} from './ui/svgs/markdownDark.tsx'
import {OpenaiDark} from './ui/svgs/openaiDark.tsx'
import {OpencodeDark} from './ui/svgs/opencodeDark.tsx'
import {OpenrouterDark} from './ui/svgs/openrouterDark.tsx'
import {ReactDark} from './ui/svgs/reactDark.tsx'

export * from 'lucide-react'

export function AgentIcon(props: {layer: 'codex' | 'effect'; className?: string}) {
	return pipe(
		Match.value(props.layer),
		Match.when('codex', () => <CodexDark className={cn('size-3.5 shrink-0', props.className)} />),
		Match.when('effect', () => <EffectDark className={cn('size-3.5 shrink-0', props.className)} />),
		Match.exhaustive
	)
}

export function StatusIcon(props: {
	state: 'idle' | 'running' | 'retrying' | 'stopping' | 'awaiting_input' | 'error'
	className?: string
}) {
	return pipe(
		Match.value(props.state),
		Match.when('idle', () => undefined),
		Match.when('running', () => <Loader2Icon className={cn('size-3 animate-spin text-blue-500', props.className)} />),
		Match.when('error', () => <OctagonXIcon className={cn('size-3 text-destructive', props.className)} />),
		Match.orElse(() => <TriangleAlertIcon className={cn('size-3 text-amber-500', props.className)} />)
	)
}

export function ProviderIcon(props: {provider: 'openai' | 'opencode-go' | 'openrouter'; className?: string}) {
	return pipe(
		Match.value(props.provider),
		Match.when('openai', () => <OpenaiDark className={cn('size-3.5 shrink-0', props.className)} />),
		Match.when('opencode-go', () => <OpencodeDark className={cn('size-3.5 shrink-0', props.className)} />),
		Match.when('openrouter', () => <OpenrouterDark className={cn('size-3.5 shrink-0', props.className)} />),
		Match.exhaustive
	)
}

export function FileIcon(props: {filePath: string; className?: string}) {
	return pipe(
		Match.value(resolveLanguage(props.filePath)),
		Match.when('shell', () => <BashDark className={cn('size-3.5 shrink-0', props.className)} />),
		Match.when('markdown', () => <MarkdownDark className={cn('size-3.5 shrink-0', props.className)} />),
		Match.when('tsx', () => <ReactDark className={cn('size-3.5 shrink-0 text-sky-400', props.className)} />),
		Match.when('jsonc', () => <Braces className={cn('size-3.5 shrink-0 text-amber-500', props.className)} />),
		Match.when('text', () => <File className={cn('size-3.5 shrink-0 text-muted-foreground', props.className)} />),
		Match.exhaustive
	)
}
