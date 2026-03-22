import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import type {DateTime} from 'effect'
import {Array, Effect, Match, Predicate, pipe, Stream, String} from 'effect'

import type {AgentToolKit} from '@ai-toolkit/ai/tools'
import {makeFileParts, partsStreamReducer} from '@ai-toolkit/ai/utils'
import {Conversation} from '@ai-toolkit/components/conversation'
import {
	ArrowUpIcon,
	BookOpenTextIcon,
	BotIcon,
	Brain,
	ChevronRight,
	ClockIcon,
	ExternalLink,
	HashIcon,
	InboxIcon,
	Paperclip,
	SparklesIcon,
	Square,
	UserIcon,
	Wrench
} from '@ai-toolkit/components/icons'
import {AutocompleteInput} from '@ai-toolkit/components/input'
import {Favicon} from '@ai-toolkit/components/render/link-preview'
import {Markdown} from '@ai-toolkit/components/render/markdown'
import {Button} from '@ai-toolkit/components/ui/button'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@ai-toolkit/components/ui/collapsible'
import {formatError, formatNumber, formatTimestamp} from '@ai-toolkit/components/utils'
import {createFileRoute} from '@tanstack/react-router'
import type {Response} from 'effect/unstable/ai'
import {Prompt} from 'effect/unstable/ai'
import {Atom} from 'effect/unstable/reactivity'
import {Fragment, useRef} from 'react'

import {AtomRuntime, RpcClient} from '#lib/atomRuntime.ts'

type AgentPart = Response.StreamPart<typeof AgentToolKit.tools>

export const Route = createFileRoute('/(home)/')({
	component: RouteComponent
})

const messagesAtom = Atom.keepAlive(
	AtomRuntime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('agent.events', void 0)),
			Effect.map(partsStreamReducer),
			Stream.unwrap
		),
		{initialValue: Array.empty()}
	)
)

const sendPromptAtom = AtomRuntime.fn(
	Effect.fnUntraced(function* (payload: {text: string; attachments: File[]}) {
		const client = yield* RpcClient
		yield* client(
			'agent.prompt',
			Prompt.userMessage({
				content: [Prompt.makePart('text', {text: payload.text}), ...(yield* makeFileParts(payload.attachments))]
			})
		)
	})
)

const stopAgentAtom = AtomRuntime.fn(
	Effect.fnUntraced(function* () {
		const client = yield* RpcClient
		yield* client('agent.stop', void 0)
	})
)

type Turn = {
	id: number
	prompt: Extract<Prompt.Message, {role: 'user'}>
	responses: ResponseData[]
}

type ResponseData = {
	id: number
	finishReason: 'stop' | 'error' | 'other'
	modelId: string | undefined
	timestamp: DateTime.DateTime | undefined
	text: string
	reasoning: string
	tools: ToolEntry[]
	usage: {kind: 'input' | 'output' | 'reasoning'; value: number}[]
}

type ToolEntry = {
	id: string
	name: string
	params: unknown
	result: ToolResult
}

type ToolResult =
	| {
			isFailure: false
			items: readonly {url: string; title: string | null; highlights: readonly string[]; text: string}[]
	  }
	| {isFailure: true; error: string}

function computeTurns(messages: readonly (Prompt.Message | AgentPart)[]) {
	const turns = Array.empty<Turn>()
	for (const part of messages) {
		if (Prompt.isMessage(part) && part.role === 'user') {
			turns.push({id: turns.length, prompt: part, responses: []})
		} else if (Array.isReadonlyArrayNonEmpty(turns)) {
			const last = turns[turns.length - 1]
			if (last) {
				// biome-ignore lint: TypeScript cannot narrow union type without explicit cast
				const ap = part as AgentPart
				if (ap.type === 'response-metadata') {
					last.responses.push({
						id: last.responses.length,
						finishReason: 'other',
						modelId: ap.modelId,
						timestamp: ap.timestamp,
						text: '',
						reasoning: '',
						tools: [],
						usage: []
					})
				} else if (Array.isReadonlyArrayNonEmpty(last.responses)) {
					const resp = last.responses[last.responses.length - 1]
					if (resp) {
						if (ap.type === 'finish') {
							resp.finishReason = pipe(
								Match.value(ap.reason),
								Match.when('stop', () => 'stop' as const),
								Match.when('error', () => 'error' as const),
								Match.orElse(() => 'other' as const)
							)
							const usage = Array.empty<{kind: 'input' | 'output' | 'reasoning'; value: number}>()
							if (Predicate.isNumber(ap.usage.inputTokens.total) && ap.usage.inputTokens.total > 0) {
								usage.push({kind: 'input', value: ap.usage.inputTokens.total})
							}
							if (Predicate.isNumber(ap.usage.outputTokens.total) && ap.usage.outputTokens.total > 0) {
								usage.push({kind: 'output', value: ap.usage.outputTokens.total})
							}
							if (Predicate.isNumber(ap.usage.outputTokens.reasoning) && ap.usage.outputTokens.reasoning > 0) {
								usage.push({kind: 'reasoning', value: ap.usage.outputTokens.reasoning})
							}
							resp.usage = usage
						} else if (ap.type === 'text-delta') {
							resp.text += ap.delta
						} else if (ap.type === 'reasoning-delta') {
							resp.reasoning += ap.delta
						} else if (ap.type === 'tool-call') {
							resp.tools.push({id: ap.id, name: ap.name, params: ap.params, result: {isFailure: false, items: []}})
						} else if (ap.type === 'tool-result') {
							// biome-ignore lint/plugin: external API
							const tool = resp.tools.find(t => t.id === ap.id)
							if (tool) {
								tool.result = ap.isFailure
									? {isFailure: true, error: formatError(ap.result)}
									: {isFailure: false, items: ap.result}
							}
						}
					}
				}
			}
		}
	}
	return turns
}

const themeMap = {
	other: {bar: 'bg-muted-foreground/15', border: 'border-border/60', bg: 'bg-foreground/[0.004]'},
	stop: {bar: 'bg-blue-500/30', border: 'border-blue-500/12', bg: 'bg-blue-500/[0.003]'},
	error: {bar: 'bg-destructive/30', border: 'border-destructive/15', bg: 'bg-destructive/[0.003]'}
} as const

function ToolCall(props: {tool: ToolEntry}) {
	const label = pipe(
		Match.value(props.tool.name),
		// biome-ignore lint: params is typed as unknown and requires type assertion
		Match.when('web_search', () => (props.tool.params as {query: string}).query),
		// biome-ignore lint: params is typed as unknown and requires type assertion
		Match.when('web_fetch', () => `${(props.tool.params as {urls: unknown[]}).urls.length} url`),
		Match.orElse(() => props.tool.name)
	)

	if (props.tool.result.isFailure) {
		return (
			<div className="flex min-h-7 items-center gap-2 border-2 px-2 py-0.5 text-[11px] text-destructive">
				<Wrench className="size-3.5 shrink-0" />
				<div className="min-w-0 flex-1 truncate">{props.tool.result.error}</div>
			</div>
		)
	}

	if (Array.isReadonlyArrayNonEmpty(props.tool.result.items)) {
		return (
			<Fragment>
				{Array.map(props.tool.result.items, (item, index) => (
					<Collapsible key={`${props.tool.id}-${index}`} className="group border">
						<CollapsibleTrigger className="flex min-h-7 w-full items-center gap-2 px-2 py-0.5 text-left text-[10px]">
							<Favicon url={item.url} />
							<div className="min-w-0 flex-1">
								<div className="truncate text-foreground">{item.title ?? item.url}</div>
								<div className="truncate text-[10px] text-muted-foreground">{item.url}</div>
							</div>
							<a
								href={item.url}
								target="_blank"
								rel="noreferrer"
								className="shrink-0"
								onClick={event => event.stopPropagation()}
							>
								<ExternalLink className="size-3 text-muted-foreground" />
							</a>
							<ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform duration-150 group-data-open:rotate-90" />
						</CollapsibleTrigger>
						<CollapsibleContent>
							<div className="border-t px-3 py-2 text-[11px] leading-5">
								<Markdown>{item.text}</Markdown>
							</div>
						</CollapsibleContent>
					</Collapsible>
				))}
			</Fragment>
		)
	}

	const paramsJson = JSON.stringify(props.tool.params, null, 2)
	return (
		<Collapsible className="group border">
			<CollapsibleTrigger className="flex min-h-7 w-full items-center gap-2 px-2 py-0.5 text-left text-[11px] text-muted-foreground">
				<Wrench className="size-3.5 shrink-0" />
				<div className="min-w-0 flex-1 truncate text-foreground">{label}</div>
				<ChevronRight className="size-3 shrink-0 transition-transform duration-150 group-data-open:rotate-90" />
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="flex flex-col gap-2 border-t p-2 text-[11px] leading-5">
					<pre className="overflow-x-auto border p-2">{paramsJson}</pre>
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}

function RouteComponent() {
	const {value: messages} = useAtomSuspense(messagesAtom)
	const sendPrompt = useAtomSet(sendPromptAtom)
	const stopAgent = useAtomSet(stopAgentAtom)
	const inputRef = useRef<AutocompleteInput.Handle<{id: number; label: string}>>(null)
	const turns = computeTurns(messages)

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<Conversation className="gap-2 p-3">
				{Array.map(turns, turn => (
					<Fragment key={turn.id}>
						<article className="flex gap-2">
							<div className="w-0.5 shrink-0 bg-orange-500/50" />
							<div className="min-w-0 flex-1">
								<div className="w-full border-2 border-orange-500/20 bg-orange-500/[0.003] px-3">
									<div className="flex items-center gap-1.5 border-border/60 border-b py-2 font-mono text-[11px] text-muted-foreground leading-none">
										<UserIcon className="size-3 shrink-0 text-orange-500" />
										<span>prompt</span>
									</div>
									<div className="flex flex-col gap-2 py-2 text-[13px] leading-relaxed">
										{Array.map(turn.prompt.content, (part, index) => {
											if (part.type === 'text') return <Markdown key={index}>{part.text}</Markdown>
											if (part.type === 'file')
												return pipe(part.mediaType, String.startsWith('image/')) ? (
													<Collapsible key={index} className="group border">
														<CollapsibleTrigger className="flex min-h-8 w-full items-center gap-2 px-2 py-1 text-left text-[11px]">
															<img
																src={`${part.data}`}
																alt={part.fileName ?? 'image'}
																className="size-4 shrink-0 border object-cover"
															/>
															<div className="min-w-0 flex-1 truncate text-muted-foreground">
																{part.fileName ?? part.mediaType}
															</div>
															<ChevronRight className="ml-auto size-3 shrink-0 text-muted-foreground transition-transform duration-150 group-data-open:rotate-90" />
														</CollapsibleTrigger>
														<CollapsibleContent>
															<div className="border-t p-2">
																<img
																	src={`${part.data}`}
																	alt={part.fileName ?? 'image'}
																	className="max-h-120 w-full object-contain"
																/>
															</div>
														</CollapsibleContent>
													</Collapsible>
												) : (
													<div
														key={index}
														className="flex min-h-8 items-center gap-2 border px-2 py-1 text-[11px] text-muted-foreground"
													>
														<Paperclip className="size-3.5 shrink-0" />
														<div className="min-w-0 flex-1 truncate">{part.fileName ?? part.mediaType}</div>
													</div>
												)
											return (
												<pre key={index} className="overflow-x-auto border p-2 text-[11px] leading-5">
													{JSON.stringify(part, null, 2)}
												</pre>
											)
										})}
									</div>
								</div>
							</div>
						</article>

						{Array.map(turn.responses, response => (
							<article key={response.id} className="flex gap-2">
								<div className={`w-0.5 shrink-0 ${themeMap[response.finishReason].bar}`} />
								<div className="min-w-0 flex-1">
									<div
										className={`w-full border-2 px-3 ${themeMap[response.finishReason].border} ${themeMap[response.finishReason].bg}`}
									>
										<div className="flex items-center gap-1.5 border-border/60 border-b py-2 font-mono text-[11px] text-muted-foreground leading-none">
											<SparklesIcon className="size-3 shrink-0" />
											<span className="min-w-0 truncate">{response.modelId ?? 'assistant'}</span>
											<span className="ml-auto flex shrink-0 items-center gap-3">
												{Array.map(response.usage, item => (
													<span key={item.kind} className="inline-flex items-center gap-1 font-mono" title={item.kind}>
														{pipe(
															Match.value(item.kind),
															Match.when('input', () => <InboxIcon className="size-3 shrink-0" />),
															Match.when('output', () => <BookOpenTextIcon className="size-3 shrink-0" />),
															Match.when('reasoning', () => <HashIcon className="size-3 shrink-0" />),
															Match.exhaustive
														)}
														{formatNumber(item.value)}
													</span>
												))}
												{response.timestamp && (
													<span className="inline-flex items-center gap-1 text-muted-foreground/60">
														<ClockIcon className="size-3 shrink-0" />
														{formatTimestamp(response.timestamp)}
													</span>
												)}
											</span>
										</div>
										<div className="flex flex-col gap-2 py-2 text-[13px] leading-relaxed">
											{String.isEmpty(response.text) &&
											String.isEmpty(response.reasoning) &&
											Array.isReadonlyArrayEmpty(response.tools) ? (
												<div className="flex gap-1 py-0.5">
													{Array.map([0, 200, 300] as const, delay => (
														<span
															key={delay}
															className="inline-block size-1.5 animate-pulse bg-muted-foreground/60"
															style={{animationDelay: `${delay}ms`}}
														/>
													))}
												</div>
											) : (
												<Fragment>
													{!String.isEmpty(response.text) && <Markdown>{response.text}</Markdown>}
													{!String.isEmpty(response.reasoning) && (
														<Collapsible className="group border">
															<CollapsibleTrigger className="flex min-h-8 w-full items-center gap-2 px-2 py-1 text-[11px] text-muted-foreground">
																<Brain className="size-3.5 shrink-0" />
																<span>reasoning</span>
																<ChevronRight className="ml-auto size-3 shrink-0 transition-transform duration-150 group-data-open:rotate-90" />
															</CollapsibleTrigger>
															<CollapsibleContent>
																<div className="border-t px-2 py-1 text-[11px] text-muted-foreground leading-5">
																	<Markdown>{response.reasoning}</Markdown>
																</div>
															</CollapsibleContent>
														</Collapsible>
													)}
													{Array.map(response.tools, tool => (
														<ToolCall key={tool.id} tool={tool} />
													))}
												</Fragment>
											)}
										</div>
									</div>
								</div>
							</article>
						))}
					</Fragment>
				))}
			</Conversation>

			<div className="border-t p-3">
				<AutocompleteInput
					ref={inputRef}
					onSubmit={() => {
						const text = pipe(inputRef.current?.getText() ?? '', String.trim)
						if (String.isEmpty(text)) return
						sendPrompt({text, attachments: Array.fromIterable(inputRef.current?.getFiles() ?? [])})
						inputRef.current?.clear()
					}}
					placeholder="Send a message, paste a URL, drop files..."
					className="w-full"
					options={{
						'@': {color: '#60a5fa', values: Array.makeBy(50, i => ({id: i, label: `openrouter/${i}`}))},
						'#': {color: '#56815f', values: Array.makeBy(50, i => ({id: i, label: `ciao/${i}`}))}
					}}
				>
					{entry => (
						<Fragment>
							<BotIcon className="size-4 shrink-0" style={{color: entry.color}} />
							<span className="truncate text-foreground">{entry.value.label}</span>
						</Fragment>
					)}
				</AutocompleteInput>
				<AutocompleteInput.ToolBar className="border-t-0">
					<div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
						<div>openrouter/free</div>
						<div>enter send</div>
						<div>shift+enter newline</div>
					</div>
					<div className="flex items-center gap-2">
						<Button onClick={() => stopAgent()} variant="outline" size="icon-xs" className="rounded-none">
							<Square className="size-3.5 fill-current" />
						</Button>
						<Button
							onClick={() => {
								const text = pipe(inputRef.current?.getText() ?? '', String.trim)
								if (String.isEmpty(text)) return
								sendPrompt({text, attachments: Array.fromIterable(inputRef.current?.getFiles() ?? [])})
								inputRef.current?.clear()
							}}
							size="icon-xs"
							className="rounded-none"
						>
							<ArrowUpIcon className="size-3.5" />
						</Button>
					</div>
				</AutocompleteInput.ToolBar>
			</div>
		</div>
	)
}
