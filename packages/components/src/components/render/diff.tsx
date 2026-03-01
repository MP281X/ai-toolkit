import {parseDiffFromFile} from '@pierre/diffs'
import * as Pierre from '@pierre/diffs/react'

import {HIGHLIGHT_THEMES, resolveLanguage} from '#lib/shiki.ts'

const DIFF_CSS = `
	:host {
		--diffs-font-family: "JetBrains Mono Variable", monospace;
		--diffs-header-font-family: "JetBrains Mono Variable", monospace;
		--diffs-font-size: 11px;
		--diffs-line-height: 1.5;
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

export function PatchDiff(props: {
	filePath: string
	old: string
	new: string
	onStage?: () => void
	onUnstage?: () => void
	onDiscard?: () => void
}) {
	const fileDiff = parseDiffFromFile(
		{name: props.filePath, contents: props.old},
		{name: props.filePath, contents: props.new}
	)
	return (
		<Pierre.FileDiff
			fileDiff={fileDiff}
			options={{
				overflow: 'scroll',
				themeType: 'system',
				unsafeCSS: DIFF_CSS,
				diffStyle: 'unified',
				lineDiffType: 'char',
				diffIndicators: 'bars',
				disableFileHeader: true,
				theme: HIGHLIGHT_THEMES,
				disableLineNumbers: false
			}}
		/>
	)
}

export function FullFile(props: {filePath: string; content: string}) {
	return (
		<Pierre.File
			file={{name: props.filePath, contents: props.content, lang: resolveLanguage(props.filePath)}}
			options={{
				overflow: 'scroll',
				themeType: 'system',
				unsafeCSS: DIFF_CSS,
				disableFileHeader: true,
				theme: HIGHLIGHT_THEMES,
				disableLineNumbers: false
			}}
		/>
	)
}
