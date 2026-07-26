import {Array, Match, Option, Predicate, String, pipe} from 'effect'

import type {AnnotationSide} from '@pierre/diffs'
import {getSingularPatch, setLanguageOverride} from '@pierre/diffs'
import {File, FileDiff} from '@pierre/diffs/react'
import {useHotkey} from '@tanstack/react-hotkeys'
import {CircleCheckIcon, CopyIcon, MessageSquareTextIcon} from 'lucide-react'
import {useEffect, useLayoutEffect, useRef, useState} from 'react'

import {GithubLight} from '../svgs/githubLight.tsx'

import {Markdown} from './markdown.tsx'

import {Spinner} from '#components/ui/spinner.tsx'
import {HIGHLIGHT_THEMES, resolveLanguage} from '#lib/shiki.ts'
const DIFF_CSS = `
	:host,
	pre {
		--diffs-bg: var(--background) !important;
		--diffs-bg-buffer-override: var(--background) !important;
		--diffs-bg-context-override: var(--background) !important;
		--diffs-bg-hover-override: color-mix(in oklab, var(--muted) 70%, transparent) !important;
		--diffs-bg-separator-override: var(--muted) !important;
		--diffs-fg: var(--foreground) !important;
		--diffs-fg-number-override: var(--muted-foreground) !important;
		font-family: 'JetBrainsMono Nerd Font Mono', 'JetBrains Mono Variable', monospace !important;
		font-size: inherit !important;
		letter-spacing: 0 !important;
		line-height: inherit !important;
		user-select: text !important;
	}

	pre {
		background-color: transparent !important;
	}

	*,
	::before,
	::after {
		border-radius: 0 !important;
		user-select: text !important;
	}

	[data-diff],
	[data-file],
	[data-separator],
	[data-line],
	[data-line] *,
	[data-line-annotation],
	[data-annotation-content] {
		border-radius: 0 !important;
	}

	[data-diff] [data-line][data-line-type='context'],
	[data-diff] [data-line][data-line-type='context-expanded'],
	[data-file] [data-line] {
		background-color: var(--background) !important;
		color: var(--foreground) !important;
	}

	[data-diff] [data-column-number][data-line-type='context'],
	[data-diff] [data-column-number][data-line-type='context-expanded'],
	[data-file] [data-column-number] {
		background-color: var(--background) !important;
		color: var(--muted-foreground) !important;
	}

	[data-separator] {
		background-color: var(--muted) !important;
		color: var(--muted-foreground) !important;
	}
`
export declare namespace PatchDiff {
	export type Comment = {
		readonly filePath: string
		readonly lineNumber: number
		readonly side?: AnnotationSide
		readonly body: string
		readonly resolving?: boolean
		readonly source?: 'github' | 'local'
		readonly threadId?: string
	}
}
function sameDiffLine(input: {
	readonly left: {readonly filePath: string; readonly lineNumber: number; readonly side?: AnnotationSide}
	readonly right: {readonly filePath: string; readonly lineNumber: number; readonly side?: AnnotationSide}
}) {
	return (
		input.left.filePath === input.right.filePath &&
		input.left.lineNumber === input.right.lineNumber &&
		(input.left.side === 'deletions') === (input.right.side === 'deletions')
	)
}
export function formatCopiedComment(comment: {
	readonly body: string
	readonly filePath: string
	readonly lineNumber: number
	readonly side?: AnnotationSide
}) {
	const linePrefix = comment.side === 'deletions' ? 'deleted' : 'line'
	return `# Review comments\n\n## ${comment.filePath}\n\n${linePrefix}:${comment.lineNumber}: ${comment.body}`
}
function captureScrollAnchor(input: {readonly container: HTMLElement; readonly clientY: number}) {
	const lineElement = pipe(
		Array.fromIterable(
			input.container
				.querySelector('diffs-container')
				?.shadowRoot?.querySelectorAll<HTMLElement>('[data-line][data-line-type]') ?? []
		),
		Array.findFirst(element => {
			const rect = element.getBoundingClientRect()
			return input.clientY >= rect.top && input.clientY <= rect.bottom
		}),
		Option.getOrUndefined
	)
	if (!lineElement) return
	if (Predicate.isUndefined(lineElement.dataset['line']) || String.isEmpty(lineElement.dataset['line'])) return
	return {
		clientY: input.clientY,
		lineNumber: lineElement.dataset['line'],
		offsetWithinLine: input.clientY - lineElement.getBoundingClientRect().top,
		scrollTop: input.container.scrollTop
	}
}
function restoreScrollAnchor(input: {
	readonly container: HTMLElement
	readonly anchor: {
		readonly clientY: number
		readonly offsetWithinLine: number
		readonly lineNumber: string
		readonly scrollTop: number
	}
	readonly mode: 'diff' | 'file'
}) {
	const targetLine = input.container
		.querySelector('diffs-container')
		?.shadowRoot?.querySelector(
			input.mode === 'diff'
				? `[data-line="${CSS.escape(input.anchor.lineNumber)}"]:not([data-line-type="change-deletion"])`
				: `[data-line="${CSS.escape(input.anchor.lineNumber)}"]`
		)
	if (!(targetLine instanceof HTMLElement)) {
		input.container.scrollTo({behavior: 'instant', top: input.anchor.scrollTop})
		return true
	}
	input.container.scrollTo({
		behavior: 'instant',
		top:
			input.container.scrollTop +
			targetLine.getBoundingClientRect().top -
			(input.anchor.clientY - input.anchor.offsetWithinLine)
	})
	return true
}
function CommentAnnotation(props: {
	readonly comment: PatchDiff.Comment
	readonly isDraft?: boolean
	readonly onSaveComment?: (comment: PatchDiff.Comment) => void
	readonly onResolveComment?: (comment: PatchDiff.Comment) => void
	readonly onCloseDraft?: () => void
}) {
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const [editing, setEditing] = useState(() => String.isEmpty(props.comment.body))
	useEffect(() => {
		if (!editing) return
		const animationFrame = window.requestAnimationFrame(() => {
			inputRef.current?.focus()
		})
		return () => {
			window.cancelAnimationFrame(animationFrame)
		}
	}, [editing])
	function saveDraft() {
		if (String.isEmpty(String.trim(inputRef.current?.value ?? props.comment.body))) {
			if (props.isDraft === true) {
				props.onCloseDraft?.()
				return
			}
			props.onResolveComment?.({...props.comment, body: inputRef.current?.value ?? props.comment.body})
			setEditing(false)
			props.onCloseDraft?.()
			return
		}
		props.onSaveComment?.({...props.comment, body: String.trim(inputRef.current?.value ?? props.comment.body)})
		setEditing(false)
		props.onCloseDraft?.()
	}
	if (editing) {
		return (
			<div className="border-border/70 bg-muted/70 text-foreground box-border grid w-full max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 border-y px-2 py-2">
				<div className="border-border bg-background text-muted-foreground inline-flex shrink-0 border p-1">
					{props.comment.source === 'github' ? (
						<GithubLight className="size-3 shrink-0" />
					) : (
						<MessageSquareTextIcon className="size-3 shrink-0" />
					)}
				</div>
				<div className="min-w-0">
					<textarea
						ref={inputRef}
						defaultValue={props.comment.body}
						placeholder="Add comment"
						className="font-inherit block min-h-16 w-full resize-y border-0 bg-transparent p-0 text-inherit outline-none"
						onClick={event => {
							event.stopPropagation()
						}}
						onKeyDown={event => {
							if (event.key === 'Escape') {
								event.preventDefault()
								if (props.isDraft === true) props.onCloseDraft?.()
								else setEditing(false)
							}
							if (event.key === 'Enter' && !event.shiftKey) {
								event.preventDefault()
								saveDraft()
							}
						}}
					/>
				</div>
				<div />
			</div>
		)
	}
	return (
		<div className="border-border/70 bg-muted/70 text-foreground box-border grid w-full max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 border-y px-2 py-2">
			<div className="border-border bg-background text-muted-foreground inline-flex shrink-0 border p-1">
				{props.comment.source === 'github' ? (
					<GithubLight className="size-3 shrink-0" />
				) : (
					<MessageSquareTextIcon className="size-3 shrink-0" />
				)}
			</div>
			<button
				type="button"
				className="min-w-0 bg-transparent p-0 text-left"
				onClick={event => {
					event.stopPropagation()
					if (props.comment.source !== 'github') setEditing(true)
				}}
			>
				<Markdown className="text-inherit">{props.comment.body}</Markdown>
			</button>
			<div className="border-border bg-background text-muted-foreground inline-flex shrink-0 border text-xs">
				<button
					type="button"
					className="hover:bg-muted hover:text-foreground p-1"
					aria-label="Copy comment"
					title="Copy comment"
					onClick={event => {
						event.stopPropagation()
						void navigator.clipboard.writeText(formatCopiedComment(props.comment))
					}}
				>
					<CopyIcon className="size-3" />
				</button>
				{props.onResolveComment && (
					<button
						type="button"
						className="border-border hover:bg-muted hover:text-foreground border-l p-1"
						aria-label="Resolve comment"
						title="Resolve comment"
						disabled={props.comment.resolving}
						onClick={event => {
							event.stopPropagation()
							props.onResolveComment?.(props.comment)
						}}
					>
						{props.comment.resolving === true ? <Spinner className="size-3" /> : <CircleCheckIcon className="size-3" />}
					</button>
				)}
			</div>
		</div>
	)
}
export function PatchDiff(props: {
	readonly filePath: string
	readonly fileContent?: string
	readonly patch?: string
	readonly comments?: readonly PatchDiff.Comment[]
	readonly onSaveComment?: (comment: PatchDiff.Comment) => void
	readonly onResolveComment?: (comment: PatchDiff.Comment) => void
}) {
	const containerRef = useRef<HTMLElement>(null)
	const pointerClientYRef = useRef<number>(null)
	const scrollAnchorRef = useRef<Exclude<ReturnType<typeof captureScrollAnchor>, undefined>>(null)
	const [draftComment, setDraftComment] = useState<PatchDiff.Comment>()
	const patch = Predicate.isString(props.patch) && String.isNonEmpty(props.patch) ? props.patch : undefined
	const fileContent = Predicate.isString(props.fileContent) ? props.fileContent : undefined
	const modeKey = `${props.filePath}\u0000${patch ?? ''}\u0000${Predicate.isString(fileContent) ? 'file' : 'pending'}`
	const [modeState, setModeState] = useState<{readonly key: string; readonly mode: 'diff' | 'file'}>(() => ({
		key: modeKey,
		mode: Predicate.isString(patch) ? 'diff' : 'file'
	}))
	const preferredMode = Predicate.isString(patch) ? 'diff' : 'file'
	const requestedMode = modeState.key === modeKey ? modeState.mode : preferredMode
	function resolveMode() {
		if (requestedMode === 'diff' && Predicate.isUndefined(patch)) return 'file'
		if (requestedMode === 'file' && Predicate.isUndefined(fileContent) && Predicate.isString(patch)) return 'diff'
		return requestedMode
	}
	const mode = resolveMode()
	const language = resolveLanguage(props.filePath)
	const fileDiff = pipe(
		Match.value(patch),
		Match.when(Predicate.isString, value => setLanguageOverride(getSingularPatch(value), language)),
		Match.orElse(() => undefined)
	)
	useEffect(() => {
		containerRef.current?.focus()
	}, [mode, props.filePath, props.patch, props.fileContent])
	useLayoutEffect(() => {
		if (Predicate.isNull(containerRef.current) || Predicate.isNull(scrollAnchorRef.current)) return
		if (restoreScrollAnchor({anchor: scrollAnchorRef.current, container: containerRef.current, mode})) {
			scrollAnchorRef.current = null
		}
	}, [mode, props.fileContent])
	function toggleMode() {
		if (Predicate.isUndefined(patch) || Predicate.isUndefined(fileContent)) {
			return
		}
		if (Predicate.isNull(containerRef.current)) return
		const rect = containerRef.current.getBoundingClientRect()
		const clientY = pipe(
			Match.value(pointerClientYRef.current),
			Match.when(Predicate.isNull, () => rect.top + rect.height / 2),
			Match.orElse(value => Math.min(Math.max(value, rect.top), rect.bottom))
		)
		scrollAnchorRef.current = captureScrollAnchor({clientY, container: containerRef.current}) ?? null
		setModeState(current => ({
			key: modeKey,
			mode: current.key === modeKey && current.mode === 'file' ? 'diff' : 'file'
		}))
	}
	useHotkey(
		'Tab',
		event => {
			if (
				Predicate.isUndefined(
					Predicate.isString(props.patch) && String.isNonEmpty(props.patch) ? props.patch : undefined
				) ||
				Predicate.isUndefined(Predicate.isString(props.fileContent) ? props.fileContent : undefined)
			) {
				return
			}
			event.preventDefault()
			toggleMode()
		},
		{preventDefault: false, target: containerRef}
	)
	function openComment(line: {readonly lineNumber: number; readonly side?: AnnotationSide}) {
		if (!props.onSaveComment) return
		if (
			draftComment &&
			sameDiffLine({
				left: draftComment,
				right: {filePath: props.filePath, lineNumber: line.lineNumber, side: line.side}
			})
		) {
			return
		}
		if (draftComment) return
		if (
			!Array.some(props.comments ?? [], current =>
				sameDiffLine({left: current, right: {filePath: props.filePath, lineNumber: line.lineNumber, side: line.side}})
			)
		) {
			setDraftComment({
				body: '',
				filePath: props.filePath,
				lineNumber: line.lineNumber,
				side: line.side === 'deletions' ? line.side : undefined
			})
		}
	}
	const content = pipe(
		Match.value({
			fileContent: Predicate.isString(props.fileContent) ? props.fileContent : undefined,
			fileDiff,
			mode,
			patch: Predicate.isString(props.patch) && String.isNonEmpty(props.patch) ? props.patch : undefined
		}),
		Match.when(
			value => value.mode === 'diff' && Predicate.isNotUndefined(value.fileDiff),
			value => (
				<FileDiff<PatchDiff.Comment>
					key={value.patch}
					fileDiff={value.fileDiff!}
					options={{
						diffIndicators: 'bars',
						diffStyle: 'unified',
						disableBackground: false,
						disableFileHeader: true,
						disableLineNumbers: false,
						lineDiffType: 'word-alt',
						onLineNumberClick: line => {
							openComment({lineNumber: line.lineNumber, side: line.annotationSide})
						},
						overflow: 'scroll',
						theme: HIGHLIGHT_THEMES,
						themeType: 'system',
						unsafeCSS: DIFF_CSS
					}}
					lineAnnotations={Array.map(
						draftComment ? Array.append(props.comments ?? [], draftComment) : (props.comments ?? []),
						comment => ({lineNumber: comment.lineNumber, metadata: comment, side: comment.side ?? 'additions'})
					)}
					renderAnnotation={annotation => (
						<CommentAnnotation
							comment={annotation.metadata}
							isDraft={draftComment && sameDiffLine({left: annotation.metadata, right: draftComment})}
							onSaveComment={props.onSaveComment}
							onResolveComment={props.onResolveComment}
							onCloseDraft={() => {
								setDraftComment(undefined)
							}}
						/>
					)}
				/>
			)
		),
		Match.when(
			value => Predicate.isString(value.fileContent) || Predicate.isString(value.patch),
			value => (
				<File<PatchDiff.Comment>
					key={props.filePath}
					file={{contents: value.fileContent ?? '', lang: language, name: props.filePath}}
					options={{
						disableFileHeader: true,
						disableLineNumbers: false,
						onLineNumberClick: line => {
							openComment({lineNumber: line.lineNumber})
						},
						overflow: 'scroll',
						theme: HIGHLIGHT_THEMES,
						themeType: 'system',
						unsafeCSS: DIFF_CSS
					}}
					lineAnnotations={Array.map(
						Array.filter(
							draftComment ? Array.append(props.comments ?? [], draftComment) : (props.comments ?? []),
							comment => comment.side !== 'deletions'
						),
						comment => ({lineNumber: comment.lineNumber, metadata: comment})
					)}
					renderAnnotation={annotation => (
						<CommentAnnotation
							comment={annotation.metadata}
							isDraft={draftComment && sameDiffLine({left: annotation.metadata, right: draftComment})}
							onSaveComment={props.onSaveComment}
							onResolveComment={props.onResolveComment}
							onCloseDraft={() => {
								setDraftComment(undefined)
							}}
						/>
					)}
				/>
			)
		),
		Match.orElse(() => (
			<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
				<Spinner className="mr-2 size-3 border opacity-60" />
				Loading file
			</div>
		))
	)
	return (
		<section
			ref={containerRef}
			tabIndex={-1}
			aria-label="Diff viewer"
			className="bg-background block h-full min-h-0 w-full overflow-auto rounded-none outline-none select-text"
			onPointerMoveCapture={event => {
				pointerClientYRef.current = event.clientY
			}}
			onPointerDownCapture={event => {
				pointerClientYRef.current = event.clientY
				if (!(event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement)) {
					event.currentTarget.focus()
				}
			}}
		>
			{content}
		</section>
	)
}
