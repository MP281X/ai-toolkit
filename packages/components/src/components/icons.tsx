import {Function, Match, pipe} from 'effect'

import {Braces, CirclePauseIcon, CircleIcon, File, Loader2Icon, OctagonXIcon, TriangleAlertIcon} from 'lucide-react'

import {BashDark} from './svgs/bashDark.tsx'
import {ClaudeDark} from './svgs/claudeDark.tsx'
import {CodexDark} from './svgs/codexDark.tsx'
import {EffectDark} from './svgs/effectDark.tsx'
import {MarkdownDark} from './svgs/markdownDark.tsx'
import {OpenaiDark} from './svgs/openaiDark.tsx'
import {OpencodeDark} from './svgs/opencodeDark.tsx'
import {OpenrouterDark} from './svgs/openrouterDark.tsx'
import {PiDark} from './svgs/pi.tsx'
import {ReactDark} from './svgs/reactDark.tsx'

import {resolveLanguage} from '#lib/shiki.ts'
import {cn} from '#lib/utils.ts'

export * from 'lucide-react'

export function AgentIcon(props: {
	readonly layer: 'claude' | 'codex' | 'effect' | 'opencode' | 'pi'
	readonly className?: string
}) {
	return pipe(
		Match.value(props.layer),
		Match.when('claude', () => <ClaudeDark className={cn('size-3 shrink-0', props.className)} />),
		Match.when('codex', () => <CodexDark className={cn('size-3 shrink-0', props.className)} />),
		Match.when('effect', () => <EffectDark className={cn('size-3 shrink-0', props.className)} />),
		Match.when('opencode', () => <OpencodeDark className={cn('size-3 shrink-0', props.className)} />),
		Match.when('pi', () => <PiDark className={cn('size-3 shrink-0', props.className)} />),
		Match.exhaustive
	)
}

export function ProcessStateIcon(props: {
	readonly state?: 'idle' | 'starting' | 'running' | 'waiting' | 'stopped' | 'exited' | 'failed'
	readonly className?: string
}) {
	return pipe(
		Match.value(props.state),
		Match.when('starting', () => <Loader2Icon className={cn('text-primary size-3 animate-spin', props.className)} />),
		Match.when('running', () => <CircleIcon className={cn('fill-primary text-primary size-2.5', props.className)} />),
		Match.when('waiting', () => <CirclePauseIcon className={cn('size-3 text-amber-500', props.className)} />),
		Match.when(Match.is('failed', 'stopped'), () => (
			<CircleIcon className={cn('text-destructive fill-destructive size-2.5', props.className)} />
		)),
		Match.when('exited', () => (
			<CircleIcon className={cn('size-2.5 fill-emerald-500 text-emerald-500', props.className)} />
		)),
		Match.orElse(() => <CircleIcon className={cn('text-muted-foreground/70 size-2.5', props.className)} />)
	)
}

export function StatusIcon(props: {
	readonly state: 'idle' | 'running' | 'retrying' | 'stopping' | 'awaiting_input' | 'error'
	readonly className?: string
}) {
	return pipe(
		Match.value(props.state),
		Match.when('idle', Function.constUndefined),
		Match.when('running', () => <Loader2Icon className={cn('size-3 animate-spin text-blue-500', props.className)} />),
		Match.when('error', () => <OctagonXIcon className={cn('text-destructive size-3', props.className)} />),
		Match.orElse(() => <TriangleAlertIcon className={cn('size-3 text-amber-500', props.className)} />)
	)
}

export function ProviderIcon(props: {
	readonly provider: 'openai' | 'opencode-go' | 'openrouter'
	readonly className?: string
}) {
	return pipe(
		Match.value(props.provider),
		Match.when('openai', () => <OpenaiDark className={cn('size-3 shrink-0', props.className)} />),
		Match.when('opencode-go', () => <OpencodeDark className={cn('size-3 shrink-0', props.className)} />),
		Match.when('openrouter', () => <OpenrouterDark className={cn('size-3 shrink-0', props.className)} />),
		Match.exhaustive
	)
}

export function FileIcon(props: {readonly filePath: string; readonly className?: string}) {
	return pipe(
		Match.value(resolveLanguage(props.filePath)),
		Match.when('shell', () => <BashDark className={cn('size-3 shrink-0', props.className)} />),
		Match.when('markdown', () => <MarkdownDark className={cn('size-3 shrink-0', props.className)} />),
		Match.when('tsx', () => <ReactDark className={cn('size-3 shrink-0 text-sky-400', props.className)} />),
		Match.when('jsonc', () => <Braces className={cn('size-3 shrink-0 text-amber-500', props.className)} />),
		Match.when('text', () => <File className={cn('text-muted-foreground size-3 shrink-0', props.className)} />),
		Match.exhaustive
	)
}
