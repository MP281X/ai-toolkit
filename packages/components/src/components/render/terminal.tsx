import {Match, pipe} from 'effect'

import {ClipboardAddon} from '@xterm/addon-clipboard'
import {FitAddon} from '@xterm/addon-fit'
import {Unicode11Addon} from '@xterm/addon-unicode11'
import {WebLinksAddon} from '@xterm/addon-web-links'
import {WebglAddon} from '@xterm/addon-webgl'
import {Terminal as XTerm} from '@xterm/xterm'
import {forwardRef, useEffect, useImperativeHandle, useRef} from 'react'

import {Fallback} from '#components/fallbacks.tsx'
import {cn} from '#lib/utils.ts'

type TerminalStatusState = 'idle' | 'starting' | 'running' | 'waiting' | 'stopped' | 'exited' | 'failed'

function cssColor(element: HTMLElement, value: string) {
	const probe = element.ownerDocument.createElement('span')
	probe.style.color = value
	probe.style.display = 'none'
	element.append(probe)
	const resolved = getComputedStyle(probe).color
	probe.remove()

	const canvas = element.ownerDocument.createElement('canvas')
	canvas.width = 1
	canvas.height = 1
	const context = canvas.getContext('2d')
	if (!context) return resolved || value

	context.fillStyle = resolved || value
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
		readonly onResize?: (size: {readonly cols: number; readonly rows: number}) => void
		readonly state?: TerminalStatusState
	}
>(function Terminal(input, ref) {
	const elementRef = useRef<HTMLDivElement>(null)
	const terminalRef = useRef<XTerm>(null)
	const callbacksRef = useRef({onData: input.onData, onResize: input.onResize})
	const inputBufferRef = useRef('')
	const inputFlushRef = useRef<ReturnType<typeof setTimeout>>(null)

	callbacksRef.current = {onData: input.onData, onResize: input.onResize}
	useImperativeHandle(
		ref,
		() => ({
			reset() {
				terminalRef.current?.reset()
			},
			write(data: string, done?: () => void) {
				const terminal = terminalRef.current
				if (!terminal || data === '') {
					done?.()
					return
				}

				terminal.write(data, done)
			}
		}),
		[]
	)

	useEffect(() => {
		const element = elementRef.current
		if (!element) return

		const container = element
		const timeouts: ReturnType<typeof setTimeout>[] = []
		let animationFrame: number | undefined
		let disposed = false
		let lastSize: {readonly cols: number; readonly rows: number} | undefined

		function flushInput() {
			inputFlushRef.current = null
			const data = inputBufferRef.current
			if (data === '') return

			inputBufferRef.current = ''
			callbacksRef.current.onData(data)
		}

		function pushInput(data: string) {
			inputBufferRef.current += data
			if (inputFlushRef.current) return

			inputFlushRef.current = setTimeout(flushInput, 4)
		}

		const style = getComputedStyle(element)
		const rootStyle = getComputedStyle(element.ownerDocument.documentElement)
		const fontSize = Number.parseFloat(style.fontSize)
		const fontWeight = Number.parseInt(style.fontWeight, 10)
		const background = cssColor(element, rootStyle.getPropertyValue('--background').trim())
		const selectionBackground = cssColor(element, 'oklch(0.8214 0.1337 49.9802 / 30%)')
		const terminal = new XTerm({
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
			if (disposed || container.clientWidth < 8 || container.clientHeight < 8) return

			fit.fit()
			alignScreen()
			terminal.refresh(0, terminal.rows - 1)
			const nextSize = {cols: terminal.cols, rows: terminal.rows}
			if (nextSize.cols < 2 || nextSize.rows < 1) return
			if (lastSize?.cols === nextSize.cols && lastSize.rows === nextSize.rows) return

			lastSize = nextSize
			callbacksRef.current.onResize?.(nextSize)
		}

		function resize() {
			if (disposed) return
			if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
			animationFrame = requestAnimationFrame(() => {
				animationFrame = undefined
				fitAndNotify()
			})
		}

		terminal.loadAddon(new ClipboardAddon())
		terminal.loadAddon(fit)
		terminal.loadAddon(new Unicode11Addon())
		terminal.unicode.activeVersion = '11'
		terminal.loadAddon(new WebLinksAddon())
		terminal.open(element)
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

		element.addEventListener('paste', paste, {capture: true})

		const observer = new ResizeObserver(resize)
		observer.observe(element)
		if (element.parentElement) observer.observe(element.parentElement)

		const window = element.ownerDocument.defaultView
		window?.addEventListener('resize', resize)
		void element.ownerDocument.fonts.ready.then(resize)

		return () => {
			disposed = true
			terminalRef.current = null
			inputBufferRef.current = ''
			if (inputFlushRef.current) clearTimeout(inputFlushRef.current)
			inputFlushRef.current = null
			for (const timeout of timeouts) clearTimeout(timeout)
			if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
			window?.removeEventListener('resize', resize)
			element.removeEventListener('paste', paste, {capture: true})
			observer.disconnect()
			terminal.dispose()
		}
	}, [])
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
