import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, Predicate, pipe, Stream, String} from 'effect'

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
import {cn, formatError, formatNumber, formatTimestamp} from '@ai-toolkit/components/utils'
import {createFileRoute} from '@tanstack/react-router'
import {Prompt} from 'effect/unstable/ai'
import {Atom} from 'effect/unstable/reactivity'
import {Fragment, useRef} from 'react'

import {AtomRuntime, RpcClient} from '#lib/atomRuntime.ts'

export const Route = createFileRoute('/(home)/')({
	component: RouteComponent
})

const turnsAtom = Atom.keepAlive(
	AtomRuntime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('agent.events', void 0)),
			Effect.map(partsStreamReducer),
			Effect.map(
				Stream.map(parts => {
					const turns = Array.empty<{
						id: number
						prompt: Extract<(typeof parts)[number], {role: 'user'}>
						responses: {
							id: number
							metadata: Extract<(typeof parts)[number], {type: 'response-metadata'}>
							finish: Extract<(typeof parts)[number], {type: 'finish'}> | undefined
							parts: Exclude<
								Exclude<(typeof parts)[number], Prompt.Message>,
								| Extract<(typeof parts)[number], {type: 'response-metadata'}>
								| Extract<(typeof parts)[number], {type: 'finish'}>
							>[]
						}[]
					}>()

					for (const part of parts) {
						if (Prompt.isMessage(part)) {
							if (part.role !== 'user') continue

							turns.push({id: turns.length, prompt: part, responses: []})
							continue
						}

						const turn = turns[turns.length - 1]
						if (!turn) continue

						if (part.type === 'response-metadata') {
							turn.responses.push({
								id: turn.responses.length,
								metadata: part,
								finish: undefined,
								parts: []
							})
							continue
						}

						const response = turn.responses[turn.responses.length - 1]
						if (!response) continue

						if (part.type === 'finish') {
							response.finish = part
							continue
						}

						response.parts.push(part)
					}

					return turns
				})
			),
			Stream.unwrap
		),
		{initialValue: []}
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

function RouteComponent() {
	const {value: turns} = useAtomSuspense(turnsAtom)
	const sendPrompt = useAtomSet(sendPromptAtom)
	const stopAgent = useAtomSet(stopAgentAtom)
	const inputRef = useRef<AutocompleteInput.Handle<{id: number; label: string}>>(null)

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

						{Array.map(turn.responses, response => {
							const finishReason =
								response.finish?.reason === 'stop' || response.finish?.reason === 'error'
									? response.finish.reason
									: 'other'

							return (
								<article key={response.id} className="flex gap-2">
									<div
										className={cn(
											'w-0.5 shrink-0',
											finishReason === 'other' && 'bg-muted-foreground/15',
											finishReason === 'stop' && 'bg-blue-500/30',
											finishReason === 'error' && 'bg-destructive/30'
										)}
									/>
									<div className="min-w-0 flex-1">
										<div
											className={cn(
												'w-full border-2 px-3',
												finishReason === 'other' && 'border-border/60 bg-foreground/[0.004]',
												finishReason === 'stop' && 'border-blue-500/12 bg-blue-500/[0.003]',
												finishReason === 'error' && 'border-destructive/15 bg-destructive/[0.003]'
											)}
										>
											<div className="flex items-center gap-1.5 border-border/60 border-b py-2 font-mono text-[11px] text-muted-foreground leading-none">
												<SparklesIcon className="size-3 shrink-0" />
												<span className="min-w-0 truncate">{response.metadata.modelId ?? 'assistant'}</span>
												<span className="ml-auto flex shrink-0 items-center gap-3">
													{Predicate.isNumber(response.finish?.usage.inputTokens.total) &&
														response.finish.usage.inputTokens.total > 0 && (
															<span className="inline-flex items-center gap-1 font-mono" title="input">
																<InboxIcon className="size-3 shrink-0" />
																{formatNumber(response.finish.usage.inputTokens.total)}
															</span>
														)}
													{Predicate.isNumber(response.finish?.usage.outputTokens.total) &&
														response.finish.usage.outputTokens.total > 0 && (
															<span className="inline-flex items-center gap-1 font-mono" title="output">
																<BookOpenTextIcon className="size-3 shrink-0" />
																{formatNumber(response.finish.usage.outputTokens.total)}
															</span>
														)}
													{Predicate.isNumber(response.finish?.usage.outputTokens.reasoning) &&
														response.finish.usage.outputTokens.reasoning > 0 && (
															<span className="inline-flex items-center gap-1 font-mono" title="reasoning">
																<HashIcon className="size-3 shrink-0" />
																{formatNumber(response.finish.usage.outputTokens.reasoning)}
															</span>
														)}
													{response.metadata.timestamp && (
														<span className="inline-flex items-center gap-1 text-muted-foreground/60">
															<ClockIcon className="size-3 shrink-0" />
															{formatTimestamp(response.metadata.timestamp)}
														</span>
													)}
												</span>
											</div>
											<div className="flex flex-col gap-2 py-2 text-[13px] leading-relaxed">
												{Array.isReadonlyArrayEmpty(response.parts) ? (
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
													Array.map(response.parts, (part, index) => {
														if (part.type === 'text-delta') return <Markdown key={index}>{part.delta}</Markdown>

														if (part.type === 'reasoning-delta') {
															return (
																<Collapsible key={index} className="group border">
																	<CollapsibleTrigger className="flex min-h-8 w-full items-center gap-2 px-2 py-1 text-[11px] text-muted-foreground">
																		<Brain className="size-3.5 shrink-0" />
																		<span>reasoning</span>
																		<ChevronRight className="ml-auto size-3 shrink-0 transition-transform duration-150 group-data-open:rotate-90" />
																	</CollapsibleTrigger>
																	<CollapsibleContent>
																		<div className="border-t px-2 py-1 text-[11px] text-muted-foreground leading-5">
																			<Markdown>{part.delta}</Markdown>
																		</div>
																	</CollapsibleContent>
																</Collapsible>
															)
														}

														if (part.type === 'tool-call') {
															return (
																<Collapsible key={part.id} className="group border">
																	<CollapsibleTrigger className="flex min-h-7 w-full items-center gap-2 px-2 py-0.5 text-left text-[11px] text-muted-foreground">
																		<Wrench className="size-3.5 shrink-0" />
																		<div className="min-w-0 flex-1 truncate text-foreground">{part.name}</div>
																		<ChevronRight className="size-3 shrink-0 transition-transform duration-150 group-data-open:rotate-90" />
																	</CollapsibleTrigger>
																	<CollapsibleContent>
																		<div className="flex flex-col gap-2 border-t p-2 text-[11px] leading-5">
																			<pre className="overflow-x-auto border p-2">
																				{JSON.stringify(part.params, null, 2)}
																			</pre>
																		</div>
																	</CollapsibleContent>
																</Collapsible>
															)
														}

														if (part.type === 'tool-result' && part.isFailure) {
															return (
																<div
																	key={index}
																	className="flex min-h-7 items-center gap-2 border-2 px-2 py-0.5 text-[11px] text-destructive"
																>
																	<Wrench className="size-3.5 shrink-0" />
																	<div className="min-w-0 flex-1 truncate">{formatError(part.result)}</div>
																</div>
															)
														}

														if (part.type === 'tool-result' && Array.isReadonlyArrayNonEmpty(part.result)) {
															return (
																<Fragment key={index}>
																	{Array.map(part.result, (item, itemIndex) => (
																		<Collapsible key={`${index}-${itemIndex}`} className="group border">
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

														return (
															<pre key={index} className="overflow-x-auto border p-2 text-[11px] leading-5">
																{JSON.stringify(part, null, 2)}
															</pre>
														)
													})
												)}
											</div>
										</div>
									</div>
								</article>
							)
						})}
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
