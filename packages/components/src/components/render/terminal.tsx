import {FitAddon} from '@xterm/addon-fit'
import {WebglAddon} from '@xterm/addon-webgl'
import {Terminal as XTerm} from '@xterm/xterm'
import {useEffect, useRef} from 'react'

import {cn} from '#lib/utils.ts'

export function Terminal(input: {
	readonly className?: string
	readonly onData: (data: string) => void
	readonly onResize?: (size: {readonly cols: number; readonly rows: number}) => void
	readonly write: (writer: (data: string) => void) => void
}) {
	const elementRef = useRef<HTMLDivElement>(null)
	const terminalRef = useRef<XTerm>(null)
	const callbacksRef = useRef({onData: input.onData, onResize: input.onResize})

	callbacksRef.current = {onData: input.onData, onResize: input.onResize}

	useEffect(() => {
		if (!elementRef.current) return

		const terminal = new XTerm({
			customGlyphs: false,
			fontFamily: '"JetBrainsMono Nerd Font Mono", "JetBrains Mono Variable", monospace',
			scrollback: 10_000,
			theme: {background: getComputedStyle(elementRef.current).backgroundColor}
		})
		const fit = new FitAddon()

		function resize() {
			fit.fit()
			callbacksRef.current.onResize?.({cols: terminal.cols, rows: terminal.rows})
		}

		terminal.loadAddon(fit)
		terminal.open(elementRef.current)
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

		const observer = new ResizeObserver(resize)
		observer.observe(elementRef.current)
		void elementRef.current.ownerDocument.fonts.ready.then(resize)
		resize()
		terminalRef.current = terminal

		return () => {
			terminalRef.current = null
			observer.disconnect()
			terminal.dispose()
		}
	}, [])
	useEffect(() => {
		input.write(data => terminalRef.current?.write(data))
	}, [input.write, input])

	return (
		<div
			ref={elementRef}
			className={cn('terminal-renderer h-full min-h-0 w-full min-w-0 overflow-hidden', input.className)}
		/>
	)
}
