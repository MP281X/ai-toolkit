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
	const lastSizeRef = useRef<{cols: number; height: number; rows: number; width: number} | undefined>(undefined)

	callbacksRef.current = {onData: input.onData, onResize: input.onResize}

	useEffect(() => {
		const element = elementRef.current
		if (!element) return
		const container = element
		const style = getComputedStyle(container)
		const fontSize = Number.parseFloat(style.fontSize)
		const fontWeight = Number.parseInt(style.fontWeight, 10)

		const terminal = new XTerm({
			customGlyphs: true,
			fontFamily: style.fontFamily,
			fontSize: Number.isNaN(fontSize) ? 14 : fontSize,
			fontWeight: Number.isNaN(fontWeight) ? 400 : fontWeight,
			fontWeightBold: 600,
			letterSpacing: 0,
			lineHeight: 1,
			scrollback: 10_000,
			theme: {background: style.backgroundColor}
		})
		const fit = new FitAddon()

		function resize(force = false) {
			const previous = lastSizeRef.current
			const width = container.clientWidth
			const height = container.clientHeight
			if (!force && previous?.width === width && previous.height === height) return

			fit.fit()
			const next = {cols: terminal.cols, height, rows: terminal.rows, width}
			lastSizeRef.current = next
			if (previous?.cols === next.cols && previous.rows === next.rows) return

			callbacksRef.current.onResize?.({cols: next.cols, rows: next.rows})
		}

		terminal.loadAddon(fit)
		terminal.open(container)
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

		const observer = new ResizeObserver(() => {
			resize()
		})
		observer.observe(container)
		void container.ownerDocument.fonts.ready.then(() => {
			resize(true)
		})
		resize(true)
		terminalRef.current = terminal

		return () => {
			terminalRef.current = null
			lastSizeRef.current = undefined
			observer.disconnect()
			terminal.dispose()
		}
	}, [])
	useEffect(() => {
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
		/>
	)
}
