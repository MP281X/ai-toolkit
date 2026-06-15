import {Match, String, pipe} from 'effect'

import {ClipboardAddon} from '@xterm/addon-clipboard'
import {FitAddon} from '@xterm/addon-fit'
import {Unicode11Addon} from '@xterm/addon-unicode11'
import {WebLinksAddon} from '@xterm/addon-web-links'
import {WebglAddon} from '@xterm/addon-webgl'
import * as XTerm from '@xterm/xterm'
import {forwardRef, useImperativeHandle, useLayoutEffect, useRef} from 'react'

import {Fallback} from '#components/fallbacks.tsx'
import {cn} from '#lib/utils.ts'

export type TerminalHandle = {readonly reset: () => void; readonly write: (data: string, done?: () => void) => void}

function captureScrollAnchor(terminal: XTerm.Terminal) {
	const distanceFromBottom = Math.max(0, terminal.buffer.active.baseY - terminal.buffer.active.viewportY)
	return {distanceFromBottom, wasAtBottom: distanceFromBottom === 0}
}

function restoreScrollAnchor(
	terminal: XTerm.Terminal,
	anchor: {readonly distanceFromBottom: number; readonly wasAtBottom: boolean}
) {
	try {
		if (anchor.wasAtBottom || anchor.distanceFromBottom > terminal.buffer.active.baseY) {
			terminal.scrollToBottom()
			return
		}

		const targetViewportY = Math.max(0, terminal.buffer.active.baseY - anchor.distanceFromBottom)
		const delta = targetViewportY - terminal.buffer.active.viewportY
		if (delta !== 0) terminal.scrollLines(delta)
	} catch {
		terminal.scrollToBottom()
	}
}

function shouldBlockScrollbackPurge(params: readonly unknown[]) {
	return params[0] === 3
}

export const Terminal = forwardRef<
	TerminalHandle,
	{
		readonly className?: string
		readonly onData: (data: string) => void
		readonly onReady?: (size: {readonly cols: number; readonly rows: number}) => void
		readonly onResize?: (size: {readonly cols: number; readonly rows: number}) => void
		readonly state?: 'idle' | 'starting' | 'running' | 'waiting' | 'stopped' | 'exited' | 'failed'
	}
>(function Terminal(input, ref) {
	const elementRef = useRef<HTMLDivElement>(null)
	const terminalRef = useRef<XTerm.Terminal | null>(null)
	const callbacksRef = useRef({onData: input.onData, onReady: input.onReady, onResize: input.onResize})
	const inputBufferRef = useRef('')
	const inputFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const lifecycleRef = useRef({
		animationFrame: 0,
		disposed: false,
		lastSize: {cols: 0, rows: 0},
		ready: false,
		resizeRestoreUntil: 0
	})

	function writeTerminal(terminal: XTerm.Terminal, data: string, done: (() => void) | undefined) {
		const anchor = captureScrollAnchor(terminal)
		const restoreAfterWrite = anchor.wasAtBottom || Date.now() <= lifecycleRef.current.resizeRestoreUntil
		terminal.write(data, () => {
			if (terminalRef.current === terminal && restoreAfterWrite) restoreScrollAnchor(terminal, anchor)
			done?.()
		})
	}

	function write(data: string, done?: () => void) {
		if (terminalRef.current === null || data === '') {
			done?.()
			return
		}

		writeTerminal(terminalRef.current, data, done)
	}

	callbacksRef.current = {onData: input.onData, onReady: input.onReady, onResize: input.onResize}
	useImperativeHandle(
		ref,
		() => ({
			reset() {
				terminalRef.current?.reset()
			},
			write
		}),
		[]
	)

	useLayoutEffect(() => {
		if (elementRef.current === null) return

		return initializeTerminal(elementRef.current)
	}, [])

	function initializeTerminal(container: HTMLDivElement) {
		const lifecycle = {
			animationFrame: 0,
			disposed: false,
			lastSize: {cols: 0, rows: 0},
			ready: false,
			resizeRestoreUntil: 0
		}
		lifecycleRef.current = lifecycle

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
		const background = String.trim(rootStyle.getPropertyValue('--background')) || '#ffffff'
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
			theme: {
				background,
				selectionBackground: 'rgba(225, 143, 83, 0.3)',
				selectionInactiveBackground: 'rgba(225, 143, 83, 0.3)'
			}
		})
		Object.assign(terminal.options, {scrollbar: {showScrollbar: false}})
		const fit = new FitAddon()

		function fitAndNotify() {
			if (lifecycle.disposed || container.clientWidth < 8 || container.clientHeight < 8) return

			const anchor = captureScrollAnchor(terminal)
			try {
				fit.fit()
			} catch {
				return
			}
			lifecycle.resizeRestoreUntil = Date.now() + 1_200
			restoreScrollAnchor(terminal, anchor)
			if (terminal.cols < 2 || terminal.rows < 1) return

			if (lifecycle.lastSize.cols !== terminal.cols || lifecycle.lastSize.rows !== terminal.rows) {
				lifecycle.lastSize = {cols: terminal.cols, rows: terminal.rows}
				callbacksRef.current.onResize?.({cols: terminal.cols, rows: terminal.rows})
			}

			if (!lifecycle.ready) {
				lifecycle.ready = true
				callbacksRef.current.onReady?.({cols: terminal.cols, rows: terminal.rows})
			}
		}

		function scheduleFit() {
			if (lifecycle.disposed || lifecycle.animationFrame !== 0) return

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
		const dataDisposable = terminal.onData(pushInput)
		const purgeDisposable = terminal.parser.registerCsiHandler({final: 'J'}, shouldBlockScrollbackPurge)
		const selectivePurgeDisposable = terminal.parser.registerCsiHandler(
			{final: 'J', prefix: '?'},
			shouldBlockScrollbackPurge
		)
		const disposables = [dataDisposable, purgeDisposable, selectivePurgeDisposable]
		terminal.open(container)
		terminalRef.current = terminal
		fitAndNotify()
		terminal.focus()
		try {
			const webgl = new WebglAddon()
			terminal.loadAddon(webgl)
			disposables.push(
				webgl.onContextLoss(() => {
					webgl.dispose()
				})
			)
		} catch {
			// Canvas renderer fallback.
		}
		function paste(event: ClipboardEvent) {
			const text = event.clipboardData?.getData('text/plain') ?? event.clipboardData?.getData('text') ?? ''
			if (text === '') return

			event.preventDefault()
			event.stopPropagation()
			terminal.paste(text)
		}

		container.addEventListener('paste', paste, {capture: true})

		const observer = new ResizeObserver(scheduleFit)
		observer.observe(container)
		void container.ownerDocument.fonts.ready.then(scheduleFit)
		scheduleFit()

		return () => {
			lifecycle.disposed = true
			terminalRef.current = null
			inputBufferRef.current = ''
			if (inputFlushRef.current) clearTimeout(inputFlushRef.current)
			inputFlushRef.current = null
			if (lifecycle.animationFrame !== 0) cancelAnimationFrame(lifecycle.animationFrame)
			container.removeEventListener('paste', paste, {capture: true})
			observer.disconnect()
			for (const disposable of disposables) disposable.dispose()
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
