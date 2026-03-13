import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, Match, Number, pipe, Stream, String} from 'effect'

import {Boxes, Database, FlaskConical, Monitor, MousePointer2, Server, Sparkles} from '@ai-toolkit/components/icons'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@ai-toolkit/components/ui/dialog'
import {cn} from '@ai-toolkit/components/utils'
import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import type {MutableRefObject, ReactNode} from 'react'
import {memo, Suspense, useEffect, useRef, useState, useSyncExternalStore} from 'react'

import {AtomRuntime, RpcClient} from '#lib/atomRuntime.ts'
import type {PortfolioEvent, PortfolioTrail, PortfolioVisitor} from '#rpcs/portfolio/contracts.ts'
import {PortfolioState} from '#rpcs/portfolio/contracts.ts'

const cursorPalette = [
	'oklch(0.74 0.19 118)',
	'oklch(0.76 0.2 128)',
	'oklch(0.75 0.18 138)',
	'oklch(0.73 0.17 150)',
	'oklch(0.74 0.18 162)',
	'oklch(0.76 0.17 174)',
	'oklch(0.75 0.18 186)',
	'oklch(0.73 0.19 198)',
	'oklch(0.72 0.2 210)',
	'oklch(0.74 0.18 222)',
	'oklch(0.71 0.18 234)',
	'oklch(0.73 0.19 246)',
	'oklch(0.75 0.19 258)',
	'oklch(0.74 0.2 270)',
	'oklch(0.73 0.21 282)',
	'oklch(0.74 0.2 296)',
	'oklch(0.75 0.19 310)',
	'oklch(0.74 0.18 324)',
	'oklch(0.73 0.19 338)',
	'oklch(0.72 0.2 352)'
]

function pickRandomCursorColor() {
	return cursorPalette[Math.floor(Math.random() * cursorPalette.length)] ?? 'oklch(0.72 0.2 210)'
}

function pickNextCursorColor(currentColor: string) {
	const nextPalette = Array.filter(cursorPalette, color => color !== currentColor)
	return nextPalette[Math.floor(Math.random() * nextPalette.length)] ?? pickRandomCursorColor()
}

function getIdentity() {
	const existingId = window.sessionStorage.getItem('portfolio.id')
	const existingName = window.sessionStorage.getItem('portfolio.name')

	if (existingId && existingName) return {id: existingId, name: existingName, color: pickRandomCursorColor()}

	const seed = pipe(crypto.randomUUID(), String.replaceAll('-', ''), String.slice(0, 6))

	const next = {
		id: `v-${seed}`,
		name: `Guest-${pipe(seed, String.slice(0, 3))}`,
		color: pickRandomCursorColor()
	}

	window.sessionStorage.setItem('portfolio.id', next.id)
	window.sessionStorage.setItem('portfolio.name', next.name)
	window.sessionStorage.removeItem('portfolio.color')

	return next
}

const identity = getIdentity()

function upsertVisitor(visitors: readonly PortfolioVisitor[], visitor: PortfolioVisitor) {
	for (let index = 0; index < visitors.length; index++) {
		if (visitors[index]?.id !== visitor.id) continue

		const nextVisitors = Array.copy(visitors)
		nextVisitors[index] = visitor
		return nextVisitors
	}

	return Array.appendAll(visitors, [visitor])
}

function removeVisitor(visitors: readonly PortfolioVisitor[], id: string) {
	const nextVisitors = Array.empty<PortfolioVisitor>()

	for (const visitor of visitors) {
		if (visitor.id === id) continue
		nextVisitors[nextVisitors.length] = visitor
	}

	return nextVisitors.length === visitors.length ? visitors : nextVisitors
}

function appendTrail(trails: readonly PortfolioTrail[], trail: PortfolioTrail) {
	const nextTrails = Array.append(trails, trail)
	return nextTrails.length > 180 ? Array.drop(nextTrails, nextTrails.length - 180) : nextTrails
}

function applyPortfolioEvent(state: PortfolioState, event: PortfolioEvent) {
	return pipe(
		Match.value(event),
		Match.tag('snapshot', next => new PortfolioState({visitors: next.visitors, trails: next.trails})),
		Match.tag(
			'visitor-upserted',
			next =>
				new PortfolioState({
					visitors: upsertVisitor(state.visitors, next.visitor),
					trails: state.trails
				})
		),
		Match.tag(
			'visitor-removed',
			next =>
				new PortfolioState({
					visitors: removeVisitor(state.visitors, next.id),
					trails: state.trails
				})
		),
		Match.tag(
			'trail-added',
			next =>
				new PortfolioState({
					visitors: state.visitors,
					trails: appendTrail(state.trails, next.trail)
				})
		),
		Match.exhaustive
	)
}

const portfolioAtom = Atom.keepAlive(
	AtomRuntime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('portfolio.join', {id: identity.id, name: identity.name, color: identity.color})),
			Stream.unwrap,
			Stream.scan(new PortfolioState({}), applyPortfolioEvent)
		)
	)
)

const frameListeners = new Set<(now: number) => void>()
let frameId = 0

type Viewport = {
	width: number
	height: number
}

type CursorMotion = {
	x: number
	y: number
	targetX: number
	targetY: number
	lastFrameAt: number
	viewportWidth: number
	viewportHeight: number
}

let localPointer: {x: number; y: number; updatedAt: number} | undefined
const SUMMARY_LINES = [
	"I'm a full-stack TypeScript developer with production experience building real-time, type-safe web applications using React, Node.js, and PostgreSQL.",
	'I deliver features end-to-end, from gathering user requirements to deploying containerized services, working effectively in fast-paced, cross-functional teams.',
	'I use AI coding agents daily to accelerate development, refactoring, and testing while maintaining manual code review to ensure consistency and quality.'
]

const TECHNICAL_SKILLS = [
	{
		area: 'Frontend',
		icon: Monitor,
		items: 'React, TypeScript, TanStack (Router, Table, Form), Tailwind CSS'
	},
	{area: 'Backend', icon: Server, items: 'Node.js, Effect-TS (functional TypeScript library), RESTful API'},
	{area: 'Data & Real-Time', icon: Database, items: 'PostgreSQL, Redis, WebSockets, SSE'},
	{area: 'DevOps', icon: Boxes, items: 'Docker, GitHub Actions, Git, Linux'},
	{area: 'Testing', icon: FlaskConical, items: 'Type-safe APIs, End-to-end testing, Unit testing'},
	{
		area: 'AI Tooling',
		icon: Sparkles,
		items: 'OpenCode, Github Copilot, Claude Code'
	}
]

const WORK_EXPERIENCE = [
	{
		company: 'Tinexta Cyber',
		role: 'Full-Stack Developer',
		period: 'Oct 2024 – Present',
		location: 'Udine, Italy',
		note: '',
		highlights: [
			'Developed a real-time network inventory application for a major telecommunications company',
			'Built the real-time frontend in React with ElectricSQL for live updates across all users',
			'Implemented a custom type-safe RPC-like client from the Kotlin backend OpenAPI schema',
			'Gathered requirements directly from end users and iterated through feedback rounds',
			'Containerized and deployed multiple services using Docker with Jenkins CI/CD',
			'Used AI coding agents daily with project-specific guidelines for development'
		]
	},
	{
		company: 'Altitudo',
		role: 'Frontend Developer',
		period: 'Jan 2024 – Mar 2024',
		location: 'Salzburg, Austria',
		note: 'Erasmus Internship',
		highlights: [
			'Migrated the build system from Create React App to Vite',
			'Improved rendering performance by adding proper memoization',
			'Migrated legacy class components to modern functional components using React hooks',
			'Recreated and restyled multiple pages using React and Tailwind CSS'
		]
	},
	{
		company: 'BizAway',
		role: 'Backend Developer',
		period: 'Jun 2023 – Aug 2023',
		location: 'Spilimbergo, Italy',
		note: 'Internship',
		highlights: [
			'Developed a type-safe E2E testing framework on top of the OpenAPI schema using Playwright',
			'Built a type-safe email template framework using TSX-style components',
			'Migrated API endpoints from the old OpenAPI version to the new specification',
			'Built and updated multiple Angular components and features'
		]
	}
]

const EDUCATION_DATA = [
	{
		school: 'ITS Alto Adriatico',
		degree: 'Cloud Developer Diploma',
		grade: '95/100',
		period: '2022 – 2024',
		description: 'Cloud-native architectures, CI/CD, Docker & Kubernetes, full-stack web application development.'
	},
	{
		school: 'ISIS A. Malignani',
		degree: 'High School Diploma – IT and Telecommunications',
		grade: '',
		period: '2017 – 2022',
		description: 'Telecommunications, electronics, networking fundamentals, and programming foundations.'
	}
]

const LANGUAGES_DATA = [
	{language: 'Italian', level: 'Native'},
	{language: 'English', level: 'C1'},
	{language: 'Spanish', level: 'Basic'}
]

const CONTACT_ITEMS = [
	{label: 'Email', value: 'paludgnachmatteo.dev@gmail.com', href: 'mailto:paludgnachmatteo.dev@gmail.com'},
	{label: 'Phone', value: '+39 351 885 3376', href: 'tel:+393518853376'},
	{label: 'GitHub', value: 'github.com/MP281X', href: 'https://github.com/MP281X'}
]

function getViewport() {
	return {
		width: window.innerWidth,
		height: window.innerHeight
	} satisfies Viewport
}

function clamp(value: number, minimum: number, maximum: number) {
	return Math.max(minimum, Math.min(maximum, value))
}

function subscribeFrame(listener: (now: number) => void) {
	frameListeners.add(listener)

	if (!frameId) {
		frameId = requestAnimationFrame(function tick(now) {
			for (const frameListener of frameListeners) frameListener(now)

			if (frameListeners.size === 0) {
				frameId = 0
				return
			}

			frameId = requestAnimationFrame(tick)
		})
	}

	return () => {
		frameListeners.delete(listener)

		if (frameListeners.size === 0 && frameId) {
			cancelAnimationFrame(frameId)
			frameId = 0
		}
	}
}

function getDisplayCursorTarget(cursor: PortfolioVisitor, isMe: boolean, viewport: Viewport) {
	if (isMe && localPointer) {
		return {
			x: localPointer.x * viewport.width,
			y: localPointer.y * viewport.height
		}
	}

	return {
		x: cursor.x * viewport.width,
		y: cursor.y * viewport.height
	}
}

function setCursorTransform(node: HTMLDivElement, x: number, y: number) {
	Reflect.set(node.style, 'transform', `translate3d(${x}px, ${y}px, 0)`)
}

function createCursorMotion(target: {x: number; y: number}, viewport: Viewport) {
	return {
		x: target.x,
		y: target.y,
		targetX: target.x,
		targetY: target.y,
		lastFrameAt: 0,
		viewportWidth: viewport.width,
		viewportHeight: viewport.height
	} satisfies CursorMotion
}

function updateCursorMotion(motion: CursorMotion, target: {x: number; y: number}) {
	return {
		...motion,
		targetX: target.x,
		targetY: target.y
	}
}

function stepCursorMotion(motion: CursorMotion, now: number) {
	const frameDelta = motion.lastFrameAt > 0 ? clamp(now - motion.lastFrameAt, 8, 64) : 16
	const deltaX = motion.targetX - motion.x
	const deltaY = motion.targetY - motion.y
	const catchUp = Math.min(1, (1 - Math.exp(-frameDelta / 130)) * (1 + Math.hypot(deltaX, deltaY) / 220))
	const nextX = motion.x + deltaX * catchUp
	const nextY = motion.y + deltaY * catchUp

	return {
		...motion,
		x: Math.abs(deltaX) < 0.3 ? motion.targetX : clamp(nextX, 0, motion.viewportWidth),
		y: Math.abs(deltaY) < 0.3 ? motion.targetY : clamp(nextY, 0, motion.viewportHeight),
		lastFrameAt: now
	}
}

function syncCursorMotion(motion: CursorMotion, cursor: PortfolioVisitor, isMe: boolean, viewport: Viewport) {
	const nextTarget = getDisplayCursorTarget(cursor, isMe, viewport)

	if (motion.viewportWidth !== viewport.width || motion.viewportHeight !== viewport.height) {
		return createCursorMotion(nextTarget, viewport)
	}

	if (motion.targetX === nextTarget.x && motion.targetY === nextTarget.y) return motion

	return updateCursorMotion(motion, nextTarget)
}

function getViewportSnapshot() {
	const viewport = getViewport()
	return `${viewport.width}:${viewport.height}`
}

function useViewport() {
	const snapshot = useSyncExternalStore(
		onStoreChange => {
			window.addEventListener('resize', onStoreChange)
			return () => window.removeEventListener('resize', onStoreChange)
		},
		getViewportSnapshot,
		getViewportSnapshot
	)

	const [width = '0', height = '0'] = pipe(snapshot, String.split(':'))

	return {
		width: Number.parse(width) || 0,
		height: Number.parse(height) || 0
	} satisfies Viewport
}

function getTrailCell(trail: PortfolioTrail, viewport: Viewport) {
	return {
		col: Math.floor((trail.x * viewport.width) / 26),
		row: Math.floor((trail.y * viewport.height) / 26)
	}
}

function Panel(input: {readonly className?: string; readonly children: ReactNode}) {
	return (
		<div className={cn('border border-border/70 bg-background/88 backdrop-blur-sm', input.className)}>
			{input.children}
		</div>
	)
}

export const Route = createFileRoute('/(portfolio)/')({
	component: PortfolioRoute
})

function PortfolioRoute() {
	const viewport = useViewport()
	const sectionRefs = useRef<(HTMLElement | null)[]>(Array.makeBy(6, () => null))
	const currentSectionRef = useRef(0)
	const moveRpc = useAtomSet(RpcClient.mutation('portfolio.move'))
	const pointerFrameRef = useRef(0)
	const queuedPointerRef = useRef<{x: number; y: number} | undefined>(undefined)
	const lastSentPointerRef = useRef<{x: number; y: number; sentAt: number} | undefined>(undefined)
	const [identityColor, setIdentityColor] = useState(identity.color)
	const [showShortcuts, setShowShortcuts] = useState(false)

	useEffect(
		() => () => {
			if (pointerFrameRef.current) cancelAnimationFrame(pointerFrameRef.current)
		},
		[]
	)

	function scrollTo(index: number) {
		const target = sectionRefs.current[index]
		if (!target) return

		target.scrollIntoView({block: 'start', behavior: 'smooth'})
		currentSectionRef.current = index
	}

	function updateColor() {
		const nextColor = pickNextCursorColor(identityColor)
		const currentPointer = localPointer ?? lastSentPointerRef.current ?? {x: 0.5, y: 0.5}

		identity.color = nextColor
		setIdentityColor(nextColor)
		lastSentPointerRef.current = {x: currentPointer.x, y: currentPointer.y, sentAt: performance.now()}

		moveRpc({
			payload: {
				id: identity.id,
				x: currentPointer.x,
				y: currentPointer.y,
				color: nextColor
			}
		})
	}

	useHotkey('J', () => scrollTo(Math.min(currentSectionRef.current + 1, 5)))
	useHotkey('K', () => scrollTo(Math.max(currentSectionRef.current - 1, 0)))
	useHotkey('1', () => scrollTo(0))
	useHotkey('2', () => scrollTo(1))
	useHotkey('3', () => scrollTo(2))
	useHotkey('4', () => scrollTo(3))
	useHotkey('5', () => scrollTo(4))
	useHotkey('6', () => scrollTo(5))
	useHotkey('R', updateColor)
	useHotkey({key: '?', shift: true}, () => setShowShortcuts(show => !show))
	useHotkey('Escape', () => setShowShortcuts(false), {enabled: showShortcuts})

	return (
		<div
			className="relative min-h-0 flex-1 cursor-none snap-y snap-mandatory overflow-x-hidden overflow-y-scroll"
			onPointerMove={event => {
				if (!(viewport.width && viewport.height)) return

				const nextPointer = {
					x: clamp(event.clientX / viewport.width, 0, 0.999999),
					y: clamp(event.clientY / viewport.height, 0, 0.999999)
				}

				localPointer = {x: nextPointer.x, y: nextPointer.y, updatedAt: performance.now()}
				queuedPointerRef.current = nextPointer

				if (pointerFrameRef.current) return

				pointerFrameRef.current = requestAnimationFrame(() => {
					pointerFrameRef.current = 0

					if (!queuedPointerRef.current) return

					const now = performance.now()

					if (lastSentPointerRef.current) {
						const deltaX = queuedPointerRef.current.x - lastSentPointerRef.current.x
						const deltaY = queuedPointerRef.current.y - lastSentPointerRef.current.y

						if (now - lastSentPointerRef.current.sentAt < 50 && deltaX * deltaX + deltaY * deltaY < 0.0025 * 0.0025) {
							queuedPointerRef.current = undefined
							return
						}
					}

					if (lastSentPointerRef.current && now - lastSentPointerRef.current.sentAt < 50) return

					lastSentPointerRef.current = {
						x: queuedPointerRef.current.x,
						y: queuedPointerRef.current.y,
						sentAt: now
					}

					moveRpc({
						payload: {
							id: identity.id,
							x: queuedPointerRef.current.x,
							y: queuedPointerRef.current.y,
							color: identityColor
						}
					})

					queuedPointerRef.current = undefined
				})
			}}
			onScroll={event => {
				currentSectionRef.current = Math.round(event.currentTarget.scrollTop / event.currentTarget.clientHeight)
			}}
		>
			<HeroSection sectionRefs={sectionRefs} />
			<AboutSection sectionRefs={sectionRefs} />
			<SkillsSection sectionRefs={sectionRefs} />
			<ExperienceSection sectionRefs={sectionRefs} />
			<EducationSection sectionRefs={sectionRefs} />
			<ContactSection sectionRefs={sectionRefs} />

			<Suspense fallback={null}>
				<RealtimeLayer identityColor={identityColor} viewport={viewport} />
			</Suspense>

			<button
				type="button"
				aria-expanded={showShortcuts}
				aria-haspopup="dialog"
				aria-label="Toggle keyboard shortcuts"
				onClick={() => setShowShortcuts(show => !show)}
				className="fixed right-3 bottom-3 z-50 flex size-8 items-center justify-center border border-border/70 bg-background/95 font-mono text-muted-foreground text-xs backdrop-blur-sm transition-colors hover:border-primary/50 hover:text-primary sm:right-4 sm:bottom-4"
			>
				?
			</button>

			{showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
		</div>
	)
}

function RealtimeLayer(input: {readonly identityColor: string; readonly viewport: Viewport}) {
	const {value: state} = useAtomSuspense(portfolioAtom)

	return (
		<>
			<GridOverlay />
			<TrailCanvas trails={state.trails} viewport={input.viewport} />

			{Array.map(state.visitors, cursor => (
				<CursorEl key={cursor.id} cursor={cursor} isMe={cursor.id === identity.id} viewport={input.viewport} />
			))}

			<div className="pointer-events-none fixed bottom-3 left-3 z-50 flex items-center gap-2 border border-border/70 bg-background/95 px-3 py-2 font-mono text-[11px] backdrop-blur-sm sm:bottom-4 sm:left-4">
				<span
					className="size-2"
					// biome-ignore lint: packages/linter/src/no-inline-style.grit
					style={{backgroundColor: input.identityColor}}
				/>
				<span className="text-primary">{state.visitors.length}</span>
				<span className="text-muted-foreground">{state.visitors.length === 1 ? 'visitor' : 'visitors'}</span>
			</div>
		</>
	)
}

const GridOverlay = memo(function GridOverlay() {
	return (
		<div
			className="pointer-events-none fixed inset-0 z-[1]"
			// biome-ignore lint: packages/linter/src/no-inline-style.grit
			style={{
				backgroundImage:
					'linear-gradient(to right, rgb(255 255 255 / 0.03) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.03) 1px, transparent 1px)',
				backgroundSize: '26px 26px'
			}}
		/>
	)
})

const TrailCanvas = memo(function TrailCanvas(input: {
	readonly trails: readonly PortfolioTrail[]
	readonly viewport: Viewport
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null)

	useEffect(() => {
		if (!(canvasRef.current && input.viewport.width && input.viewport.height)) return

		const devicePixelRatio = window.devicePixelRatio || 1
		const canvasWidth = Math.max(1, Math.round(input.viewport.width * devicePixelRatio))
		const canvasHeight = Math.max(1, Math.round(input.viewport.height * devicePixelRatio))

		if (canvasRef.current.width !== canvasWidth || canvasRef.current.height !== canvasHeight) {
			canvasRef.current.width = canvasWidth
			canvasRef.current.height = canvasHeight
			canvasRef.current.style.width = `${input.viewport.width}px`
			canvasRef.current.style.height = `${input.viewport.height}px`
		}

		const context = canvasRef.current.getContext('2d')
		if (!context) return

		context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
		context.clearRect(0, 0, input.viewport.width, input.viewport.height)
		context.globalAlpha = 0.22

		const previousByVisitor = new Map<string, {trail: PortfolioTrail; col: number; row: number}>()

		for (const trail of input.trails) {
			const current = {...getTrailCell(trail, input.viewport), trail}
			const previous = previousByVisitor.get(trail.visitorId)

			if (previous) {
				const stepCount = Math.max(Math.abs(current.col - previous.col), Math.abs(current.row - previous.row))

				for (let step = 0; step <= stepCount; step++) {
					const progress = stepCount === 0 ? 1 : step / stepCount
					const col = Math.round(previous.col + (current.col - previous.col) * progress)
					const row = Math.round(previous.row + (current.row - previous.row) * progress)

					context.fillStyle = progress < 1 ? previous.trail.color : current.trail.color
					context.fillRect(col * 26 + 1, row * 26 + 1, 24, 24)
				}
			} else {
				context.fillStyle = current.trail.color
				context.fillRect(current.col * 26 + 1, current.row * 26 + 1, 24, 24)
			}

			previousByVisitor.set(trail.visitorId, current)
		}

		context.globalAlpha = 1
	}, [input.trails, input.viewport])

	return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[1]" />
})

const CursorEl = memo(function CursorEl(input: {
	readonly cursor: PortfolioVisitor
	readonly isMe: boolean
	readonly viewport: Viewport
}) {
	const nodeRef = useRef<HTMLDivElement | null>(null)
	const latestRef = useRef({cursor: input.cursor, isMe: input.isMe, viewport: input.viewport})
	const motionRef = useRef(
		createCursorMotion(getDisplayCursorTarget(input.cursor, input.isMe, input.viewport), input.viewport)
	)

	useEffect(() => {
		latestRef.current = {cursor: input.cursor, isMe: input.isMe, viewport: input.viewport}
		motionRef.current = syncCursorMotion(motionRef.current, input.cursor, input.isMe, input.viewport)

		if (nodeRef.current) setCursorTransform(nodeRef.current, motionRef.current.x, motionRef.current.y)
	}, [input.cursor, input.isMe, input.viewport])

	useEffect(() => {
		if (!nodeRef.current) return

		setCursorTransform(nodeRef.current, motionRef.current.x, motionRef.current.y)

		return subscribeFrame(now => {
			if (!nodeRef.current) return

			motionRef.current = stepCursorMotion(
				syncCursorMotion(
					motionRef.current,
					latestRef.current.cursor,
					latestRef.current.isMe,
					latestRef.current.viewport
				),
				now
			)

			setCursorTransform(nodeRef.current, motionRef.current.x, motionRef.current.y)
		})
	}, [])

	return (
		<div
			ref={nodeRef}
			className="pointer-events-none fixed top-0 left-0 z-50 will-change-transform"
			// biome-ignore lint: packages/linter/src/no-inline-style.grit
			style={{
				transform: `translate3d(${motionRef.current.x}px, ${motionRef.current.y}px, 0)`
			}}
		>
			<div className="flex items-center gap-1">
				{/* biome-ignore lint: packages/linter/src/no-inline-style.grit */}
				<MousePointer2 className="size-4" style={{color: input.cursor.color}} />
				<span
					className="whitespace-nowrap border bg-background px-1.5 py-1 font-mono text-[10px] text-foreground"
					// biome-ignore lint: packages/linter/src/no-inline-style.grit
					style={{borderColor: input.cursor.color}}
				>
					{input.cursor.name}
					{input.isMe ? ' (you)' : ''}
				</span>
			</div>
		</div>
	)
})

function Section(input: {
	readonly id: number
	readonly className?: string
	readonly children: ReactNode
	readonly sectionRefs: MutableRefObject<(HTMLElement | null)[]>
}) {
	return (
		<section
			ref={node => {
				input.sectionRefs.current[input.id] = node
			}}
			data-section={input.id}
			className={cn(
				'relative z-10 flex min-h-dvh snap-start flex-col items-center justify-center overflow-hidden px-4 py-16 sm:px-6',
				input.className
			)}
		>
			{input.children}
		</section>
	)
}

function SectionLabel(input: {readonly title: string}) {
	return (
		<div className="mb-8 flex w-full max-w-5xl items-center gap-4 sm:mb-10">
			<div className="h-px flex-1 bg-primary/25" />
			<h2 className="border border-primary/30 bg-background/88 px-5 py-2 font-bold font-mono text-primary text-xs uppercase tracking-[0.35em] backdrop-blur-sm sm:text-sm">
				{input.title}
			</h2>
			<div className="h-px flex-1 bg-primary/25" />
		</div>
	)
}

function HeroSection(input: {readonly sectionRefs: MutableRefObject<(HTMLElement | null)[]>}) {
	return (
		<Section id={0} sectionRefs={input.sectionRefs}>
			<Panel className="flex w-full max-w-5xl flex-col items-center gap-6 p-8 sm:gap-8 sm:p-12">
				<div className="space-y-1 text-center">
					<h1 className="font-black font-mono text-4xl text-foreground uppercase tracking-[0.15em] sm:text-5xl md:text-6xl">
						Matteo
					</h1>
					<h2 className="font-mono text-2xl text-foreground/50 uppercase tracking-[0.25em] sm:text-3xl md:text-4xl">
						Paludgnach
					</h2>
				</div>

				<p className="text-center font-mono text-foreground/70 text-xs uppercase tracking-[0.25em] sm:text-sm sm:tracking-[0.3em]">
					Full-Stack TypeScript Developer
				</p>

				<div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center font-mono text-[10px] text-muted-foreground/60 sm:text-[11px]">
					<span>Moimacco (UD), Italy</span>
					<span className="text-border/60">|</span>
					<span>React · TypeScript · Effect · Real-time</span>
				</div>
			</Panel>

			<div className="absolute bottom-8 flex flex-col items-center gap-1 text-muted-foreground/35">
				<span className="font-mono text-[10px] uppercase tracking-[0.3em]">scroll</span>
				<span className="text-[12px]">↓</span>
			</div>
		</Section>
	)
}

function AboutSection(input: {readonly sectionRefs: MutableRefObject<(HTMLElement | null)[]>}) {
	return (
		<Section id={1} sectionRefs={input.sectionRefs}>
			<SectionLabel title="About" />
			<div className="flex w-full max-w-5xl flex-col gap-4">
				<Panel className="p-5 sm:p-6">
					<div className="flex flex-col gap-4">
						{Array.map(SUMMARY_LINES, line => (
							<p key={line} className="font-mono text-foreground/90 text-sm leading-7 sm:text-base">
								{line}
							</p>
						))}
					</div>
				</Panel>
			</div>
		</Section>
	)
}

function SkillsSection(input: {readonly sectionRefs: MutableRefObject<(HTMLElement | null)[]>}) {
	return (
		<Section id={2} sectionRefs={input.sectionRefs}>
			<SectionLabel title="Skills" />
			<div className="grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{Array.map(TECHNICAL_SKILLS, skill => (
					<Panel key={skill.area} className="p-4 sm:p-5">
						<div className="mb-3 flex items-center gap-3">
							<skill.icon className="size-4 text-primary" />
							<h3 className="font-mono font-semibold text-foreground text-sm uppercase tracking-[0.18em]">
								{skill.area}
							</h3>
						</div>
						<p className="font-mono text-muted-foreground text-xs leading-6 sm:text-sm">{skill.items}</p>
					</Panel>
				))}
			</div>
		</Section>
	)
}

function ExperienceSection(input: {readonly sectionRefs: MutableRefObject<(HTMLElement | null)[]>}) {
	return (
		<Section id={3} sectionRefs={input.sectionRefs}>
			<SectionLabel title="Experience" />
			<div className="flex w-full max-w-5xl flex-col gap-4">
				{Array.map(WORK_EXPERIENCE, job => (
					<Panel key={job.company} className="px-4 py-4 sm:px-5">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
							<div className="space-y-1">
								<p className="font-mono font-semibold text-foreground text-sm uppercase tracking-[0.08em]">
									{job.company}
								</p>
								<div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-muted-foreground text-xs sm:text-sm">
									<span>{job.role}</span>
									{job.note && <span className="text-muted-foreground/80">· {job.note}</span>}
								</div>
							</div>
							<p className="font-mono text-[11px] text-muted-foreground sm:text-right">
								{job.period} · {job.location}
							</p>
						</div>
						<ul className="mt-3 flex flex-col gap-1.5">
							{Array.map(job.highlights, highlight => (
								<li
									key={highlight}
									className="flex items-start gap-2 font-mono text-foreground/85 text-xs leading-6 sm:text-sm"
								>
									<span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/50" aria-hidden="true" />
									<span>{highlight}</span>
								</li>
							))}
						</ul>
					</Panel>
				))}
			</div>
		</Section>
	)
}

function EducationSection(input: {readonly sectionRefs: MutableRefObject<(HTMLElement | null)[]>}) {
	return (
		<Section id={4} sectionRefs={input.sectionRefs}>
			<SectionLabel title="Education & Languages" />
			<div className="flex w-full max-w-5xl flex-col gap-4">
				{Array.map(EDUCATION_DATA, entry => (
					<Panel key={entry.school} className="px-4 py-4 sm:px-5">
						<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
							<div className="flex flex-wrap items-baseline gap-x-3">
								<span className="font-mono font-semibold text-foreground text-sm">{entry.school}</span>
								<span className="font-mono text-muted-foreground text-xs sm:text-sm">{entry.degree}</span>
								{entry.grade && <span className="font-mono text-[10px] text-muted-foreground/80">({entry.grade})</span>}
							</div>
							<span className="font-mono text-[10px] text-muted-foreground/80">{entry.period}</span>
						</div>
						<p className="mt-2 font-mono text-foreground/85 text-xs leading-6 sm:text-sm">{entry.description}</p>
					</Panel>
				))}
				<div className="grid gap-3 sm:grid-cols-3">
					{Array.map(LANGUAGES_DATA, lang => (
						<Panel key={lang.language} className="px-4 py-3">
							<span className="font-mono font-semibold text-foreground text-xs">{lang.language}</span>
							<span className="ml-2 font-mono text-[10px] text-muted-foreground/80">{lang.level}</span>
						</Panel>
					))}
				</div>
			</div>
		</Section>
	)
}

function ContactSection(input: {readonly sectionRefs: MutableRefObject<(HTMLElement | null)[]>}) {
	return (
		<Section id={5} sectionRefs={input.sectionRefs}>
			<SectionLabel title="Contact" />
			<div className="flex w-full max-w-5xl flex-col gap-3">
				{Array.map(CONTACT_ITEMS, item => (
					<a
						key={item.label}
						href={item.href}
						className="flex flex-col gap-2 border border-border/70 bg-background/90 px-4 py-4 font-mono text-xs backdrop-blur-sm transition-colors hover:border-primary/50 hover:text-primary sm:flex-row sm:items-center sm:justify-between sm:text-sm"
						target="_blank"
						rel="noopener noreferrer"
					>
						<span className="text-[10px] text-muted-foreground uppercase tracking-[0.15em]">{item.label}</span>
						<span className="break-all text-foreground">{item.value}</span>
					</a>
				))}
			</div>
			<p className="mt-6 font-mono text-[10px] text-muted-foreground/70">
				© 2026 Matteo Paludgnach · Moimacco (UD), Italy
			</p>
		</Section>
	)
}

function ShortcutsOverlay(input: {readonly onClose: () => void}) {
	return (
		<Dialog open onOpenChange={open => !open && input.onClose()}>
			<DialogContent className="border-border/70 bg-background p-6 font-mono sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="font-mono text-foreground text-sm uppercase tracking-[0.2em]">
						Keyboard Shortcuts
					</DialogTitle>
				</DialogHeader>
				<div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-muted-foreground text-xs sm:gap-x-8">
					<span className="text-foreground">j / k</span>
					<span>next / prev section</span>
					<span className="text-foreground">1 – 6</span>
					<span>jump to section</span>
					<span className="text-foreground">r</span>
					<span>change cursor color</span>
					<span className="text-foreground">?</span>
					<span>toggle this overlay</span>
					<span className="text-foreground">Esc</span>
					<span>close this overlay</span>
				</div>
			</DialogContent>
		</Dialog>
	)
}
