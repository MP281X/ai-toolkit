import {Array, String} from 'effect'

import type {AnnotationSide} from '@pierre/diffs'
import {getSingularPatch} from '@pierre/diffs'
import {File, PatchDiff as PierrePatchDiff, WorkerPoolContextProvider} from '@pierre/diffs/react'
import {useEffect, useRef, useState} from 'react'

import {HIGHLIGHT_THEMES, resolveLanguage} from '#lib/shiki.ts'

const DIFF_OPTIONS = {
	overflow: 'scroll',
	themeType: 'system',
	diffStyle: 'unified',
	lineDiffType: 'word-alt',
	diffIndicators: 'bars',
	disableBackground: false,
	disableFileHeader: true,
	theme: HIGHLIGHT_THEMES,
	disableLineNumbers: false
} as const

const DIFF_CSS = `
	:host,
	pre {
		--diffs-bg: var(--background) !important;
	}

	pre {
		background-color: transparent !important;
	}

	*,
	::before,
	::after {
		border-radius: 0 !important;
	}
`

type DiffComment = {
	readonly filePath: string
	readonly lineNumber: number
	readonly side?: AnnotationSide
	readonly body: string
}

function CommentAnnotation(props: {
	readonly comment: DiffComment
	readonly isDraft?: boolean
	readonly onChangeComment?: (comment: DiffComment) => void
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
			<div className="box-border w-full max-w-full bg-transparent px-3 py-2 text-foreground text-xs">
				<textarea
					ref={inputRef}
					value={body}
					placeholder="Add comment"
					className="block min-h-16 w-full resize-y border-0 bg-transparent p-0 font-inherit text-inherit outline-none"
					onChange={event => {
						setBody(event.currentTarget.value)
						props.onChangeComment?.({...props.comment, body: event.currentTarget.value})
					}}
					onClick={event => event.stopPropagation()}
					onKeyDown={event => {
						if (event.key === 'Escape') {
							event.preventDefault()

							if (String.isEmpty(String.trim(body))) {
								if (!props.isDraft) props.onDeleteComment?.({...props.comment, body})
								props.onCloseDraft?.()
								return
							}

							setEditing(false)
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
		<div className="box-border w-full max-w-full bg-transparent px-3 py-2 text-foreground text-xs">
			<button
				type="button"
				className="block w-full whitespace-pre-wrap bg-transparent p-0 text-left leading-relaxed"
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

function patchResultContent(patch: string) {
	const fileDiff = getSingularPatch(patch)

	if (fileDiff.type === 'deleted') return ''

	return Array.join(
		Array.flatMap(fileDiff.hunks, hunk => {
			return Array.flatMap(hunk.hunkContent, part => {
				return Array.take(
					Array.drop(fileDiff.additionLines, part.additionLineIndex),
					part.type === 'context' ? part.lines : part.additions
				)
			})
		}),
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
	const [mode, setMode] = useState<'diff' | 'file'>('diff')
	const [draftComment, setDraftComment] = useState<DiffComment>()
	function commitDraftComment() {
		if (draftComment) {
			if (!String.isEmpty(String.trim(draftComment.body))) {
				props.onSaveComment?.({...draftComment, body: String.trim(draftComment.body)})
			}
			setDraftComment(undefined)
		}
	}

	function openComment(line: {readonly lineNumber: number; readonly side?: AnnotationSide}) {
		if (!props.onSaveComment) return

		if (
			draftComment &&
			`${draftComment.filePath}:${draftComment.side === 'deletions' ? 'deletions' : 'file'}:${draftComment.lineNumber}` ===
				`${props.filePath}:${line.side === 'deletions' ? 'deletions' : 'file'}:${line.lineNumber}`
		) {
			return
		}

		commitDraftComment()

		if (
			!Array.some(props.comments ?? Array.empty(), current => {
				return (
					`${current.filePath}:${current.side === 'deletions' ? 'deletions' : 'file'}:${current.lineNumber}` ===
					`${props.filePath}:${line.side === 'deletions' ? 'deletions' : 'file'}:${line.lineNumber}`
				)
			})
		) {
			setDraftComment({
				filePath: props.filePath,
				lineNumber: line.lineNumber,
				side: line.side === 'deletions' ? line.side : undefined,
				body: ''
			})
		}
	}

	if (mode === 'diff') {
		return (
			<section
				ref={containerRef}
				tabIndex={-1}
				aria-label="Diff viewer"
				className="block h-full min-h-0 w-full overflow-auto rounded-none bg-background outline-none"
				onPointerDownCapture={event => {
					if (!(event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement)) {
						event.currentTarget.focus()
					}
				}}
				onKeyDown={event => {
					if (event.key === 'Tab') {
						event.preventDefault()
						setMode(current => (current === 'diff' ? 'file' : 'diff'))
					}
				}}
			>
				<WorkerPoolContextProvider
					poolOptions={{
						workerFactory: () => {
							return new Worker(new URL('@pierre/diffs/worker/worker.js', import.meta.url), {type: 'module'})
						},
						poolSize: Math.max(2, Math.min(6, Math.floor(Math.max(1, navigator.hardwareConcurrency || 4) / 2))),
						totalASTLRUCacheSize: 240
					}}
					highlighterOptions={{theme: HIGHLIGHT_THEMES, lineDiffType: 'word-alt', tokenizeMaxLineLength: 1_000}}
				>
					<PierrePatchDiff<DiffComment>
						key={props.patch}
						patch={props.patch}
						options={{
							...DIFF_OPTIONS,
							unsafeCSS: DIFF_CSS,
							onLineNumberClick: line => openComment({lineNumber: line.lineNumber, side: line.annotationSide})
						}}
						lineAnnotations={Array.map(
							draftComment
								? Array.append(props.comments ?? Array.empty(), draftComment)
								: (props.comments ?? Array.empty()),
							comment => ({
								side: comment.side ?? 'additions',
								lineNumber: comment.lineNumber,
								metadata: comment
							})
						)}
						renderAnnotation={annotation => (
							<CommentAnnotation
								comment={annotation.metadata}
								isDraft={
									`${annotation.metadata.filePath}:${annotation.metadata.side === 'deletions' ? 'deletions' : 'file'}:${annotation.metadata.lineNumber}` ===
									(draftComment
										? `${draftComment.filePath}:${draftComment.side === 'deletions' ? 'deletions' : 'file'}:${draftComment.lineNumber}`
										: '')
								}
								onChangeComment={comment => {
									if (
										draftComment &&
										`${comment.filePath}:${comment.side === 'deletions' ? 'deletions' : 'file'}:${comment.lineNumber}` ===
											`${draftComment.filePath}:${draftComment.side === 'deletions' ? 'deletions' : 'file'}:${draftComment.lineNumber}`
									) {
										setDraftComment(comment)
									}
								}}
								onSaveComment={props.onSaveComment}
								onDeleteComment={props.onDeleteComment}
								onCloseDraft={() => setDraftComment(undefined)}
							/>
						)}
					/>
				</WorkerPoolContextProvider>
			</section>
		)
	}

	return (
		<section
			ref={containerRef}
			tabIndex={-1}
			aria-label="Diff viewer"
			className="block h-full min-h-0 w-full overflow-auto rounded-none bg-background outline-none"
			onPointerDownCapture={event => {
				if (!(event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement)) {
					event.currentTarget.focus()
				}
			}}
			onKeyDown={event => {
				if (event.key === 'Tab') {
					event.preventDefault()
					setMode(current => (current === 'diff' ? 'file' : 'diff'))
				}
			}}
		>
			<WorkerPoolContextProvider
				poolOptions={{
					workerFactory: () => new Worker(new URL('@pierre/diffs/worker/worker.js', import.meta.url), {type: 'module'}),
					poolSize: Math.max(2, Math.min(6, Math.floor(Math.max(1, navigator.hardwareConcurrency || 4) / 2))),
					totalASTLRUCacheSize: 240
				}}
				highlighterOptions={{theme: HIGHLIGHT_THEMES, lineDiffType: 'word-alt', tokenizeMaxLineLength: 1_000}}
			>
				<File<DiffComment>
					key={props.patch}
					file={{
						name: props.filePath,
						contents: patchResultContent(props.patch),
						lang: resolveLanguage(props.filePath)
					}}
					options={{
						overflow: DIFF_OPTIONS.overflow,
						themeType: DIFF_OPTIONS.themeType,
						disableFileHeader: DIFF_OPTIONS.disableFileHeader,
						theme: DIFF_OPTIONS.theme,
						disableLineNumbers: DIFF_OPTIONS.disableLineNumbers,
						unsafeCSS: DIFF_CSS,
						onLineNumberClick: line => openComment({lineNumber: line.lineNumber})
					}}
					lineAnnotations={Array.map(
						Array.filter(
							draftComment
								? Array.append(props.comments ?? Array.empty(), draftComment)
								: (props.comments ?? Array.empty()),
							comment => comment.side !== 'deletions'
						),
						comment => ({lineNumber: comment.lineNumber, metadata: comment})
					)}
					renderAnnotation={annotation => (
						<CommentAnnotation
							comment={annotation.metadata}
							isDraft={
								`${annotation.metadata.filePath}:${annotation.metadata.side === 'deletions' ? 'deletions' : 'file'}:${annotation.metadata.lineNumber}` ===
								(draftComment
									? `${draftComment.filePath}:${draftComment.side === 'deletions' ? 'deletions' : 'file'}:${draftComment.lineNumber}`
									: '')
							}
							onChangeComment={comment => {
								if (
									draftComment &&
									`${comment.filePath}:${comment.side === 'deletions' ? 'deletions' : 'file'}:${comment.lineNumber}` ===
										`${draftComment.filePath}:${draftComment.side === 'deletions' ? 'deletions' : 'file'}:${draftComment.lineNumber}`
								) {
									setDraftComment(comment)
								}
							}}
							onSaveComment={props.onSaveComment}
							onDeleteComment={props.onDeleteComment}
							onCloseDraft={() => setDraftComment(undefined)}
						/>
					)}
				/>
			</WorkerPoolContextProvider>
		</section>
	)
}
