import * as Pierre from '@pierre/diffs/react'

import {HIGHLIGHT_THEMES, resolveLanguage} from '#lib/shiki.ts'

const DIFF_CSS = `
	:host {
		--diffs-font-family: "JetBrains Mono Variable", monospace;
		--diffs-header-font-family: "JetBrains Mono Variable", monospace;
		--diffs-font-size: 11px;
		--diffs-line-height: 1.5;
		--muted: light-dark(oklch(0.967 0.001 286.375), oklch(0.274 0.006 286.033));
		--muted-hover: light-dark(oklch(0.92 0.004 286.32), oklch(0.35 0.006 286.033));
		--add: light-dark(#16a34a, #22c55e);
		--del: light-dark(#dc2626, #ef4444);
		user-select: text;
	}

	[data-column-content],
	[data-column-content] * {
		user-select: text;
	}

	[data-diffs-header],
	[data-diffs],
	[data-diffs-wrapper],
	[data-error-wrapper],
	[data-line] {
		background: transparent !important;
		--diffs-bg: transparent !important;
		padding: 0 !important;
		margin: 0 !important;
	}

	[data-column-number] {
		background: var(--muted) !important;
		position: sticky !important;
		left: 0 !important;
		z-index: 1 !important;
		user-select: none;
	}

	[data-line-type='change-addition'] [data-column-content] { background: color-mix(in srgb, var(--add) 8%, transparent) !important; }
	[data-line-type='change-deletion'] [data-column-content] { background: color-mix(in srgb, var(--del) 8%, transparent) !important; }

	[data-indicators='bars'] [data-line-type='change-addition'] [data-column-number]::before,
	[data-indicators='bars'] [data-line-type='change-deletion'] [data-column-number]::before {
		background: repeating-linear-gradient(to bottom, currentColor, currentColor 2px, transparent 2px, transparent 4px) !important;
	}
	[data-line-type='change-addition'] [data-column-number]::before { color: var(--add); }
	[data-line-type='change-deletion'] [data-column-number]::before { color: var(--del); }

	[data-separator='line-info'] [data-separator-wrapper], [data-expand-button], [data-separator-content] {
		border-radius: 0 !important;
	}

	[data-expand-button], [data-separator-content] { background: var(--muted) !important; }
	[data-expand-button]:hover { background: var(--muted-hover) !important; }
`

export function PatchDiff(props: {patch: string}) {
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

export function FileDiff(props: {filePath: string; old: string; new: string}) {
	return (
		<Pierre.MultiFileDiff
			oldFile={{name: props.filePath, contents: props.old, lang: resolveLanguage(props.filePath)}}
			newFile={{name: props.filePath, contents: props.new, lang: resolveLanguage(props.filePath)}}
			options={{
				overflow: 'scroll',
				themeType: 'system',
				unsafeCSS: DIFF_CSS,
				lineDiffType: 'char',
				diffStyle: 'unified',
				diffIndicators: 'bars',
				disableFileHeader: true,
				theme: HIGHLIGHT_THEMES,
				disableLineNumbers: false
			}}
		/>
	)
}
