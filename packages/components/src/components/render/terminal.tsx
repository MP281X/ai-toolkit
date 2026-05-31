import {FitAddon} from '@xterm/addon-fit'
import {WebglAddon} from '@xterm/addon-webgl'
import {Terminal as XTerm} from '@xterm/xterm'
import {useEffect, useRef} from 'react'

import {cn} from '#lib/utils.ts'

export function Terminal(input: {
	readonly className?: string
	readonly onData: (data: string) => void
	readonly onResize?: (size: {readonly cols: number; readonly rows: number}) => void
	readonly write: (terminal: {readonly reset: () => void; readonly write: (data: string) => Promise<void>}) => void
}) {
	const elementRef = useRef<HTMLDivElement>(null)
	const terminalRef = useRef<XTerm>(null)
	const writeQueueRef = useRef(Promise.resolve())
	const callbacksRef = useRef({onData: input.onData, onResize: input.onResize})
	const resizeRef = useRef<() => void>(() => {})

	callbacksRef.current = {onData: input.onData, onResize: input.onResize}

	useEffect(() => {
		const element = elementRef.current
		if (!element) return

		const container = element
		const terminal = new XTerm({
			customGlyphs: true,
			fontFamily: '"JetBrainsMono Nerd Font Mono", "JetBrains Mono Variable", monospace',
			scrollback: 10_000,
			theme: {background: getComputedStyle(element).backgroundColor}
		})
		const fit = new FitAddon()
		const timeouts: ReturnType<typeof setTimeout>[] = []
		let animationFrame: number | undefined
		let disposed = false
		let lastSize: {readonly cols: number; readonly rows: number} | undefined

		function fitAndNotify() {
			if (disposed || container.clientWidth === 0 || container.clientHeight === 0) return

			fit.fit()
			terminal.refresh(0, terminal.rows - 1)
			const nextSize = {cols: terminal.cols, rows: terminal.rows}
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

		resizeRef.current = fitAndNotify

		terminal.loadAddon(fit)
		terminal.open(element)
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
		terminal.attachCustomKeyEventHandler(event => {
			if (event.type !== 'keydown') return true

			const paste = (event.ctrlKey || event.metaKey) && (event.key === 'v' || event.key === 'V')
			const alternatePaste = event.ctrlKey && event.shiftKey && (event.key === 'v' || event.key === 'V')
			if (paste || alternatePaste) {
				void navigator.clipboard.readText().then(text => {
					if (text !== '') callbacksRef.current.onData(text)
				})
				return false
			}

			const copy = event.metaKey && (event.key === 'c' || event.key === 'C')
			const alternateCopy = event.ctrlKey && event.shiftKey && (event.key === 'c' || event.key === 'C')
			if (copy || alternateCopy) {
				const selection = terminal.getSelection()
				if (selection !== '') {
					void navigator.clipboard.writeText(selection)
					terminal.clearSelection()
					return false
				}
			}

			return true
		})

		function paste(event: ClipboardEvent) {
			const text = event.clipboardData?.getData('text/plain') ?? ''
			if (text === '') return

			event.preventDefault()
			callbacksRef.current.onData(text)
		}

		container.addEventListener('paste', paste, {capture: true})

		const observer = new ResizeObserver(resize)
		observer.observe(element)
		if (element.parentElement) observer.observe(element.parentElement)

		const window = element.ownerDocument.defaultView
		window?.addEventListener('resize', resize)
		void element.ownerDocument.fonts.ready.then(resize)
		resize()
		for (const delay of [16, 50, 100, 250, 500]) {
			timeouts.push(setTimeout(resize, delay))
		}
		terminalRef.current = terminal

		return () => {
			disposed = true
			terminalRef.current = null
			resizeRef.current = () => {}
			for (const timeout of timeouts) clearTimeout(timeout)
			if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
			window?.removeEventListener('resize', resize)
			container.removeEventListener('paste', paste, {capture: true})
			observer.disconnect()
			terminal.dispose()
		}
	}, [])
	useEffect(() => {
		resizeRef.current()
		input.write({
			reset: () => {
				writeQueueRef.current = writeQueueRef.current.then(() => {
					const terminal = terminalRef.current
					if (!terminal) return

					terminal.reset()
					terminal.clear()
				})
			},
			write: data => {
				writeQueueRef.current = writeQueueRef.current.then(
					() =>
						new Promise<void>(resolve => {
							const terminal = terminalRef.current
							if (!terminal) {
								resolve()
								return
							}

							terminal.write(data, resolve)
						})
				)

				return writeQueueRef.current
			}
		})
	}, [input.write])

	return (
		<div
			ref={elementRef}
			className={cn('terminal-renderer h-full min-h-0 w-full min-w-0 overflow-hidden', input.className)}
			onPaste={event => {
				const text = event.clipboardData.getData('text/plain')
				if (text === '') return

				event.preventDefault()
				input.onData(text)
			}}
		/>
	)
}
