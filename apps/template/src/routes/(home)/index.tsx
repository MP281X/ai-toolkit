import {Effect, Fiber, pipe, Stream} from 'effect'

import type {Model} from '@ai-toolkit/ai/schema'
import {ModelSelector} from '@ai-toolkit/components/ai/model-selector'
import {Badge} from '@ai-toolkit/components/ui/badge'
import {Button} from '@ai-toolkit/components/ui/button'
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@ai-toolkit/components/ui/card'
import {Input} from '@ai-toolkit/components/ui/input'
import {Separator} from '@ai-toolkit/components/ui/separator'
import {Textarea} from '@ai-toolkit/components/ui/textarea'
import {cn} from '@ai-toolkit/components/utils'
import type {QuestionId, QuestionRaised, SessionId, StoredEvent} from '@ai-toolkit/research/schema'
import {useAtomRefresh, useAtomSuspense} from '@effect-atom/atom-react'
import {createFileRoute} from '@tanstack/react-router'
import {useEffect, useMemo, useRef, useState} from 'react'

import {ApiClient, AtomRuntime} from '#lib/atomRuntime.ts'

function isProgressEvent(
	stored: StoredEvent
): stored is StoredEvent & {event: {readonly _tag: 'progress'; readonly ratio: number}} {
	return stored.event._tag === 'progress'
}

function isTokenEvent(stored: StoredEvent): stored is StoredEvent & {
	event: {readonly _tag: 'token'; readonly kind: 'text' | 'reasoning'; readonly text: string}
} {
	return stored.event._tag === 'token'
}

function isAgentCompletedEvent(stored: StoredEvent): stored is StoredEvent & {
	event: {readonly _tag: 'agent-completed'; readonly agentId: string; readonly summary: string}
} {
	return stored.event._tag === 'agent-completed'
}

function isPlanReadyEvent(stored: StoredEvent): stored is StoredEvent & {
	event: {
		readonly _tag: 'plan-ready'
		readonly steps: readonly {
			readonly id: string
			readonly title: string
			readonly detail: string
			readonly status: string
		}[]
	}
} {
	return stored.event._tag === 'plan-ready'
}

const clientAtom = AtomRuntime.atom(
	Effect.gen(function* () {
		const client = yield* ApiClient
		return client
	})
)

const sessionsAtom = AtomRuntime.atom(
	Effect.gen(function* () {
		const client = yield* ApiClient
		return yield* client('ListSessions', void 0)
	})
)

const feedAtom = AtomRuntime.atom(
	Effect.gen(function* () {
		const client = yield* ApiClient
		return yield* client('ListFeed', void 0)
	})
)

export const Route = createFileRoute('/(home)/')({component: RouteComponent})

function RouteComponent() {
	const {value: clientResult} = useAtomSuspense(clientAtom)
	const client = clientResult

	const {value: sessionsResult} = useAtomSuspense(sessionsAtom)
	const sessions = sessionsResult
	const refreshSessions = useAtomRefresh(sessionsAtom)

	const {value: feedResult} = useAtomSuspense(feedAtom)
	const feed = feedResult
	const refreshFeed = useAtomRefresh(feedAtom)

	const [topic, setTopic] = useState('')
	const [mode, setMode] = useState<'fast' | 'deep'>('fast')
	const [model, setModel] = useState<Model>({provider: 'opencode_zen', model: 'kimi-k2.5-free'})
	const [eventsBySession, setEventsBySession] = useState<Record<string, readonly StoredEvent[]>>({})
	const [selectedSessionId, setSelectedSessionId] = useState<SessionId>()
	const [subscriptionTopic, setSubscriptionTopic] = useState('')
	const [intervalMinutes, setIntervalMinutes] = useState('5')
	const streamFiberRef = useRef<Fiber.RuntimeFiber<void, never> | undefined>(undefined)

	useEffect(() => {
		return () => {
			if (streamFiberRef.current) Fiber.interrupt(streamFiberRef.current)
		}
	}, [])

	useEffect(() => {
		if (sessions.length === 0 || selectedSessionId) return
		const firstSession = sessions[0]
		if (!firstSession) return
		setSelectedSessionId(firstSession.id)
	}, [sessions, selectedSessionId])

	const activeEvents = useMemo(() => {
		if (!selectedSessionId) return [] as readonly StoredEvent[]
		const key = globalThis.String(selectedSessionId)
		return eventsBySession[key] ?? []
	}, [eventsBySession, selectedSessionId])

	const pendingQuestion = useMemo(() => {
		let current: QuestionRaised | undefined
		for (const stored of activeEvents) {
			if (stored.event._tag === 'question') current = stored.event
			if (stored.event._tag === 'question-answered' && current && current.questionId === stored.event.questionId)
				current = undefined
		}
		return current
	}, [activeEvents])

	const latestProgress = useMemo(() => {
		const progress = activeEvents.filter(isProgressEvent)
		return progress.at(-1)?.event.ratio ?? 0
	}, [activeEvents])

	const tokens = useMemo(
		() =>
			activeEvents
				.filter(isTokenEvent)
				.filter(event => event.event.kind === 'text')
				.map(event => event.event.text)
				.join(''),
		[activeEvents]
	)

	const reasoning = useMemo(
		() =>
			activeEvents
				.filter(isTokenEvent)
				.filter(event => event.event.kind === 'reasoning')
				.map(event => event.event.text)
				.join(''),
		[activeEvents]
	)

	const agentFindings = useMemo(
		() =>
			activeEvents
				.filter(isAgentCompletedEvent)
				.map(event => ({agentId: event.event.agentId, summary: event.event.summary})),
		[activeEvents]
	)

	function stopStream() {
		if (!streamFiberRef.current) return
		Effect.runFork(Fiber.interrupt(streamFiberRef.current))
		streamFiberRef.current = undefined
	}

	function consumeStream(stream: Stream.Stream<StoredEvent, never, never>) {
		stopStream()

		streamFiberRef.current = Effect.runFork(
			pipe(
				Stream.runForEach(stream, event =>
					Effect.sync(() => {
						const sessionId = event.event.sessionId
						const key = globalThis.String(sessionId)
						setSelectedSessionId(current => current ?? sessionId)
						setEventsBySession(current => {
							const currentEvents = current[key] ?? []
							return {...current, [key]: [...currentEvents, event]}
						})
						if (event.event._tag === 'report-ready') refreshFeed()
					})
				),
				Effect.tap(() => Effect.sync(refreshSessions))
			)
		)
	}

	function startResearch() {
		if (!topic.trim()) return
		const payload = {topic, model}
		const stream = (mode === 'fast' ? client('StartFastResearch', payload) : client('StartDeepResearch', payload)).pipe(
			Stream.orDie
		)
		consumeStream(stream)
		refreshSessions()
	}

	function resumeSession(sessionId: SessionId) {
		const key = globalThis.String(sessionId)
		const lastEventId = eventsBySession[key]?.at(-1)?.eventId ?? -1
		const stream = client('ResumeSession', {sessionId, fromEventId: lastEventId}).pipe(Stream.orDie)
		setSelectedSessionId(sessionId)
		consumeStream(stream)
	}

	function answerQuestion(questionId: QuestionId, answer: string) {
		if (!selectedSessionId) return
		const stream = client('AnswerQuestion', {sessionId: selectedSessionId, questionId, answer, model}).pipe(
			Stream.orDie
		)
		consumeStream(stream)
	}

	async function subscribeTopic() {
		if (!subscriptionTopic.trim()) return
		const intervalMs = globalThis.Number.parseInt(intervalMinutes, 10) * 60_000
		await Effect.runPromise(client('SubscribeTopic', {topic: subscriptionTopic, intervalMs, model: model.model}))
		refreshSessions()
	}

	const activeSession = sessions.find(session => selectedSessionId && session.id === selectedSessionId)

	return (
		<div className="flex min-h-dvh flex-col gap-6 bg-background p-6 text-foreground">
			<header className="flex flex-col gap-3 rounded-lg border border-foreground px-4 py-3 shadow-[4px_4px_0_0_theme(colors.foreground)]">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex flex-col gap-1">
						<div className="text-muted-foreground text-sm uppercase tracking-wide">Autonomous research</div>
						<div className="font-bold text-2xl leading-tight">Perplexity-style multi-agent workspace</div>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant={mode === 'fast' ? 'default' : 'outline'}
							onClick={() => setMode('fast')}
							className="rounded-none border border-foreground px-4 py-2 font-semibold shadow-[2px_2px_0_0_theme(colors.foreground)]"
						>
							Fast
						</Button>
						<Button
							variant={mode === 'deep' ? 'default' : 'outline'}
							onClick={() => setMode('deep')}
							className="rounded-none border border-foreground px-4 py-2 font-semibold shadow-[2px_2px_0_0_theme(colors.foreground)]"
						>
							Deep
						</Button>
					</div>
				</div>
				<div className="text-muted-foreground text-sm">
					Live streams, resumable sessions, council synthesis, feed with citations. Pick a topic, choose depth, and
					watch tokens land in real time.
				</div>
			</header>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-4">
				<section className="col-span-1 flex flex-col gap-3 rounded-lg border border-foreground p-4 shadow-[4px_4px_0_0_theme(colors.foreground)]">
					<div className="flex items-center justify-between">
						<h2 className="font-semibold text-lg">Create or resume</h2>
						<Badge variant="outline">Resumable</Badge>
					</div>
					<Textarea
						placeholder="What should we research?"
						value={topic}
						onChange={event => setTopic(event.target.value)}
						className="min-h-[120px] rounded-none border-foreground bg-background"
					/>
					<ModelSelector model={model} onModelChange={setModel} />
					<Button
						onClick={startResearch}
						className="rounded-none border border-foreground bg-foreground text-background shadow-[3px_3px_0_0_theme(colors.foreground)]"
					>
						Start {mode === 'fast' ? 'fast' : 'deep'} research
					</Button>
					<Separator />
					<div className="flex items-center justify-between">
						<h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-tight">Active sessions</h3>
						<Button size="sm" variant="outline" className="rounded-none border-foreground" onClick={refreshSessions}>
							Refresh
						</Button>
					</div>
					<div className="flex flex-col gap-2">
						{sessions.map(session => {
							const isActive = selectedSessionId && session.id === selectedSessionId
							return (
								<Button
									key={session.id}
									variant={isActive ? 'default' : 'outline'}
									className={cn(
										'w-full justify-start rounded-none border border-foreground',
										isActive ? 'bg-foreground text-background' : 'bg-background'
									)}
									onClick={() => resumeSession(session.id)}
								>
									<div className="flex flex-col items-start gap-1 text-left">
										<div className="font-semibold text-sm">{session.topic}</div>
										<div className="flex items-center gap-2 text-xs uppercase tracking-tight">
											<span>{session.mode}</span>
											<span className="text-muted-foreground">•</span>
											<span>{session.status}</span>
										</div>
									</div>
								</Button>
							)
						})}
						{sessions.length === 0 && <div className="text-muted-foreground text-sm">No sessions yet</div>}
					</div>
					<Separator />
					<div className="flex flex-col gap-2">
						<div className="font-semibold text-muted-foreground text-sm uppercase tracking-tight">
							Feed subscription
						</div>
						<Input
							placeholder="Topic for scheduled deep dives"
							value={subscriptionTopic}
							onChange={event => setSubscriptionTopic(event.target.value)}
							className="rounded-none border-foreground"
						/>
						<Input
							type="number"
							min="1"
							value={intervalMinutes}
							onChange={event => setIntervalMinutes(event.target.value)}
							className="rounded-none border-foreground"
						/>
						<Button variant="outline" className="rounded-none border border-foreground" onClick={subscribeTopic}>
							Add to feed cron
						</Button>
					</div>
				</section>

				<section className="col-span-2 flex flex-col gap-4 rounded-lg border border-foreground p-4 shadow-[4px_4px_0_0_theme(colors.foreground)]">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h2 className="font-semibold text-lg">Live workspace</h2>
						<div className="flex items-center gap-2 text-muted-foreground text-sm">
							<span>Progress</span>
							<div className="h-2 w-28 border border-foreground bg-background">
								<div className="h-full bg-foreground" style={{width: `${latestProgress * 100}%`}} />
							</div>
						</div>
					</div>
					{activeSession && (
						<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs uppercase tracking-tight">
							<Badge variant="outline">{activeSession.mode}</Badge>
							<span className="font-semibold text-foreground">{activeSession.topic}</span>
							<span>session #{activeSession.id}</span>
						</div>
					)}
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<Card className="rounded-none border border-foreground shadow-[3px_3px_0_0_theme(colors.foreground)]">
							<CardHeader>
								<CardTitle>Plan and agents</CardTitle>
								<CardDescription>Streaming plan, agent steps, checkpoints.</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-3">
								<div className="flex flex-col gap-2">
									{activeEvents
										.filter(isPlanReadyEvent)
										.flatMap(event => event.event.steps)
										.map(step => (
											<div
												key={step.id}
												className="flex items-center justify-between border border-foreground border-dashed px-2 py-1 text-sm"
											>
												<span className="font-semibold">{step.title}</span>
												<Badge variant="outline">{step.status}</Badge>
											</div>
										))}
								</div>
								<Separator />
								<div className="flex flex-col gap-2">
									{agentFindings.map(agent => (
										<div key={agent.agentId} className="border border-foreground px-2 py-1 text-sm">
											<div className="text-muted-foreground text-xs uppercase tracking-tight">{agent.agentId}</div>
											<div className="font-semibold">{agent.summary}</div>
										</div>
									))}
									{agentFindings.length === 0 && (
										<div className="text-muted-foreground text-sm">Sub-agents will populate here.</div>
									)}
								</div>
							</CardContent>
						</Card>
						<Card className="rounded-none border border-foreground shadow-[3px_3px_0_0_theme(colors.foreground)]">
							<CardHeader>
								<CardTitle>Questions & controls</CardTitle>
								<CardDescription>Runs pause on questions; answer to resume.</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-3">
								{pendingQuestion ? (
									<div className="flex flex-col gap-2">
										<div className="font-semibold">{pendingQuestion.prompt}</div>
										<div className="flex flex-wrap gap-2">
											{pendingQuestion.options.map(option => (
												<Button
													key={option}
													variant="outline"
													className="rounded-none border border-foreground"
													onClick={() => answerQuestion(pendingQuestion.questionId, option)}
												>
													{option}
												</Button>
											))}
										</div>
									</div>
								) : (
									<div className="text-muted-foreground text-sm">No pending questions.</div>
								)}
								<Button
									variant="outline"
									className="rounded-none border border-foreground"
									onClick={() => stopStream()}
								>
									Cancel current stream
								</Button>
							</CardContent>
						</Card>
					</div>
					<Separator />
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<Card className="rounded-none border border-foreground shadow-[3px_3px_0_0_theme(colors.foreground)]">
							<CardHeader>
								<CardTitle>Reasoning</CardTitle>
								<CardDescription>Real-time chain-of-thought</CardDescription>
							</CardHeader>
							<CardContent className="min-h-[200px] whitespace-pre-wrap text-sm leading-relaxed">
								{reasoning || <span className="text-muted-foreground">Reasoning will stream here.</span>}
							</CardContent>
						</Card>
						<Card className="rounded-none border border-foreground shadow-[3px_3px_0_0_theme(colors.foreground)]">
							<CardHeader>
								<CardTitle>Report stream</CardTitle>
								<CardDescription>Tokens and checkpoints</CardDescription>
							</CardHeader>
							<CardContent className="min-h-[200px] whitespace-pre-wrap text-sm leading-relaxed">
								{tokens || <span className="text-muted-foreground">Tokens will stream here.</span>}
							</CardContent>
						</Card>
					</div>
				</section>

				<section className="col-span-1 flex flex-col gap-3 rounded-lg border border-foreground p-4 shadow-[4px_4px_0_0_theme(colors.foreground)]">
					<div className="flex items-center justify-between">
						<h2 className="font-semibold text-lg">Feed</h2>
						<Button size="sm" variant="outline" className="rounded-none border-foreground" onClick={refreshFeed}>
							Refresh
						</Button>
					</div>
					<div className="flex flex-col gap-3">
						{feed.map(item => (
							<Card
								key={item.id}
								className="rounded-none border border-foreground bg-background shadow-[2px_2px_0_0_theme(colors.foreground)]"
							>
								<CardHeader>
									<CardTitle className="text-base">{item.report.title}</CardTitle>
									<CardDescription className="flex items-center gap-2 text-xs uppercase tracking-tight">
										<span>{item.mode}</span>
										<span className="text-muted-foreground">•</span>
										<span>{new Date(item.createdAt).toLocaleTimeString()}</span>
									</CardDescription>
								</CardHeader>
								<CardContent className="flex flex-col gap-2">
									<div className="text-muted-foreground text-sm">{item.report.summary}</div>
									<div className="flex flex-wrap gap-1">
										{item.report.citations.slice(0, 3).map(citation => (
											<Badge key={citation.url} variant="outline">
												{citation.title}
											</Badge>
										))}
									</div>
								</CardContent>
							</Card>
						))}
						{feed.length === 0 && <div className="text-muted-foreground text-sm">Feed is empty.</div>}
					</div>
				</section>
			</div>
		</div>
	)
}
