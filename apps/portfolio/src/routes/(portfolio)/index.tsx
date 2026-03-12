import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Number, pipe, String} from 'effect'

import {MousePointer2} from '@ai-toolkit/components/icons'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@ai-toolkit/components/ui/dialog'
import {cn} from '@ai-toolkit/components/utils'
import {useHotkey} from '@tanstack/react-hotkeys'
import {createFileRoute} from '@tanstack/react-router'
import type {MutableRefObject, ReactNode} from 'react'
import {Suspense, useRef, useState, useSyncExternalStore} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {identity, portfolioAtom} from '#lib/portfolioAtom.ts'
import type {PortfolioVisitor} from '#rpcs/portfolio/contracts.ts'

const GRID_CELL = 24
const SECTION_COUNT = 6
const SUMMARY_LINES = [
	'Full-stack TypeScript developer with production experience building real-time, type-safe web applications using React, Node.js, and PostgreSQL.',
	'Delivers features end-to-end from gathering user requirements to deploying containerized services in fast-paced, cross-functional teams.',
	'Uses AI coding agents daily to accelerate development, refactoring, and testing while enforcing manual code review to maintain consistency and code quality.'
]

const TECHNICAL_SKILLS = [
	{
		area: 'Frontend',
		items:
			'React, TypeScript, TanStack (Router, Table, Form), Tailwind CSS, Responsive Design, Performance Optimization'
	},
	{area: 'Backend', items: 'Node.js, Effect-TS (functional TypeScript library), RESTful API, OpenAPI'},
	{area: 'Data & Real-Time', items: 'PostgreSQL, Redis, WebSockets, SSE (server-sent events)'},
	{area: 'DevOps', items: 'Docker, GitHub Actions, Git, Linux'},
	{area: 'Testing', items: 'End-to-end testing, Unit testing, Type-safe APIs'},
	{area: 'AI Tooling', items: 'AI coding agents, AI-assisted code review, Prompt engineering for development workflows'}
]

const WORK_EXPERIENCE = [
	{
		company: 'Tinexta Cyber',
		role: 'Full-Stack Developer',
		period: 'Oct 2024 – Present',
		location: 'Udine, Italy',
		note: '',
		summary:
			'Real-time network inventory for a major telco: React + ElectricSQL frontend, type-safe RPC client from OpenAPI schema, Docker/Jenkins CI/CD, AI-assisted development across 3+ projects and tech stacks.'
	},
	{
		company: 'Altitudo',
		role: 'Frontend Developer',
		period: 'Jan 2024 – Mar 2024',
		location: 'Salzburg, Austria',
		note: 'Erasmus Internship',
		summary:
			'Migrated build system CRA → Vite, improved rendering performance via memoization, migrated class components to React hooks, restyled pages with Tailwind CSS.'
	},
	{
		company: 'BizAway',
		role: 'Backend Developer',
		period: 'Jun 2023 – Aug 2023',
		location: 'Spilimbergo, Italy',
		note: 'Internship',
		summary:
			'Type-safe E2E testing framework on top of OpenAPI schema using Playwright, TSX-based email template system, migrated API endpoints, built Angular components.'
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
	{label: 'Portfolio', value: 'portfolio.mp281x.xyz', href: 'https://portfolio.mp281x.xyz'},
	{label: 'GitHub', value: 'github.com/MP281X', href: 'https://github.com/MP281X'}
]

function getViewport() {
	return {
		width: window.innerWidth,
		height: window.innerHeight,
		cols: Math.ceil(window.innerWidth / GRID_CELL),
		rows: Math.ceil(window.innerHeight / GRID_CELL)
	}
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
	const nextWidth = Number.parse(width) || 0
	const nextHeight = Number.parse(height) || 0

	return {
		width: nextWidth,
		height: nextHeight,
		cols: Math.ceil(nextWidth / GRID_CELL),
		rows: Math.ceil(nextHeight / GRID_CELL)
	}
}

function Panel(input: {readonly className?: string; readonly children: ReactNode}) {
	return <div className={cn('border border-border/70 bg-background/92', input.className)}>{input.children}</div>
}

export const Route = createFileRoute('/(portfolio)/')({
	component: PortfolioRoute
})

function PortfolioRoute() {
	const viewport = useViewport()
	const sectionRefs = useRef<(HTMLElement | null)[]>(Array.makeBy(SECTION_COUNT, () => null))
	const currentSectionRef = useRef(0)
	const moveRpc = useAtomSet(RpcClient.mutation('portfolio.move'))
	const lastSentRef = useRef(0)
	const [showShortcuts, setShowShortcuts] = useState(false)

	function scrollTo(index: number) {
		const target = sectionRefs.current[index]
		if (!target) return

		target.scrollIntoView({block: 'start', behavior: 'smooth'})
		currentSectionRef.current = index
	}

	useHotkey('J', () => scrollTo(Math.min(currentSectionRef.current + 1, SECTION_COUNT - 1)))
	useHotkey('K', () => scrollTo(Math.max(currentSectionRef.current - 1, 0)))
	useHotkey('1', () => scrollTo(0))
	useHotkey('2', () => scrollTo(1))
	useHotkey('3', () => scrollTo(2))
	useHotkey('4', () => scrollTo(3))
	useHotkey('5', () => scrollTo(4))
	useHotkey('6', () => scrollTo(5))
	useHotkey({key: '?', shift: true}, () => setShowShortcuts(show => !show))
	useHotkey('Escape', () => setShowShortcuts(false), {enabled: showShortcuts})

	return (
		<div
			className="relative min-h-0 flex-1 snap-y snap-mandatory overflow-x-hidden overflow-y-scroll"
			onPointerMove={event => {
				if (!(viewport.width && viewport.height)) return

				const now = Date.now()
				if (now - lastSentRef.current < 16) return

				lastSentRef.current = now
				moveRpc({
					payload: {
						id: identity.id,
						x: Math.max(0, Math.min(0.999999, event.clientX / viewport.width)),
						y: Math.max(0, Math.min(0.999999, event.clientY / viewport.height)),
						color: identity.color
					}
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
				<RealtimeLayer viewport={viewport} />
			</Suspense>

			{showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
		</div>
	)
}

function RealtimeLayer(input: {readonly viewport: ReturnType<typeof getViewport>}) {
	const {value: state} = useAtomSuspense(portfolioAtom)

	return (
		<>
			{input.viewport.cols > 0 && input.viewport.rows > 0 && (
				<div
					key={`${input.viewport.cols}-${input.viewport.rows}`}
					className="pointer-events-none fixed inset-0 z-[1] grid"
					// biome-ignore lint: packages/linter/src/no-inline-style.grit
					style={{
						gridTemplateColumns: `repeat(${input.viewport.cols}, ${GRID_CELL}px)`,
						gridTemplateRows: `repeat(${input.viewport.rows}, ${GRID_CELL}px)`
					}}
				>
					{Array.makeBy(input.viewport.cols * input.viewport.rows, index => (
						<div key={index} className="border-white/6 border-r border-b" />
					))}
					{Array.map(state.trails, (trail, index) => {
						const col = Math.floor((trail.x * input.viewport.width) / GRID_CELL)
						const row = Math.floor((trail.y * input.viewport.height) / GRID_CELL)

						return (
							<div
								key={`${trail.color}-${index}`}
								className="m-px"
								// biome-ignore lint: packages/linter/src/no-inline-style.grit
								style={{
									gridColumn: `${col + 1} / span 1`,
									gridRow: `${row + 1} / span 1`,
									backgroundColor: trail.color,
									opacity: 0.22
								}}
							/>
						)
					})}
				</div>
			)}

			{Array.map(state.visitors, cursor => (
				<CursorEl key={cursor.id} cursor={cursor} isMe={cursor.id === identity.id} />
			))}

			<Panel className="pointer-events-none fixed top-3 right-3 z-50 flex items-center gap-2 px-3 py-2 font-mono text-[11px] sm:top-4 sm:right-4">
				<span
					className="size-2"
					// biome-ignore lint: packages/linter/src/no-inline-style.grit
					style={{backgroundColor: identity.color}}
				/>
				<span className="text-primary">{state.visitors.length}</span>
				<span className="text-muted-foreground">{state.visitors.length === 1 ? 'visitor' : 'visitors'}</span>
			</Panel>
		</>
	)
}

function CursorEl(input: {readonly cursor: PortfolioVisitor; readonly isMe: boolean}) {
	return (
		<div
			className="pointer-events-none fixed z-50 transition-[left,top] duration-75 ease-linear"
			// biome-ignore lint: packages/linter/src/no-inline-style.grit
			style={{
				left: `${input.cursor.x * 100}%`,
				top: `${input.cursor.y * 100}%`
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
}

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
		<div className="mb-6 flex w-full max-w-5xl items-center gap-3 sm:mb-8">
			<div className="h-px flex-1 bg-border/80" />
			<div className="border border-border/80 bg-background px-3 py-1">
				<h2 className="font-mono font-semibold text-[11px] text-foreground uppercase tracking-[0.3em]">
					{input.title}
				</h2>
			</div>
			<div className="h-px flex-1 bg-border/80" />
		</div>
	)
}

function HeroSection(input: {readonly sectionRefs: MutableRefObject<(HTMLElement | null)[]>}) {
	return (
		<Section id={0} className="gap-4 text-center" sectionRefs={input.sectionRefs}>
			<Panel className="w-full max-w-5xl px-6 py-8 sm:px-8 sm:py-10">
				<div className="fade-in slide-in-from-bottom-2 animate-in space-y-4 duration-500">
					<div className="space-y-2">
						<p className="font-mono text-[11px] text-primary uppercase tracking-[0.35em]">Portfolio</p>
						<h1 className="font-mono text-4xl text-foreground uppercase tracking-[0.18em] sm:text-6xl md:text-7xl">
							Matteo
						</h1>
						<h1 className="font-mono text-3xl text-foreground/80 uppercase tracking-[0.28em] sm:text-5xl md:text-6xl">
							Paludgnach
						</h1>
					</div>
					<div className="mx-auto h-px w-full max-w-xl bg-border/70" />
					<p className="font-mono text-foreground text-sm uppercase tracking-[0.24em] sm:text-base">
						Full-Stack TypeScript Developer
					</p>
					<div className="flex flex-wrap items-center justify-center gap-2 font-mono text-muted-foreground text-xs sm:gap-3">
						<span className="border border-border/70 bg-background px-3 py-1">Moimacco (UD), Italy</span>
						<span className="border border-border/70 bg-background px-3 py-1">React · TypeScript · Real-time Apps</span>
					</div>
				</div>
			</Panel>
			<div className="absolute bottom-8 flex flex-col items-center gap-1 text-muted-foreground/70">
				<span className="font-mono text-[10px] uppercase tracking-widest">j / scroll</span>
				<span>↓</span>
			</div>
		</Section>
	)
}

function AboutSection(input: {readonly sectionRefs: MutableRefObject<(HTMLElement | null)[]>}) {
	return (
		<Section id={1} className="gap-2" sectionRefs={input.sectionRefs}>
			<SectionLabel title="About" />
			<Panel className="flex w-full max-w-5xl flex-col gap-5 p-5 sm:p-6">
				{Array.map(SUMMARY_LINES, line => (
					<p key={line} className="font-mono text-foreground/90 text-sm leading-7 sm:text-base">
						{line}
					</p>
				))}
				<div className="grid gap-3 pt-1 sm:grid-cols-2">
					{Array.map(CONTACT_ITEMS, item => (
						<div key={item.label} className="border border-border/70 bg-background px-4 py-3">
							<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">{item.label}</p>
							<p className="mt-1 break-all font-mono text-foreground text-xs sm:text-sm">{item.value}</p>
						</div>
					))}
				</div>
			</Panel>
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
						<h3 className="mb-2 font-mono font-semibold text-foreground text-sm uppercase tracking-[0.18em]">
							{skill.area}
						</h3>
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
			<Panel className="flex w-full max-w-5xl flex-col gap-4 p-5 sm:p-6">
				{Array.map(WORK_EXPERIENCE, job => (
					<div key={job.company} className="border border-border/70 bg-background px-4 py-4 sm:px-5">
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
						<p className="mt-3 font-mono text-foreground/85 text-xs leading-6 sm:text-sm">{job.summary}</p>
					</div>
				))}
			</Panel>
		</Section>
	)
}

function EducationSection(input: {readonly sectionRefs: MutableRefObject<(HTMLElement | null)[]>}) {
	return (
		<Section id={4} sectionRefs={input.sectionRefs}>
			<SectionLabel title="Education & Languages" />
			<Panel className="flex w-full max-w-5xl flex-col gap-6 p-5 sm:p-6">
				<div className="flex flex-col gap-5">
					{Array.map(EDUCATION_DATA, entry => (
						<div key={entry.school} className="border border-border/70 bg-background px-4 py-4 sm:px-5">
							<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
								<div className="flex flex-wrap items-baseline gap-x-3">
									<span className="font-mono font-semibold text-foreground text-sm">{entry.school}</span>
									<span className="font-mono text-muted-foreground text-xs sm:text-sm">{entry.degree}</span>
									{entry.grade && (
										<span className="font-mono text-[10px] text-muted-foreground/80">({entry.grade})</span>
									)}
								</div>
								<span className="font-mono text-[10px] text-muted-foreground/80">{entry.period}</span>
							</div>
							<p className="mt-2 font-mono text-foreground/85 text-xs leading-6 sm:text-sm">{entry.description}</p>
						</div>
					))}
				</div>
				<div className="flex flex-col gap-3">
					<h3 className="font-mono font-semibold text-foreground text-sm uppercase tracking-[0.18em]">Languages</h3>
					<div className="grid gap-3 sm:grid-cols-3">
						{Array.map(LANGUAGES_DATA, lang => (
							<div key={lang.language} className="border border-border/70 bg-background px-4 py-3">
								<span className="font-mono font-semibold text-foreground text-xs">{lang.language}</span>
								<span className="ml-2 font-mono text-[10px] text-muted-foreground/80">{lang.level}</span>
							</div>
						))}
					</div>
				</div>
			</Panel>
		</Section>
	)
}

function ContactSection(input: {readonly sectionRefs: MutableRefObject<(HTMLElement | null)[]>}) {
	return (
		<Section id={5} className="gap-2" sectionRefs={input.sectionRefs}>
			<SectionLabel title="Contact" />
			<Panel className="flex w-full max-w-3xl flex-col gap-4 p-5 sm:p-6">
				{Array.map(CONTACT_ITEMS, item => (
					<a
						key={item.label}
						href={item.href}
						className="flex flex-col gap-2 border border-border/70 bg-background px-4 py-4 font-mono text-xs transition-colors hover:border-primary/50 hover:text-primary sm:flex-row sm:items-center sm:justify-between sm:text-sm"
						target="_blank"
						rel="noopener noreferrer"
					>
						<span className="text-[10px] text-muted-foreground uppercase tracking-[0.15em]">{item.label}</span>
						<span className="break-all text-foreground">{item.value}</span>
					</a>
				))}
			</Panel>
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
					<span className="text-foreground">? (Shift+/)</span>
					<span>toggle this overlay</span>
					<span className="text-foreground">Esc</span>
					<span>close this overlay</span>
				</div>
			</DialogContent>
		</Dialog>
	)
}
