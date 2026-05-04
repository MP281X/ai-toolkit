import {Array, pipe, String} from 'effect'

import type {AnnotationSide} from '@pierre/diffs'
import {getSingularPatch} from '@pierre/diffs'
import {File, PatchDiff as PierrePatchDiff, Virtualizer, WorkerPoolContextProvider} from '@pierre/diffs/react'
import {useHotkey} from '@tanstack/react-hotkeys'
import {useRef, useState} from 'react'

import {Button} from '#components/ui/button.tsx'
import {Textarea} from '#components/ui/textarea.tsx'
import {HIGHLIGHT_THEMES, resolveLanguage} from '#lib/shiki.ts'

function diffCss() {
	return `
	:host {
		--diffs-font-family: "JetBrains Mono Variable", monospace;
		--diffs-header-font-family: "JetBrains Mono Variable", monospace;
		--diffs-font-size: 14px;
		--diffs-line-height: 1.5;
		--comment-button-bg: light-dark(oklch(1 0 0), oklch(0.22 0.007 285.885));
		--comment-button-bg-hover: light-dark(oklch(0.967 0.001 286.375), oklch(0.31 0.007 286.033));
		--comment-button-fg: light-dark(oklch(0.552 0.016 285.938), oklch(0.75 0.012 286.067));
		--comment-button-fg-hover: light-dark(oklch(0.141 0.005 285.823), oklch(0.965 0.002 285.823));
		--comment-button-border: light-dark(oklch(0.92 0.004 286.32), oklch(1 0 0 / 12%));
		--gutter: light-dark(oklch(0.967 0.001 286.375), oklch(0.22 0.007 285.885));
		--muted: light-dark(oklch(0.967 0.001 286.375), oklch(0.25 0.006 286.033));
		--border: light-dark(oklch(0.92 0.004 286.32), oklch(1 0 0 / 12%));
		--diffs-addition-color-override: light-dark(#16a34a, #22c55e);
		--diffs-deletion-color-override: light-dark(oklch(0.577 0.245 27.325), oklch(0.704 0.191 22.216));
		--diffs-bg-separator-override: var(--gutter);
		--diffs-gap-block: 0px;
		--diffs-gap-inline: 0px;
		--diffs-gap-fallback: 0px;
		user-select: text;
	}

	pre {
		--diffs-bg: light-dark(oklch(1 0 0), oklch(0.18 0.006 285.885)) !important;
		background-color: transparent !important;
		overflow-x: auto !important;
	}

	[data-code] {
		padding-top: 0 !important;
		padding-bottom: 0 !important;
	}

	[data-content-buffer],
	[data-gutter-buffer] {
		display: none !important;
	}

	[data-column-content],
	[data-column-content] * {
		user-select: text;
	}

	[data-gutter] {
		background: var(--gutter) !important;
	}

	[data-column-number] {
		background: var(--gutter) !important;
		position: sticky !important;
		left: 0 !important;
		z-index: 1 !important;
		user-select: none;
	}

	[data-utility-button] {
		background-color: var(--comment-button-bg) !important;
		border: 1px solid var(--comment-button-border) !important;
		border-radius: 0 !important;
		box-sizing: border-box !important;
		color: var(--comment-button-fg) !important;
	}

	[data-utility-button]:hover {
		background-color: var(--comment-button-bg-hover) !important;
		color: var(--comment-button-fg-hover) !important;
	}

	[data-utility-button]:focus-visible {
		outline: 1px solid var(--comment-button-fg-hover) !important;
		outline-offset: 1px !important;
	}

	[data-utility-button] [data-icon] {
		height: 12px !important;
		width: 12px !important;
	}

	[data-separator],
	[data-separator='line-info'],
	[data-separator='line-info-basic'],
	[data-separator='metadata'],
	[data-separator='simple'] {
		background: var(--gutter) !important;
		margin-block: 0 !important;
		padding: 0 !important;
	}

	[data-separator-content],
	[data-separator-wrapper],
	[data-expand-button],
	[data-separator-wrapper] [data-expand-up],
	[data-separator-wrapper] [data-expand-down],
	[data-separator-wrapper] [data-expand-both] {
		border-radius: 0 !important;
		overflow: visible !important;
		background-clip: border-box !important;
	}

	[data-separator-wrapper] {
		background: var(--gutter) !important;
	}

	[data-expand-button] {
		background: var(--gutter) !important;
		border: none !important;
	}

	[data-expand-button] [data-icon] {
		width: 12px !important;
		height: 12px !important;
	}
`
}

const PATCH_DIFF_OPTIONS = {
	overflow: 'scroll',
	themeType: 'system',
	unsafeCSS: diffCss(),
	diffStyle: 'unified',
	lineDiffType: 'none',
	diffIndicators: 'bars',
	disableFileHeader: true,
	theme: HIGHLIGHT_THEMES,
	disableLineNumbers: false
} as const

const VIRTUALIZER_CONFIG = {
	overscrollSize: 600,
	intersectionObserverMargin: 1200
} as const

function CommentAnnotation(props: {
	comment: {id: string; filePath: string; lineNumber: number; side?: AnnotationSide; body: string}
	onSaveComment?: (
		comment: {id: string; filePath: string; lineNumber: number; side?: AnnotationSide; body: string},
		body: string
	) => void
	onDeleteComment?: (comment: {
		id: string
		filePath: string
		lineNumber: number
		side?: AnnotationSide
		body: string
	}) => void
}) {
	const inputRef = useRef<HTMLTextAreaElement>(null)
	function commitDraft(body: string) {
		const nextBody = pipe(body, String.trim)

		if (String.isEmpty(nextBody)) {
			props.onDeleteComment?.(props.comment)
			return
		}

		props.onSaveComment?.(props.comment, nextBody)
	}

	return (
		<div className="box-border w-full max-w-full border-border border-y bg-card px-3 py-1.5 text-foreground text-xs">
			{String.isEmpty(props.comment.body) ? (
				<Textarea
					autoFocus
					ref={inputRef}
					placeholder="Tell the agent what is wrong..."
					className="min-h-10 border-0 bg-transparent p-0 text-xs leading-relaxed focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
					onBlur={event => commitDraft(event.currentTarget.value)}
					onKeyDown={event => {
						if (event.key === 'Escape') {
							event.preventDefault()
							props.onDeleteComment?.(props.comment)
						}

						if (event.key === 'Enter' && !event.shiftKey) {
							event.preventDefault()
							commitDraft(event.currentTarget.value)
						}
					}}
				/>
			) : (
				<div className="flex items-start justify-between gap-3">
					<div className="whitespace-pre-wrap leading-relaxed">{props.comment.body}</div>
					<Button type="button" variant="ghost" size="xs" onClick={() => props.onDeleteComment?.(props.comment)}>
						Delete
					</Button>
				</div>
			)}
		</div>
	)
}

function PatchResultContent(props: {
	filePath: string
	patch: string
	comments?: readonly Parameters<typeof CommentAnnotation>[0]['comment'][]
	onCreateComment?: (input: {filePath: string; lineNumber: number}) => void
	onSaveComment?: (comment: Parameters<typeof CommentAnnotation>[0]['comment'], body: string) => void
	onDeleteComment?: (comment: Parameters<typeof CommentAnnotation>[0]['comment']) => void
}) {
	const fileDiff = getSingularPatch(props.patch)
	const content = pipe(
		fileDiff.hunks,
		Array.flatMap(hunk => hunk.hunkContent),
		Array.flatMap(part =>
			pipe(
				fileDiff.additionLines,
				Array.drop(part.additionLineIndex),
				Array.take(part.type === 'context' ? part.lines : part.additions)
			)
		),
		Array.join(''),
		String.trim
	)
	const lineAnnotations = pipe(
		props.comments ?? Array.empty<Parameters<typeof CommentAnnotation>[0]['comment']>(),
		Array.filter(comment => comment.side !== 'deletions'),
		Array.map(comment => ({lineNumber: comment.lineNumber, metadata: comment}))
	)
	const hasOpenCommentForm = pipe(
		props.comments ?? Array.empty<Parameters<typeof CommentAnnotation>[0]['comment']>(),
		Array.some(comment => String.isEmpty(comment.body))
	)

	return (
		<File
			file={{
				name: props.filePath,
				contents: fileDiff.type === 'deleted' || String.isEmpty(content) ? '' : content,
				lang: resolveLanguage(props.filePath)
			}}
			options={{
				overflow: 'scroll',
				themeType: 'system',
				unsafeCSS: diffCss(),
				disableFileHeader: true,
				theme: HIGHLIGHT_THEMES,
				disableLineNumbers: false,
				enableGutterUtility: !hasOpenCommentForm,
				onGutterUtilityClick: range =>
					props.onCreateComment?.({filePath: props.filePath, lineNumber: Math.max(range.start, range.end)})
			}}
			lineAnnotations={lineAnnotations}
			renderAnnotation={annotation => (
				<CommentAnnotation
					comment={annotation.metadata}
					onSaveComment={props.onSaveComment}
					onDeleteComment={props.onDeleteComment}
				/>
			)}
		/>
	)
}

export function PatchReview(props: {
	filePath: string
	patch: string
	comments?: readonly Parameters<typeof CommentAnnotation>[0]['comment'][]
	onCreateComment?: (input: {filePath: string; lineNumber: number; side?: AnnotationSide}) => void
	onSaveComment?: (comment: Parameters<typeof CommentAnnotation>[0]['comment'], body: string) => void
	onDeleteComment?: (comment: Parameters<typeof CommentAnnotation>[0]['comment']) => void
}) {
	const containerRef = useRef<HTMLFieldSetElement>(null)
	const [mode, setMode] = useState<'diff' | 'final'>('diff')
	const [hovered, setHovered] = useState(false)
	const lineAnnotations = pipe(
		props.comments ?? Array.empty<Parameters<typeof CommentAnnotation>[0]['comment']>(),
		Array.flatMap(comment =>
			comment.side ? [{side: comment.side, lineNumber: comment.lineNumber, metadata: comment}] : Array.empty()
		)
	)
	const hasOpenCommentForm = pipe(
		props.comments ?? Array.empty<Parameters<typeof CommentAnnotation>[0]['comment']>(),
		Array.some(comment => String.isEmpty(comment.body))
	)

	useHotkey('Tab', event => {
		if (!(hovered || containerRef.current === document.activeElement)) {
			return
		}

		event.preventDefault()
		setMode(current => (current === 'diff' ? 'final' : 'diff'))
	})

	return (
		<fieldset
			ref={containerRef}
			className="block h-full min-h-0 w-full appearance-none border-0 bg-transparent p-0 text-left outline-none"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<WorkerPoolContextProvider
				poolOptions={{
					workerFactory: () => new Worker(new URL('@pierre/diffs/worker/worker.js', import.meta.url), {type: 'module'}),
					poolSize: Math.max(2, Math.min(6, Math.floor(Math.max(1, navigator.hardwareConcurrency || 4) / 2))),
					totalASTLRUCacheSize: 240
				}}
				highlighterOptions={{
					theme: HIGHLIGHT_THEMES,
					lineDiffType: 'none',
					tokenizeMaxLineLength: 1_000
				}}
			>
				<Virtualizer className="h-full min-h-0 overflow-auto" config={VIRTUALIZER_CONFIG}>
					{mode === 'diff' ? (
						<PierrePatchDiff
							patch={props.patch}
							options={{
								...PATCH_DIFF_OPTIONS,
								enableGutterUtility: !hasOpenCommentForm,
								onGutterUtilityClick: range =>
									props.onCreateComment?.({
										filePath: props.filePath,
										lineNumber: Math.max(range.start, range.end),
										side: range.endSide ?? range.side
									})
							}}
							lineAnnotations={lineAnnotations}
							renderAnnotation={annotation => (
								<CommentAnnotation
									comment={annotation.metadata}
									onSaveComment={props.onSaveComment}
									onDeleteComment={props.onDeleteComment}
								/>
							)}
						/>
					) : (
						<PatchResultContent
							filePath={props.filePath}
							patch={props.patch}
							comments={props.comments}
							onCreateComment={props.onCreateComment}
							onSaveComment={props.onSaveComment}
							onDeleteComment={props.onDeleteComment}
						/>
					)}
				</Virtualizer>
			</WorkerPoolContextProvider>
		</fieldset>
	)
}

export function PatchDiff(props: {patch: string}) {
	return (
		<WorkerPoolContextProvider
			poolOptions={{
				workerFactory: () => new Worker(new URL('@pierre/diffs/worker/worker.js', import.meta.url), {type: 'module'}),
				poolSize: Math.max(2, Math.min(6, Math.floor(Math.max(1, navigator.hardwareConcurrency || 4) / 2))),
				totalASTLRUCacheSize: 240
			}}
			highlighterOptions={{
				theme: HIGHLIGHT_THEMES,
				lineDiffType: 'none',
				tokenizeMaxLineLength: 1_000
			}}
		>
			<Virtualizer className="h-full min-h-0 overflow-auto" config={VIRTUALIZER_CONFIG}>
				<PierrePatchDiff patch={props.patch} options={PATCH_DIFF_OPTIONS} />
			</Virtualizer>
		</WorkerPoolContextProvider>
	)
}

export function PatchResult(props: {filePath: string; patch: string}) {
	return (
		<WorkerPoolContextProvider
			poolOptions={{
				workerFactory: () => new Worker(new URL('@pierre/diffs/worker/worker.js', import.meta.url), {type: 'module'}),
				poolSize: Math.max(2, Math.min(6, Math.floor(Math.max(1, navigator.hardwareConcurrency || 4) / 2))),
				totalASTLRUCacheSize: 240
			}}
			highlighterOptions={{
				theme: HIGHLIGHT_THEMES,
				lineDiffType: 'none',
				tokenizeMaxLineLength: 1_000
			}}
		>
			<Virtualizer className="h-full min-h-0 overflow-auto" config={VIRTUALIZER_CONFIG}>
				<PatchResultContent filePath={props.filePath} patch={props.patch} />
			</Virtualizer>
		</WorkerPoolContextProvider>
	)
}
