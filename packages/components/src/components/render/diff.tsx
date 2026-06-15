import {Array, Option, Predicate, String} from 'effect'

import type {AnnotationSide} from '@pierre/diffs'
import {getSingularPatch, setLanguageOverride} from '@pierre/diffs'
import {File, FileDiff} from '@pierre/diffs/react'
import {useHotkey} from '@tanstack/react-hotkeys'
import {CircleCheckIcon, CopyIcon, MessageSquareTextIcon} from 'lucide-react'
import {useEffect, useLayoutEffect, useRef, useState} from 'react'

import {Markdown} from './markdown.tsx'

import {GithubLight} from '#components/svgs/githubLight.tsx'
import {Spinner} from '#components/ui/spinner.tsx'
import {HIGHLIGHT_THEMES, resolveLanguage} from '#lib/shiki.ts'

function diffCss() {
	return `
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
}

export type DiffComment = {
	readonly filePath: string
	readonly lineNumber: number
	readonly side?: AnnotationSide
	readonly body: string
	readonly resolved?: boolean
	readonly resolving?: boolean
	readonly source: 'github' | 'local'
	readonly threadId?: string
}

function sameDiffLine(
	left: {readonly filePath: string; readonly lineNumber: number; readonly side?: AnnotationSide},
	right: {readonly filePath: string; readonly lineNumber: number; readonly side?: AnnotationSide}
) {
	return (
		left.filePath === right.filePath &&
		left.lineNumber === right.lineNumber &&
		(left.side === 'deletions') === (right.side === 'deletions')
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

function captureScrollAnchor(container: HTMLElement, clientY: number) {
	const lineElement = Option.getOrUndefined(
		Array.findFirst(
			[
				...(container
					.querySelector('diffs-container')
					?.shadowRoot?.querySelectorAll<HTMLElement>('[data-line][data-line-type]') ?? [])
			],
			element => {
				const rect = element.getBoundingClientRect()
				return clientY >= rect.top && clientY <= rect.bottom
			}
		)
	)

	if (!lineElement) return

	if (Predicate.isUndefined(lineElement.dataset['line']) || String.isEmpty(lineElement.dataset['line'])) return

	return {
		clientY,
		lineNumber: lineElement.dataset['line'],
		offsetWithinLine: clientY - lineElement.getBoundingClientRect().top,
		scrollTop: container.scrollTop
	}
}

function restoreScrollAnchor(
	container: HTMLElement,
	anchor: {
		readonly clientY: number
		readonly offsetWithinLine: number
		readonly lineNumber: string
		readonly scrollTop: number
	},
	mode: 'diff' | 'file'
) {
	const targetLine = container
		.querySelector('diffs-container')
		?.shadowRoot?.querySelector(
			mode === 'diff'
				? `[data-line="${CSS.escape(anchor.lineNumber)}"]:not([data-line-type="change-deletion"])`
				: `[data-line="${CSS.escape(anchor.lineNumber)}"]`
		)

	if (!(targetLine instanceof HTMLElement)) {
		container.scrollTo({behavior: 'instant', top: anchor.scrollTop})
		return true
	}

	container.scrollTo({
		behavior: 'instant',
		top: container.scrollTop + targetLine.getBoundingClientRect().top - (anchor.clientY - anchor.offsetWithinLine)
	})
	return true
}

function CommentAnnotation(props: {
	readonly comment: DiffComment
	readonly isDraft?: boolean
	readonly onSaveComment?: (comment: DiffComment) => void
	readonly onResolveComment?: (comment: DiffComment) => void
	readonly onCloseDraft?: () => void
}) {
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const [editing, setEditing] = useState(String.isEmpty(props.comment.body))
	const [body, setBody] = useState(props.comment.body)

	useEffect(() => {
		if (editing) inputRef.current?.focus()
	}, [editing])

	async function copyComment() {
		await navigator.clipboard.writeText(formatCopiedComment(props.comment))
	}

	function saveDraft() {
		if (String.isEmpty(String.trim(body))) {
			if (props.isDraft === true) {
				props.onCloseDraft?.()
				return
			}

			props.onResolveComment?.({...props.comment, body})
			setEditing(false)
			props.onCloseDraft?.()
			return
		}

		props.onSaveComment?.({...props.comment, body: String.trim(body)})
		setEditing(false)
		props.onCloseDraft?.()
	}

	const sourceIcon =
		props.comment.source === 'github' ? (
			<GithubLight className="size-3 shrink-0" />
		) : (
			<MessageSquareTextIcon className="size-3 shrink-0" />
		)
	const iconCell = (
		<div className="border-border bg-background text-muted-foreground inline-flex shrink-0 border p-1">
			{sourceIcon}
		</div>
	)

	if (editing) {
		return (
			<div className="border-border/70 bg-muted/70 text-foreground box-border grid w-full max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 border-y px-2 py-2">
				{iconCell}
				<div className="min-w-0">
					<textarea
						ref={inputRef}
						value={body}
						placeholder="Add comment"
						className="font-inherit block min-h-16 w-full resize-y border-0 bg-transparent p-0 text-inherit outline-none"
						onChange={event => {
							setBody(event.currentTarget.value)
						}}
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

	if (props.comment.resolved === true) {
		return (
			<div className="text-muted-foreground bg-muted/70 border-border/60 box-border grid w-full max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-y px-2 py-1 opacity-75">
				{iconCell}
				<span className="decoration-muted-foreground/60 min-w-0 truncate line-through">{props.comment.body}</span>
				<div />
			</div>
		)
	}

	return (
		<div className="border-border/70 bg-muted/70 text-foreground box-border grid w-full max-w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 border-y px-2 py-2">
			{iconCell}
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
						void copyComment()
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
	readonly loadFileContent?: () => Promise<string>
	readonly patch: string
	readonly comments?: readonly DiffComment[]
	readonly onSaveComment?: (comment: DiffComment) => void
	readonly onResolveComment?: (comment: DiffComment) => void
}) {
	const containerRef = useRef<HTMLElement>(null)
	const loadFileContentRef = useRef(props.loadFileContent)
	const pointerClientYRef = useRef<number>(null)
	const scrollAnchorRef = useRef<Exclude<ReturnType<typeof captureScrollAnchor>, undefined>>(null)
	const [draftComment, setDraftComment] = useState<DiffComment>()
	const [fileContent, setFileContent] = useState(props.fileContent ?? '')
	const [fileContentLoading, setFileContentLoading] = useState(false)
	const [mode, setMode] = useState<'diff' | 'file'>('diff')
	const language = resolveLanguage(props.filePath)
	const fileDiff = setLanguageOverride(getSingularPatch(props.patch), language)
	const comments = props.comments ?? []
	const commentsWithDraft = draftComment ? Array.append(comments, draftComment) : comments

	useEffect(() => {
		loadFileContentRef.current = props.loadFileContent
	}, [props.loadFileContent])

	useEffect(() => {
		containerRef.current?.focus()
	}, [mode, props.filePath, props.patch])

	useEffect(() => {
		setMode('diff')
		setDraftComment(undefined)
		setFileContent(props.fileContent ?? '')
		setFileContentLoading(false)
	}, [props.fileContent, props.filePath, props.patch])

	useEffect(() => {
		if (mode !== 'file' || String.isNonEmpty(fileContent) || loadFileContentRef.current === undefined) return

		const active = {current: true}
		setFileContentLoading(true)
		void loadFileContentRef.current().then(
			content => {
				if (!active.current) return
				setFileContent(content)
				setFileContentLoading(false)
			},
			() => {
				if (active.current) setFileContentLoading(false)
			}
		)

		return () => {
			active.current = false
		}
	}, [fileContent, mode])

	useLayoutEffect(() => {
		if (Predicate.isNull(containerRef.current) || Predicate.isNull(scrollAnchorRef.current)) return
		if (restoreScrollAnchor(containerRef.current, scrollAnchorRef.current, mode)) scrollAnchorRef.current = null
	}, [fileContent, mode])

	function toggleMode() {
		if (Predicate.isNull(containerRef.current)) return

		const rect = containerRef.current.getBoundingClientRect()
		const clientY = Predicate.isNull(pointerClientYRef.current)
			? rect.top + rect.height / 2
			: Math.min(Math.max(pointerClientYRef.current, rect.top), rect.bottom)
		scrollAnchorRef.current = captureScrollAnchor(containerRef.current, clientY) ?? null
		setMode(current => (current === 'diff' ? 'file' : 'diff'))
	}

	useHotkey(
		'Tab',
		event => {
			event.preventDefault()
			toggleMode()
		},
		{preventDefault: false, target: containerRef}
	)

	function openComment(line: {readonly lineNumber: number; readonly side?: AnnotationSide}) {
		if (!props.onSaveComment) return

		if (
			draftComment &&
			sameDiffLine(draftComment, {filePath: props.filePath, lineNumber: line.lineNumber, side: line.side})
		) {
			return
		}

		if (draftComment) return

		if (
			!Array.some(comments, current =>
				sameDiffLine(current, {filePath: props.filePath, lineNumber: line.lineNumber, side: line.side})
			)
		) {
			setDraftComment({
				body: '',
				filePath: props.filePath,
				lineNumber: line.lineNumber,
				side: line.side === 'deletions' ? line.side : undefined,
				source: 'local'
			})
		}
	}

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
			{mode === 'diff' ? (
				<FileDiff<DiffComment>
					key={props.patch}
					fileDiff={fileDiff}
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
						unsafeCSS: diffCss()
					}}
					lineAnnotations={Array.map(commentsWithDraft, comment => ({
						lineNumber: comment.lineNumber,
						metadata: comment,
						side: comment.side ?? 'additions'
					}))}
					renderAnnotation={annotation => (
						<CommentAnnotation
							comment={annotation.metadata}
							isDraft={draftComment && sameDiffLine(annotation.metadata, draftComment)}
							onSaveComment={props.onSaveComment}
							onResolveComment={props.onResolveComment}
							onCloseDraft={() => {
								setDraftComment(undefined)
							}}
						/>
					)}
				/>
			) : (
				<>
					{fileContentLoading && (
						<div className="text-muted-foreground flex h-full items-center justify-center">
							<Spinner className="size-4 border opacity-60" />
						</div>
					)}
					{!fileContentLoading && (
						<File<DiffComment>
							key={props.filePath}
							file={{contents: fileContent, lang: language, name: props.filePath}}
							options={{
								disableFileHeader: true,
								disableLineNumbers: false,
								onLineNumberClick: line => {
									openComment({lineNumber: line.lineNumber})
								},
								overflow: 'scroll',
								theme: HIGHLIGHT_THEMES,
								themeType: 'system',
								unsafeCSS: diffCss()
							}}
							lineAnnotations={Array.map(
								Array.filter(commentsWithDraft, comment => comment.side !== 'deletions'),
								comment => ({lineNumber: comment.lineNumber, metadata: comment})
							)}
							renderAnnotation={annotation => (
								<CommentAnnotation
									comment={annotation.metadata}
									isDraft={draftComment && sameDiffLine(annotation.metadata, draftComment)}
									onSaveComment={props.onSaveComment}
									onResolveComment={props.onResolveComment}
									onCloseDraft={() => {
										setDraftComment(undefined)
									}}
								/>
							)}
						/>
					)}
				</>
			)}
		</section>
	)
}
