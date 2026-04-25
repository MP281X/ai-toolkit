import {pipe, String} from 'effect'

import mermaid from 'mermaid'
import {useEffect, useId, useRef, useState} from 'react'

import {cn} from '#lib/utils.ts'

const THEMES = {
	light: {
		mermaid: {
			primaryColor: '#f97316',
			primaryTextColor: '#18181b',
			primaryBorderColor: '#e4e4e7',
			secondaryColor: '#f4f4f5',
			secondaryTextColor: '#27272a',
			secondaryBorderColor: '#e4e4e7',
			tertiaryColor: '#f4f4f5',
			tertiaryTextColor: '#18181b',
			tertiaryBorderColor: '#e4e4e7',
			lineColor: '#71717a',
			textColor: '#18181b',
			mainBkg: '#ffffff',
			nodeBorder: '#e4e4e7',
			clusterBkg: '#ffffff',
			clusterBorder: '#e4e4e7',
			titleColor: '#18181b',
			edgeLabelBackground: '#ffffff',
			nodeTextColor: '#18181b'
		},
		sourceFill: '#ffedd5',
		sourceStroke: '#f97316',
		sourceText: '#18181b',
		downstreamFill: '#f4f4f5',
		downstreamStroke: '#71717a',
		downstreamText: '#18181b'
	},
	dark: {
		mermaid: {
			primaryColor: '#fb923c',
			primaryTextColor: '#1c1917',
			primaryBorderColor: '#3f3f46',
			secondaryColor: '#3f3f46',
			secondaryTextColor: '#fafafa',
			secondaryBorderColor: '#3f3f46',
			tertiaryColor: '#52525b',
			tertiaryTextColor: '#fafafa',
			tertiaryBorderColor: '#3f3f46',
			lineColor: '#a1a1aa',
			textColor: '#fafafa',
			mainBkg: '#18181b',
			nodeBorder: '#3f3f46',
			clusterBkg: '#27272a',
			clusterBorder: '#3f3f46',
			titleColor: '#fafafa',
			edgeLabelBackground: '#18181b',
			nodeTextColor: '#fafafa'
		},
		sourceFill: '#7c2d12',
		sourceStroke: '#fb923c',
		sourceText: '#fafafa',
		downstreamFill: '#27272a',
		downstreamStroke: '#a1a1aa',
		downstreamText: '#fafafa'
	}
}

const MERMAID_CSS = `
	:host {
		display: block;
	}

	.mermaid-container {
		display: flex;
		justify-content: center;
	}

	.mermaid-container svg {
		max-width: 100%;
		height: auto;
	}

	.mermaid-container svg .mermaid-source rect,
	.mermaid-container svg .mermaid-source polygon,
	.mermaid-container svg .mermaid-source path,
	.mermaid-container svg .mermaid-source circle,
	.mermaid-container svg .mermaid-source ellipse {
		fill: var(--mermaid-source-fill) !important;
		stroke: var(--mermaid-source-stroke) !important;
		stroke-width: 2px !important;
	}

	.mermaid-container svg .mermaid-downstream rect,
	.mermaid-container svg .mermaid-downstream polygon,
	.mermaid-container svg .mermaid-downstream path,
	.mermaid-container svg .mermaid-downstream circle,
	.mermaid-container svg .mermaid-downstream ellipse {
		fill: var(--mermaid-downstream-fill) !important;
		stroke: var(--mermaid-downstream-stroke) !important;
		stroke-width: 2px !important;
	}

	.mermaid-container svg .mermaid-source .label,
	.mermaid-container svg .mermaid-source .nodeLabel,
	.mermaid-container svg .mermaid-source text,
	.mermaid-container svg .mermaid-source span,
	.mermaid-container svg .mermaid-source p {
		color: var(--mermaid-source-text) !important;
		fill: var(--mermaid-source-text) !important;
	}

	.mermaid-container svg .mermaid-downstream .label,
	.mermaid-container svg .mermaid-downstream .nodeLabel,
	.mermaid-container svg .mermaid-downstream text,
	.mermaid-container svg .mermaid-downstream span,
	.mermaid-container svg .mermaid-downstream p {
		color: var(--mermaid-downstream-text) !important;
		fill: var(--mermaid-downstream-text) !important;
	}
`

let renderContainer: HTMLDivElement | null = null

export function Mermaid(props: {children: string; className?: string}) {
	const id = pipe(useId(), String.replaceAll(':', '_'))
	const hostRef = useRef<HTMLDivElement>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!hostRef.current) return

		let cancelled = false
		const theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? THEMES.dark : THEMES.light
		if (!hostRef.current.shadowRoot) hostRef.current.attachShadow({mode: 'open'})
		const container =
			renderContainer ??
			(() => {
				const el = document.createElement('div')
				el.style.position = 'absolute'
				el.style.width = '0'
				el.style.height = '0'
				el.style.overflow = 'hidden'
				el.style.pointerEvents = 'none'
				el.setAttribute('aria-hidden', 'true')
				document.body.appendChild(el)
				renderContainer = el
				return el
			})()

		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'loose',
			fontFamily: 'JetBrains Mono Variable, monospace',
			theme: 'base',
			themeVariables: theme.mermaid
		})

		void (async () => {
			try {
				const result = await mermaid.render(`mermaid_${id}`, props.children, container)
				if (cancelled || !hostRef.current?.shadowRoot) return
				hostRef.current.shadowRoot.innerHTML = `<style>${MERMAID_CSS}</style><div class="mermaid-container" style="--mermaid-source-fill:${theme.sourceFill};--mermaid-source-stroke:${theme.sourceStroke};--mermaid-source-text:${theme.sourceText};--mermaid-downstream-fill:${theme.downstreamFill};--mermaid-downstream-stroke:${theme.downstreamStroke};--mermaid-downstream-text:${theme.downstreamText}">${result.svg}</div>`
				setError(null)
			} catch (err) {
				if (cancelled) return
				setError(String.String(err))
			}
		})()

		return () => {
			cancelled = true
		}
	}, [props.children, id])

	if (error) {
		return (
			<pre
				className={cn(
					'whitespace-pre-wrap border border-border bg-muted/30 px-3 py-2 text-destructive text-sm',
					props.className
				)}
			>
				{error}
			</pre>
		)
	}

	return <div ref={hostRef} className={cn('overflow-hidden', props.className)} />
}
