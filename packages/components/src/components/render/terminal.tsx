import {Array, Match, Predicate, String, pipe} from 'effect'

import {ClipboardAddon} from '@xterm/addon-clipboard'
import {FitAddon} from '@xterm/addon-fit'
import {Unicode11Addon} from '@xterm/addon-unicode11'
import {WebLinksAddon} from '@xterm/addon-web-links'
import {WebglAddon} from '@xterm/addon-webgl'
import * as xterm from '@xterm/xterm'
import {useEffect, useImperativeHandle, useRef} from 'react'

import {Fallback} from '#components/fallbacks.tsx'
import {cn} from '#lib/utils.ts'

function cssColor(element: HTMLElement, value: string) {
	const probe = element.ownerDocument.createElement('span')
	probe.style.color = value
	probe.style.display = 'none'
	element.append(probe)
	probe.style.color = getComputedStyle(probe).color
	probe.remove()

	const canvas = element.ownerDocument.createElement('canvas')
	canvas.width = 1
	canvas.height = 1
	const context = canvas.getContext('2d')
	if (!context) return probe.style.color || value

	context.fillStyle = probe.style.color || value
	context.fillRect(0, 0, 1, 1)
	const [red, green, blue, alpha = 255] = context.getImageData(0, 0, 1, 1).data

	return alpha === 255 ? `rgb(${red}, ${green}, ${blue})` : `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`
}

export type TerminalHandle = {readonly reset: () => void; readonly write: (data: string, done?: () => void) => void}

export function Terminal({
	ref,
	...input
}: {
	readonly ref?: React.Ref<TerminalHandle>
	readonly className?: string
	readonly onData: (data: string) => void
	readonly onResize?: (size: {readonly cols: number; readonly rows: number}) => void
	readonly state?: string
}) {
	const elementRef = useRef<HTMLDivElement>(null)
	const terminalRef = useRef<xterm.Terminal>(null)
	const callbacksRef = useRef({onData: input.onData, onResize: input.onResize})
	const animationFrameRef = useRef<number | null>(null)
	const disposedRef = useRef(false)
	const lastSizeRef = useRef<{readonly cols: number; readonly rows: number} | null>(null)

	useEffect(() => {
		callbacksRef.current = {onData: input.onData, onResize: input.onResize}
	}, [input.onData, input.onResize])

	useImperativeHandle(
		ref,
		() => ({
			reset() {
				terminalRef.current?.reset()
			},
			write(data: string, done?: () => void) {
				if (Predicate.isNullish(terminalRef.current) || data === '') {
					done?.()
					return
				}

				terminalRef.current.write(data, done)
			}
		}),
		[]
	)

	useEffect(() => {
		if (Predicate.isNullish(elementRef.current)) return

		disposedRef.current = false
		const timeouts = Array.empty<ReturnType<typeof setTimeout>>()

		const style = getComputedStyle(elementRef.current)
		const rootStyle = getComputedStyle(elementRef.current.ownerDocument.documentElement)
		const fontSize = Number.parseFloat(style.fontSize)
		const fontWeight = Number.parseInt(style.fontWeight, 10)
		const background = cssColor(elementRef.current, pipe(rootStyle.getPropertyValue('--background'), String.trim))
		const selectionBackground = cssColor(elementRef.current, 'oklch(0.8214 0.1337 49.9802 / 30%)')
		const terminal = new xterm.Terminal({
			allowProposedApi: true,
			customGlyphs: true,
			fastScrollSensitivity: 10,
			fontFamily: style.fontFamily,
			fontSize: Number.isNaN(fontSize) ? 14 : fontSize,
			fontWeight: Number.isNaN(fontWeight) ? 400 : fontWeight,
			fontWeightBold: 600,
			letterSpacing: 0,
			lineHeight: 1,
			scrollSensitivity: 2,
			scrollback: 1_000,
			smoothScrollDuration: 0,
			theme: {background, selectionBackground, selectionInactiveBackground: selectionBackground}
		})
		const fit = new FitAddon()

		function alignScreen() {
			const screen = terminal.element?.querySelector<HTMLElement>('.xterm-screen')
			if (!screen) return

			if (Predicate.isNullish(elementRef.current)) return
			const left = Math.floor(Math.max(0, elementRef.current.clientWidth - screen.offsetWidth) / 2)
			const top = Math.floor(Math.max(0, elementRef.current.clientHeight - screen.offsetHeight) / 2)
			screen.style.left = `${left}px`
			screen.style.top = `${top}px`
		}

		function fitAndNotify() {
			if (
				disposedRef.current ||
				Predicate.isNullish(elementRef.current) ||
				elementRef.current.clientWidth < 8 ||
				elementRef.current.clientHeight < 8
			) {
				return
			}

			fit.fit()
			alignScreen()
			terminal.refresh(0, terminal.rows - 1)
			const nextSize = {cols: terminal.cols, rows: terminal.rows}
			if (nextSize.cols < 2 || nextSize.rows < 1) return
			if (
				Predicate.isNotNull(lastSizeRef.current) &&
				lastSizeRef.current.cols === nextSize.cols &&
				lastSizeRef.current.rows === nextSize.rows
			) {
				return
			}

			lastSizeRef.current = nextSize
			callbacksRef.current.onResize?.(nextSize)
		}

		function resize() {
			if (disposedRef.current) return
			if (Predicate.isNotNull(animationFrameRef.current)) cancelAnimationFrame(animationFrameRef.current)
			animationFrameRef.current = requestAnimationFrame(() => {
				animationFrameRef.current = null
				fitAndNotify()
			})
		}

		terminal.loadAddon(new ClipboardAddon())
		terminal.loadAddon(fit)
		terminal.loadAddon(new Unicode11Addon())
		terminal.unicode.activeVersion = '11'
		terminal.loadAddon(new WebLinksAddon())
		terminal.open(elementRef.current)
		terminal.focus()
		try {
			const webgl = new WebglAddon()
			terminal.loadAddon(webgl)
			webgl.onContextLoss(() => {
				webgl.dispose()
			})
		} catch {
			// Canvas renderer fallback.
		}
		terminal.onData(data => {
			callbacksRef.current.onData(data)
		})

		resize()
		for (const delay of [16, 50, 100, 250, 500]) {
			timeouts.push(setTimeout(resize, delay))
		}
		terminalRef.current = terminal

		function paste(event: ClipboardEvent) {
			const text = event.clipboardData?.getData('text/plain') ?? event.clipboardData?.getData('text') ?? ''
			if (text === '') return

			event.preventDefault()
			event.stopPropagation()
			terminal.paste(text)
		}

		terminal.element?.addEventListener('paste', paste, {capture: true})

		const observer = new ResizeObserver(resize)
		observer.observe(elementRef.current)
		if (elementRef.current.parentElement) observer.observe(elementRef.current.parentElement)

		elementRef.current.ownerDocument.defaultView?.addEventListener('resize', resize)
		void elementRef.current.ownerDocument.fonts.ready.then(resize)

		return () => {
			disposedRef.current = true
			terminalRef.current = null
			for (const timeout of timeouts) clearTimeout(timeout)
			if (Predicate.isNotNull(animationFrameRef.current)) cancelAnimationFrame(animationFrameRef.current)
			animationFrameRef.current = null
			terminal.element?.ownerDocument.defaultView?.removeEventListener('resize', resize)
			terminal.element?.removeEventListener('paste', paste, {capture: true})
			observer.disconnect()
			terminal.dispose()
		}
	}, [])
	const terminalError = pipe(
		Match.value(input.state),
		Match.when('exited', () => 'Terminal exited.'),
		Match.when('failed', () => 'Terminal failed.'),
		Match.when('stopped', () => 'Terminal stopped.'),
		Match.orElse(() => null)
	)

	return (
		<div className={cn('terminal-renderer relative h-full min-h-0 w-full min-w-0 overflow-hidden', input.className)}>
			<div ref={elementRef} className="absolute inset-0 h-full min-h-0 w-full min-w-0 overflow-hidden" />
			{Predicate.isNotNull(terminalError) && (
				<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
					<Fallback message={terminalError} />
				</div>
			)}
		</div>
	)
}
