import {FitAddon} from '@xterm/addon-fit'
import {WebglAddon} from '@xterm/addon-webgl'
import {Terminal as XTerm} from '@xterm/xterm'
import {useEffect, useRef} from 'react'

import {Fallback} from '#components/fallbacks.tsx'
import {cn} from '#lib/utils.ts'

type TerminalStatus =
	| {readonly state: 'starting'}
	| {readonly pid: number; readonly state: 'running'}
	| {readonly state: 'stopped'}
	| {readonly exitCode: number; readonly signal?: number; readonly state: 'exited'}
	| {readonly exitCode?: number; readonly signal?: number; readonly state: 'failed'}

function terminalWriter(write: (data: string, done?: () => void) => void) {
	type Operation =
		| {readonly data: string; readonly type: 'write'}
		| {readonly run: () => void; readonly type: 'barrier'}

	const operations: Operation[] = []
	let waits: (() => void)[] | undefined
	let scheduled = false
	let writing = false

	function settle() {
		if (scheduled || writing || operations.length > 0) return
		const list = waits
		if (!list?.length) return
		waits = undefined
		for (const fn of list) fn()
	}

	function run() {
		if (writing) return
		scheduled = false
		const operation = operations.shift()
		if (!operation) {
			settle()
			return
		}

		if (operation.type === 'barrier') {
			operation.run()
			run()
			return
		}

		writing = true
		write(operation.data, () => {
			writing = false
			if (operations.length > 0) {
				if (!scheduled) {
					scheduled = true
					queueMicrotask(run)
				}
				return
			}
			settle()
		})
	}

	return {
		barrier: (fn: () => void) => {
			operations.push({run: fn, type: 'barrier'})
			if (scheduled || writing) return
			scheduled = true
			queueMicrotask(run)
		},
		flush: (done?: () => void) => {
			if (!scheduled && !writing && operations.length === 0) {
				done?.()
				return
			}
			if (done) {
				if (waits) waits.push(done)
				else waits = [done]
			}
			run()
		},
		push: (data: string) => {
			if (data === '') return
			const last = operations.at(-1)
			if (last?.type === 'write') operations[operations.length - 1] = {...last, data: last.data + data}
			else operations.push({data, type: 'write'})
			if (scheduled || writing) return
			scheduled = true
			queueMicrotask(run)
		}
	}
}

function solidCssColor(element: HTMLElement) {
	const ownerDocument = element.ownerDocument
	const rendererStyles = getComputedStyle(element.parentElement?.parentElement ?? element.parentElement ?? element)
	const rootStyles = getComputedStyle(ownerDocument.documentElement)
	const cssColor =
		rendererStyles.backgroundColor === 'rgba(0, 0, 0, 0)'
			? rootStyles.getPropertyValue('--background').trim()
			: rendererStyles.backgroundColor
	const canvas = ownerDocument.createElement('canvas')
	canvas.width = 1
	canvas.height = 1
	const context = canvas.getContext('2d')
	if (!context) return 'rgb(0, 0, 0)'

	context.fillStyle = cssColor
	context.fillRect(0, 0, 1, 1)
	const [red, green, blue] = context.getImageData(0, 0, 1, 1).data

	return `rgb(${red}, ${green}, ${blue})`
}

export function Terminal(input: {
	readonly className?: string
	readonly onData: (data: string) => void
	readonly onResize?: (size: {readonly cols: number; readonly rows: number}) => void
	readonly status?: TerminalStatus
	readonly write: (terminal: {readonly reset: () => void; readonly write: (data: string) => Promise<void>}) => void
}) {
	const elementRef = useRef<HTMLDivElement>(null)
	const terminalRef = useRef<XTerm>(null)
	const callbacksRef = useRef({onData: input.onData, onResize: input.onResize})
	const resizeRef = useRef<() => void>(() => {})
	const writerRef = useRef<ReturnType<typeof terminalWriter>>(null)

	callbacksRef.current = {onData: input.onData, onResize: input.onResize}

	useEffect(() => {
		const element = elementRef.current
		if (!element) return

		const container = element
		const background = solidCssColor(element)
		const terminal = new XTerm({
			customGlyphs: true,
			fontFamily: '"JetBrainsMono Nerd Font Mono", "JetBrains Mono Variable", monospace',
			scrollback: 10_000,
			smoothScrollDuration: 0,
			theme: {background}
		})
		Object.assign(terminal.options, {scrollbar: {showScrollbar: false}})
		const fit = new FitAddon()
		const timeouts: ReturnType<typeof setTimeout>[] = []
		let animationFrame: number | undefined
		let disposed = false
		let lastSize: {readonly cols: number; readonly rows: number} | undefined

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

		resizeRef.current = fitAndNotify

		terminal.loadAddon(fit)
		terminal.open(element)
		const writer = terminalWriter((data, done) => {
			if (disposed) {
				done?.()
				return
			}
			terminal.write(data, done)
		})
		writerRef.current = writer
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
			writerRef.current = null
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
				const writer = writerRef.current
				writer?.barrier(() => {
					const terminal = terminalRef.current
					if (!terminal) return

					terminal.reset()
					terminal.clear()
				})
			},
			write: data => {
				const writer = writerRef.current
				if (!writer) return Promise.resolve()

				writer.push(data)
				return new Promise<void>(resolve => {
					writer.flush(resolve)
				})
			}
		})
	}, [input.write])

	const terminalError =
		input.status?.state === 'exited'
			? `Terminal exited with code ${input.status.exitCode}.`
			: input.status?.state === 'failed'
				? `Terminal failed${input.status.exitCode === undefined ? '' : ` with code ${input.status.exitCode}`}.`
				: input.status?.state === 'stopped'
					? 'Terminal stopped.'
					: undefined

	return (
		<div className={cn('terminal-renderer relative h-full min-h-0 w-full min-w-0 overflow-hidden', input.className)}>
			<div ref={elementRef} className="absolute inset-0 h-full min-h-0 w-full min-w-0 overflow-hidden" />
			{terminalError && (
				<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
					<Fallback message={terminalError} />
				</div>
			)}
		</div>
	)
}
