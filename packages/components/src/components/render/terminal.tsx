import {Array, Match, Predicate, String, pipe} from 'effect'

import {ClipboardAddon} from '@xterm/addon-clipboard'
import {FitAddon} from '@xterm/addon-fit'
import {Unicode11Addon} from '@xterm/addon-unicode11'
import {WebLinksAddon} from '@xterm/addon-web-links'
import {WebglAddon} from '@xterm/addon-webgl'
import * as xterm from '@xterm/xterm'
import * as EffectRecord from 'effect/Record'
import {useEffect, useImperativeHandle, useRef} from 'react'

import {Fallback} from '#components/fallbacks.tsx'
import {cn} from '#lib/utils.ts'
function cssColor(input: {readonly element: HTMLElement; readonly value: string}) {
	const probe = input.element.ownerDocument.createElement('span')
	probe.style.color = input.value
	probe.style.display = 'none'
	input.element.append(probe)
	probe.style.color = getComputedStyle(probe).color
	probe.remove()
	const canvas = input.element.ownerDocument.createElement('canvas')
	canvas.width = 1
	canvas.height = 1
	const context = canvas.getContext('2d')
	if (!context) return probe.style.color || input.value
	context.fillStyle = probe.style.color || input.value
	context.fillRect(0, 0, 1, 1)
	return context.getImageData(0, 0, 1, 1).data[3] === 255
		? `rgb(${context.getImageData(0, 0, 1, 1).data[0]}, ${context.getImageData(0, 0, 1, 1).data[1]}, ${context.getImageData(0, 0, 1, 1).data[2]})`
		: `rgba(${context.getImageData(0, 0, 1, 1).data[0]}, ${context.getImageData(0, 0, 1, 1).data[1]}, ${context.getImageData(0, 0, 1, 1).data[2]}, ${(context.getImageData(0, 0, 1, 1).data[3] ?? 255) / 255})`
}
export type TerminalHandle = {
	readonly reset: () => void
	readonly write: (input: {readonly data: string; readonly done?: () => void}) => void
}
export function Terminal(parameters: {
	readonly handleRef?: React.Ref<TerminalHandle>
	readonly className?: string
	readonly onData: (data: string) => void
	readonly onResize?: (size: {readonly cols: number; readonly rows: number}) => void
	readonly state?: string
}) {
	const input = EffectRecord.remove('handleRef')(parameters)
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
		parameters.handleRef,
		() => ({
			reset() {
				terminalRef.current?.reset()
			},
			write(writeInput: {readonly data: string; readonly done?: () => void}) {
				if (Predicate.isNullish(terminalRef.current) || writeInput.data === '') {
					writeInput.done?.()
					return
				}
				try {
					terminalRef.current.write(writeInput.data, writeInput.done)
				} catch {
					writeInput.done?.()
				}
			}
		}),
		[]
	)
	useEffect(() => {
		if (Predicate.isNullish(elementRef.current)) return
		disposedRef.current = false
		const style = getComputedStyle(elementRef.current)
		const rootStyle = getComputedStyle(elementRef.current.ownerDocument.documentElement)
		const fontSize = Number.parseFloat(style.fontSize)
		const fontWeight = Number.parseInt(style.fontWeight, 10)
		const background = cssColor({
			element: elementRef.current,
			value: pipe(rootStyle.getPropertyValue('--background'), String.trim)
		})
		const selectionBackground = cssColor({element: elementRef.current, value: 'oklch(0.8214 0.1337 49.9802 / 30%)'})
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
				terminal.refresh(0, terminal.rows - 1)
			})
		} catch {
			// Canvas renderer fallback.
		}
		terminal.onData(data => {
			callbacksRef.current.onData(data)
		})
		resize()
		terminalRef.current = terminal
		const observer = new ResizeObserver(resize)
		observer.observe(elementRef.current)
		if (elementRef.current.parentElement) observer.observe(elementRef.current.parentElement)
		window.addEventListener('resize', resize)
		void elementRef.current.ownerDocument.fonts.ready.then(resize)
		return () => {
			disposedRef.current = true
			terminalRef.current = null
			if (Predicate.isNotNull(animationFrameRef.current)) cancelAnimationFrame(animationFrameRef.current)
			animationFrameRef.current = null
			window.removeEventListener('resize', resize)
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
