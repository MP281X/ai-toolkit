import {Array, Match, String, pipe} from 'effect'

import {ClipboardAddon} from '@xterm/addon-clipboard'
import {FitAddon} from '@xterm/addon-fit'
import {Unicode11Addon} from '@xterm/addon-unicode11'
import {WebLinksAddon} from '@xterm/addon-web-links'
import {WebglAddon} from '@xterm/addon-webgl'
import * as XTerm from '@xterm/xterm'
import {forwardRef, useEffect, useImperativeHandle, useRef} from 'react'

import {Fallback} from '#components/fallbacks.tsx'
import {cn} from '#lib/utils.ts'

function cssColor(element: HTMLElement, value: string) {
	const probe = element.ownerDocument.createElement('span')
	probe.style.color = value
	probe.style.display = 'none'
	element.append(probe)
	const color = getComputedStyle(probe).color || value

	const canvas = element.ownerDocument.createElement('canvas')
	canvas.width = 1
	canvas.height = 1
	const context = canvas.getContext('2d')
	if (!context) {
		probe.remove()
		return color
	}

	context.fillStyle = color
	probe.remove()
	context.fillRect(0, 0, 1, 1)
	const [red, green, blue, alpha = 255] = context.getImageData(0, 0, 1, 1).data

	return alpha === 255 ? `rgb(${red}, ${green}, ${blue})` : `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`
}

export type TerminalHandle = {readonly reset: () => void; readonly write: (data: string, done?: () => void) => void}

export const Terminal = forwardRef<
	TerminalHandle,
	{
		readonly className?: string
		readonly onData: (data: string) => void
		readonly onReady?: () => void
		readonly onResize?: (size: {readonly cols: number; readonly rows: number}) => void
		readonly state?: 'idle' | 'starting' | 'running' | 'waiting' | 'stopped' | 'exited' | 'failed'
	}
>(function Terminal(input, ref) {
	const elementRef = useRef<HTMLDivElement>(null)
	const terminalRef = useRef<XTerm.Terminal>(null)
	const callbacksRef = useRef({onData: input.onData, onReady: input.onReady, onResize: input.onResize})
	const inputBufferRef = useRef('')
	const inputFlushRef = useRef<ReturnType<typeof setTimeout>>(null)

	callbacksRef.current = {onData: input.onData, onReady: input.onReady, onResize: input.onResize}
	useImperativeHandle(
		ref,
		() => ({
			reset() {
				terminalRef.current?.reset()
			},
			write(data: string, done?: () => void) {
				if (terminalRef.current === null || data === '') {
					done?.()
					return
				}

				terminalRef.current.write(data, done)
			}
		}),
		[]
	)

	useEffect(() => {
		if (elementRef.current === null) return

		return initializeTerminal(elementRef.current)
	}, [])

	function initializeTerminal(container: HTMLDivElement) {
		const lifecycle = {animationFrame: 0, disposed: false, lastSize: {cols: 0, rows: 0}}

		function flushInput() {
			inputFlushRef.current = null
			if (inputBufferRef.current === '') return

			callbacksRef.current.onData(inputBufferRef.current)
			inputBufferRef.current = ''
		}

		function pushInput(data: string) {
			inputBufferRef.current += data
			if (inputFlushRef.current) return

			inputFlushRef.current = setTimeout(flushInput, 4)
		}

		const style = getComputedStyle(container)
		const rootStyle = getComputedStyle(container.ownerDocument.documentElement)
		const fontSize = Number.parseFloat(style.fontSize)
		const fontWeight = Number.parseInt(style.fontWeight, 10)
		const background = cssColor(container, String.trim(rootStyle.getPropertyValue('--background')))
		const selectionBackground = cssColor(container, 'oklch(0.8214 0.1337 49.9802 / 30%)')
		const terminal = new XTerm.Terminal({
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
			scrollback: 20_000,
			smoothScrollDuration: 0,
			theme: {background, selectionBackground, selectionInactiveBackground: selectionBackground}
		})
		Object.assign(terminal.options, {scrollbar: {showScrollbar: false}})
		const fit = new FitAddon()

		function alignScreen() {
			const screen = terminal.element?.querySelector<HTMLElement>('.xterm-screen')
			if (!screen) return

			const left = Math.floor(Math.max(0, container.clientWidth - screen.offsetWidth) / 2)
			const top = Math.floor(Math.max(0, container.clientHeight - screen.offsetHeight) / 2)
			screen.style.left = `${left}px`
			screen.style.top = `${top}px`
		}

		function fitAndNotify() {
			if (lifecycle.disposed || container.clientWidth < 8 || container.clientHeight < 8) return

			fit.fit()
			alignScreen()
			terminal.refresh(0, terminal.rows - 1)
			if (terminal.cols < 2 || terminal.rows < 1) return
			if (lifecycle.lastSize.cols === terminal.cols && lifecycle.lastSize.rows === terminal.rows) return

			lifecycle.lastSize = {cols: terminal.cols, rows: terminal.rows}
			callbacksRef.current.onResize?.({cols: terminal.cols, rows: terminal.rows})
		}

		function resize() {
			if (lifecycle.disposed) return
			if (lifecycle.animationFrame !== 0) cancelAnimationFrame(lifecycle.animationFrame)
			lifecycle.animationFrame = requestAnimationFrame(() => {
				lifecycle.animationFrame = 0
				fitAndNotify()
			})
		}

		terminal.loadAddon(new ClipboardAddon())
		terminal.loadAddon(fit)
		terminal.loadAddon(new Unicode11Addon())
		terminal.unicode.activeVersion = '11'
		terminal.loadAddon(new WebLinksAddon())
		terminal.open(container)
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
		terminal.onData(pushInput)

		resize()
		const timeouts = Array.map([16, 50, 100, 250, 500], delay => setTimeout(resize, delay))
		terminalRef.current = terminal
		callbacksRef.current.onReady?.()

		function paste(event: ClipboardEvent) {
			const text = event.clipboardData?.getData('text/plain') ?? event.clipboardData?.getData('text') ?? ''
			if (text === '') return

			event.preventDefault()
			event.stopPropagation()
			terminal.paste(text)
		}

		container.addEventListener('paste', paste, {capture: true})

		const observer = new ResizeObserver(resize)
		observer.observe(container)
		if (container.parentElement) observer.observe(container.parentElement)

		container.ownerDocument.defaultView?.addEventListener('resize', resize)
		void container.ownerDocument.fonts.ready.then(resize)

		return () => {
			lifecycle.disposed = true
			terminalRef.current = null
			inputBufferRef.current = ''
			if (inputFlushRef.current) clearTimeout(inputFlushRef.current)
			inputFlushRef.current = null
			for (const timeout of timeouts) clearTimeout(timeout)
			if (lifecycle.animationFrame !== 0) cancelAnimationFrame(lifecycle.animationFrame)
			container.ownerDocument.defaultView?.removeEventListener('resize', resize)
			container.removeEventListener('paste', paste, {capture: true})
			observer.disconnect()
			terminal.dispose()
		}
	}
	const terminalError = pipe(
		Match.value(input.state),
		Match.when('exited', () => 'Terminal exited.'),
		Match.when('failed', () => 'Terminal failed.'),
		Match.when('stopped', () => 'Terminal stopped.'),
		Match.orElse(() => {})
	)

	return (
		<div className={cn('terminal-renderer relative h-full min-h-0 w-full min-w-0 overflow-hidden', input.className)}>
			<div ref={elementRef} className="absolute inset-0 h-full min-h-0 w-full min-w-0 overflow-hidden" />
			{terminalError !== undefined && (
				<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
					<Fallback message={terminalError} />
				</div>
			)}
		</div>
	)
})
