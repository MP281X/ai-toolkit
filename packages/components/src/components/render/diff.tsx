import * as Pierre from '@pierre/diffs/react'

import {HIGHLIGHT_THEMES, resolveLanguage} from '#lib/shiki.ts'

const DIFF_CSS = `
	:host {
		--diffs-font-family: "JetBrains Mono Variable", monospace;
		--diffs-header-font-family: "JetBrains Mono Variable", monospace;
		--diffs-font-size: 11px;
		--diffs-line-height: 1.5;
		--muted: light-dark(oklch(0.967 0.001 286.375), oklch(0.25 0.006 286.033));
		--border: light-dark(oklch(0.92 0.004 286.32), oklch(1 0 0 / 12%));
		--add: light-dark(#16a34a, #22c55e);
		--del: light-dark(#dc2626, #ef4444);
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
		background: var(--muted) !important;
	}

	[data-column-number] {
		background: var(--muted) !important;
		position: sticky !important;
		left: 0 !important;
		z-index: 1 !important;
		user-select: none;
	}

	[data-separator='line-info'],
	[data-separator='line-info-basic'],
	[data-separator='metadata'] {
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
		border-top: 1px solid var(--border) !important;
		border-bottom: 1px solid var(--border) !important;
		background: var(--muted) !important;
	}

	[data-expand-button] {
		background: var(--muted) !important;
	}

	[data-line-type='change-addition'] [data-column-content] { background: color-mix(in srgb, var(--add) 8%, transparent) !important; }
	[data-line-type='change-deletion'] [data-column-content] { background: color-mix(in srgb, var(--del) 8%, transparent) !important; }

	[data-indicators='bars'] [data-line-type='change-addition'] [data-column-number]::before,
	[data-indicators='bars'] [data-line-type='change-deletion'] [data-column-number]::before {
		background: repeating-linear-gradient(to bottom, currentColor, currentColor 2px, transparent 2px, transparent 4px) !important;
	}
	[data-line-type='change-addition'] [data-column-number]::before { color: var(--add); }
	[data-line-type='change-deletion'] [data-column-number]::before { color: var(--del); }
`

export function PatchDiff(props: {
	patch: string
	onStage?: () => void
	onUnstage?: () => void
	onDiscard?: () => void
}) {
	return (
		<Pierre.PatchDiff
			patch={props.patch}
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
