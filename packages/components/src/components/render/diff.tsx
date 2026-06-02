import {Array, String} from 'effect'

import type {AnnotationSide, FileDiffMetadata} from '@pierre/diffs'
import {getSingularPatch, setLanguageOverride} from '@pierre/diffs'
import {File, FileDiff as PierreFileDiff} from '@pierre/diffs/react'
import {useEffect, useLayoutEffect, useRef, useState} from 'react'

import {HIGHLIGHT_THEMES, resolveLanguage} from '#lib/shiki.ts'

const DIFF_CSS = `
	:host,
	pre {
		--diffs-bg: var(--background) !important;
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
`

type DiffComment = {
	readonly filePath: string
	readonly lineNumber: number
	readonly side?: AnnotationSide
	readonly body: string
}

function captureScrollAnchor(container: HTMLElement, clientY: number) {
	const lineElement = [
		...(container
			.querySelector('diffs-container')
			?.shadowRoot?.querySelectorAll<HTMLElement>('[data-line][data-line-type]') ?? [])
	].find(element => {
		const rect = element.getBoundingClientRect()
		return clientY >= rect.top && clientY <= rect.bottom
	})

	if (!lineElement || lineElement.dataset['lineType'] === 'change-deletion') return undefined

	const lineNumber = lineElement.dataset['line']
	if (!lineNumber) return undefined

	return {clientY, lineNumber, offsetWithinLine: clientY - lineElement.getBoundingClientRect().top}
}

function restoreScrollAnchor(
	container: HTMLElement,
	anchor: {readonly clientY: number; readonly offsetWithinLine: number; readonly lineNumber: string},
	mode: 'diff' | 'file'
) {
	const targetLine = container
		.querySelector('diffs-container')
		?.shadowRoot?.querySelector(
			mode === 'diff'
				? `[data-line="${CSS.escape(anchor.lineNumber)}"]:not([data-line-type="change-deletion"])`
				: `[data-line="${CSS.escape(anchor.lineNumber)}"]`
		)

	if (!(targetLine instanceof HTMLElement)) return

	container.scrollTo({
		behavior: 'instant',
		top: container.scrollTop + targetLine.getBoundingClientRect().top - (anchor.clientY - anchor.offsetWithinLine)
	})
}

function CommentAnnotation(props: {
	readonly comment: DiffComment
	readonly isDraft?: boolean
	readonly onSaveComment?: (comment: DiffComment) => void
	readonly onDeleteComment?: (comment: DiffComment) => void
	readonly onCloseDraft?: () => void
}) {
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const [editing, setEditing] = useState(String.isEmpty(props.comment.body))
	const [body, setBody] = useState(props.comment.body)

	useEffect(() => {
		if (editing) inputRef.current?.focus()
	}, [editing])

	function saveDraft() {
		if (String.isEmpty(String.trim(body))) {
			if (props.isDraft) {
				props.onCloseDraft?.()
				return
			}

			props.onDeleteComment?.({...props.comment, body})
			setEditing(false)
			props.onCloseDraft?.()
			return
		}

		props.onSaveComment?.({...props.comment, body: String.trim(body)})
		setEditing(false)
		props.onCloseDraft?.()
	}

	if (editing) {
		return (
			<div className="text-foreground box-border w-full max-w-full bg-transparent px-2 py-2">
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

							if (props.isDraft) props.onCloseDraft?.()
							else setEditing(false)
						}

						if (event.key === 'Enter' && !event.shiftKey) {
							event.preventDefault()
							saveDraft()
						}
					}}
				/>
			</div>
		)
	}

	return (
		<div className="text-foreground box-border w-full max-w-full bg-transparent px-2 py-2">
			<button
				type="button"
				className="block w-full bg-transparent p-0 text-left whitespace-pre-wrap"
				onClick={event => {
					event.stopPropagation()
					setEditing(true)
				}}
			>
				{props.comment.body}
			</button>
		</div>
	)
}

function patchResultContent(fileDiff: FileDiffMetadata) {
	if (fileDiff.type === 'deleted') return ''

	return Array.join(
		Array.flatMap(fileDiff.hunks, hunk =>
			Array.flatMap(hunk.hunkContent, part =>
				Array.take(
					Array.drop(fileDiff.additionLines, part.additionLineIndex),
					part.type === 'context' ? part.lines : part.additions
				)
			)
		),
		''
	)
}

export function PatchDiff(props: {
	readonly filePath: string
	readonly patch: string
	readonly comments?: readonly DiffComment[]
	readonly onSaveComment?: (comment: DiffComment) => void
	readonly onDeleteComment?: (comment: DiffComment) => void
}) {
	const containerRef = useRef<HTMLElement>(null)
	const pointerClientYRef = useRef<number | undefined>(undefined)
	const scrollAnchorRef = useRef<ReturnType<typeof captureScrollAnchor>>(undefined)
	const [mode, setMode] = useState<'diff' | 'file'>('diff')
	const [draftComment, setDraftComment] = useState<DiffComment>()
	const language = resolveLanguage(props.filePath)
	const fileDiff = setLanguageOverride(getSingularPatch(props.patch), language)
	const comments = props.comments ?? []
	const commentsWithDraft = draftComment ? Array.append(comments, draftComment) : comments

	useEffect(() => {
		containerRef.current?.focus()
	}, [mode, props.filePath, props.patch])

	useLayoutEffect(() => {
		const container = containerRef.current
		const anchor = scrollAnchorRef.current
		if (!container || !anchor) return

		restoreScrollAnchor(container, anchor, mode)
		scrollAnchorRef.current = undefined
	}, [mode])

	function openComment(line: {readonly lineNumber: number; readonly side?: AnnotationSide}) {
		if (!props.onSaveComment) return

		if (
			draftComment &&
			draftComment.filePath === props.filePath &&
			draftComment.lineNumber === line.lineNumber &&
			(draftComment.side === 'deletions') === (line.side === 'deletions')
		) {
			return
		}

		if (draftComment) return

		if (
			!Array.some(
				comments,
				current =>
					current.filePath === props.filePath &&
					current.lineNumber === line.lineNumber &&
					(current.side === 'deletions') === (line.side === 'deletions')
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
			onKeyDownCapture={event => {
				if (event.key === 'Tab') {
					event.preventDefault()
					event.stopPropagation()

					const rect = event.currentTarget.getBoundingClientRect()
					const clientY =
						pointerClientYRef.current !== undefined
							? Math.min(Math.max(pointerClientYRef.current, rect.top), rect.bottom)
							: rect.top + rect.height / 2
					scrollAnchorRef.current = captureScrollAnchor(event.currentTarget, clientY)
					setMode(current => (current === 'diff' ? 'file' : 'diff'))
				}
			}}
		>
			{mode === 'diff' ? (
				<PierreFileDiff<DiffComment>
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
						unsafeCSS: DIFF_CSS
					}}
					lineAnnotations={Array.map(commentsWithDraft, comment => ({
						lineNumber: comment.lineNumber,
						metadata: comment,
						side: comment.side ?? 'additions'
					}))}
					renderAnnotation={annotation => (
						<CommentAnnotation
							comment={annotation.metadata}
							isDraft={
								draftComment &&
								annotation.metadata.filePath === draftComment.filePath &&
								annotation.metadata.lineNumber === draftComment.lineNumber &&
								(annotation.metadata.side === 'deletions') === (draftComment.side === 'deletions')
							}
							onSaveComment={props.onSaveComment}
							onDeleteComment={props.onDeleteComment}
							onCloseDraft={() => {
								setDraftComment(undefined)
							}}
						/>
					)}
				/>
			) : (
				<File<DiffComment>
					key={props.patch}
					file={{contents: patchResultContent(fileDiff), lang: language, name: props.filePath}}
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
						Array.filter(commentsWithDraft, comment => comment.side !== 'deletions'),
						comment => ({lineNumber: comment.lineNumber, metadata: comment})
					)}
					renderAnnotation={annotation => (
						<CommentAnnotation
							comment={annotation.metadata}
							isDraft={
								draftComment &&
								annotation.metadata.filePath === draftComment.filePath &&
								annotation.metadata.lineNumber === draftComment.lineNumber &&
								(annotation.metadata.side === 'deletions') === (draftComment.side === 'deletions')
							}
							onSaveComment={props.onSaveComment}
							onDeleteComment={props.onDeleteComment}
							onCloseDraft={() => {
								setDraftComment(undefined)
							}}
						/>
					)}
				/>
			)}
		</section>
	)
}
