import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, Option, Predicate, pipe, Stream, String} from 'effect'

import type {AgentId, ModelId, ProviderId} from '@ai-toolkit/ai/catalog'
import {models} from '@ai-toolkit/ai/catalog'
import {
	Archive,
	ArrowUpIcon,
	Brain,
	ChevronRight,
	FileIcon,
	SparklesIcon,
	Square,
	Trash,
	UserIcon,
	Wrench
} from '@ai-toolkit/components/icons'
import {Markdown} from '@ai-toolkit/components/render/markdown'
import {RichTextArea} from '@ai-toolkit/components/rich-text-area'
import {Button} from '@ai-toolkit/components/ui/button'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@ai-toolkit/components/ui/collapsible'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@ai-toolkit/components/ui/select'
import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {useEffect, useRef, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom, selectedAgentAtom} from '#lib/state.ts'
import type {AgentEvent, AgentStreamPart} from '#rpcs/contracts.ts'

export const Route = createFileRoute('/(home)/$worktree/thread')({
	component: ThreadPage
})

const agentInputStates = new Map<string, RichTextArea.Snapshot<{label: string}>>()
const agentStashedPrompts = new Map<
	string,
	readonly {
		id: string
		model: ModelId
		provider: ProviderId
		snapshot: RichTextArea.Snapshot<{label: string}>
		text: string
	}[]
>()

const filesAtom = Atom.family((cwd: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient.asEffect(),
				Effect.flatMap(client => client('files.search', {cwd}))
			),
			{initialValue: Array.empty<string>()}
		)
	)
)

const agentEventsAtom = Atom.family((agentId: string) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient.asEffect(),
				Effect.map(client => client('agent.events', {agentId})),
				Stream.unwrap,
				Stream.scan(Array.empty<AgentEvent>(), (events, event) => [...events, event])
			),
			{initialValue: Array.empty<AgentEvent>()}
		)
	)
)

export function ThreadPage() {
	const search = Route.useSearch()
	const params = Route.useParams()
	const activeWorktree = pipe(
		Option.fromNullishOr(useAtomSuspense(activeHomeAtom(params.worktree)).value.activeWorktree),
		Option.getOrThrow
	)
	const selectedAgent = pipe(
		Option.fromNullishOr(
			useAtomSuspense(selectedAgentAtom(pipe(Option.fromNullishOr(search.threadId), Option.getOrThrow))).value
		),
		Option.getOrThrow
	)
	const availableModels = Array.filter(models, model => pipe(model.agents, Array.contains(selectedAgent.layer)))
	const [agentModel, setAgentModel] = useState(`${availableModels[0]?.provider}:${availableModels[0]?.model}`)
	const selectedModel = pipe(
		availableModels,
		Array.findFirst(model => `${model.provider}:${model.model}` === agentModel),
		Option.orElse(() => Array.head(availableModels)),
		Option.getOrThrow
	)

	return (
		<AgentPanel
			key={selectedAgent.agentId}
			agentId={selectedAgent.agentId}
			cwd={activeWorktree.root}
			layer={selectedAgent.layer}
			model={selectedModel.model}
			provider={selectedModel.provider}
			setModel={setAgentModel}
		/>
	)
}

function AgentResponse(input: {parts: readonly AgentEvent[]}) {
	const effectiveParts = pipe(
		input.parts,
		Array.filter(event => event.type === 'agent-part'),
		Array.map(event => event.part),
		Array.reduce(Array.empty<AgentStreamPart>(), (parts, part) => {
			if (part.type === 'reasoning-start' || part.type === 'reasoning-end') return parts
			if (part.type === 'text-start' || part.type === 'text-end') return parts
			if (part.type === 'tool-params-start' || part.type === 'tool-params-end') return parts
			if (part.type === 'tool-params-delta') return parts
			if (!Array.isArrayNonEmpty(parts)) return Array.append(parts, part)
			const [previousParts, lastPart] = Array.unappend(parts)
			if (part.type === 'text-delta' && lastPart.type === 'text-delta') {
				return [...previousParts, {...lastPart, delta: `${lastPart.delta}${part.delta}`}]
			}
			if (part.type === 'reasoning-delta' && lastPart.type === 'reasoning-delta') {
				return [...previousParts, {...lastPart, delta: `${lastPart.delta}${part.delta}`}]
			}
			return Array.append(parts, part)
		})
	)
	const reasoningParts = pipe(
		effectiveParts,
		Array.filter(part => part.type === 'reasoning-delta')
	)
	const responseParts = pipe(
		effectiveParts,
		Array.filter(part => part.type !== 'reasoning-delta')
	)
	const metadata = pipe(
		effectiveParts,
		Array.findFirst(part => part.type === 'response-metadata'),
		Option.getOrUndefined
	)
	const finish = pipe(
		effectiveParts,
		Array.findFirst(part => part.type === 'finish'),
		Option.getOrUndefined
	)
	if (Array.isReadonlyArrayEmpty(effectiveParts)) return

	return (
		<div className="flex flex-col gap-3">
			{Array.map(reasoningParts, (part, index) => (
				<article key={index} className="flex gap-2">
					<div className="w-0.5 shrink-0 bg-muted-foreground/40" />
					<div className="min-w-0 flex-1 border border-muted-foreground/25 bg-muted/20 px-3 text-muted-foreground text-xs leading-5">
						<div className="flex items-center gap-1.5 border-border/60 border-b py-2 font-mono text-[11px] leading-none">
							<Brain className="size-3.5 shrink-0" />
							<span>reasoning</span>
							{finish?.type === 'finish' && (
								<span className="ml-auto">reasoning {finish.usage.outputTokens.reasoning}</span>
							)}
						</div>
						<div className="py-2">
							<Markdown>{part.delta}</Markdown>
						</div>
					</div>
				</article>
			))}
			<article className="flex gap-2">
				<div className="w-0.5 shrink-0 bg-blue-500/30" />
				<div className="min-w-0 flex-1 border-2 border-blue-500/12 bg-blue-500/[0.003] px-3">
					<div className="flex items-center gap-1.5 border-border/60 border-b py-2 font-mono text-[11px] text-muted-foreground leading-none">
						<SparklesIcon className="size-3 shrink-0" />
						<span className="min-w-0 truncate">
							{metadata?.type === 'response-metadata' ? metadata.modelId : 'thread'}
						</span>
						{finish?.type === 'finish' && (
							<span className="ml-auto flex shrink-0 items-center gap-3">
								<span>in {finish.usage.inputTokens.total}</span>
								<span>out {finish.usage.outputTokens.total}</span>
								<span>reasoning {finish.usage.outputTokens.reasoning}</span>
							</span>
						)}
					</div>
					<div className="flex flex-col gap-2 py-2 text-[13px] leading-relaxed">
						{Array.map(responseParts, (part, index) => {
							if (part.type === 'text-delta') return <Markdown key={index}>{part.delta}</Markdown>
							if (part.type === 'tool-call' || part.type === 'tool-result') {
								return (
									<Collapsible key={`${part.type}-${part.id}`} className="group border">
										<CollapsibleTrigger className="flex min-h-7 w-full items-center gap-2 px-2 py-0.5 text-left text-[11px] text-muted-foreground">
											<Wrench className="size-3.5 shrink-0" />
											<span className="text-foreground">{part.type}</span>
											<span>{part.name}</span>
											<ChevronRight className="ml-auto size-3 shrink-0 transition-transform duration-150 group-data-open:rotate-90" />
										</CollapsibleTrigger>
										<CollapsibleContent>
											<pre className="overflow-x-auto border-t p-2 text-[11px] leading-5">
												{JSON.stringify(part.type === 'tool-call' ? part.params : part.result, null, 2)}
											</pre>
										</CollapsibleContent>
									</Collapsible>
								)
							}
							if (part.type === 'response-metadata' || part.type === 'finish') return
							return (
								<pre key={index} className="overflow-x-auto border p-2 text-[11px] leading-5">
									{JSON.stringify(part, null, 2)}
								</pre>
							)
						})}
					</div>
				</div>
			</article>
		</div>
	)
}

function AgentPanel(input: {
	agentId: string
	cwd: string
	layer: AgentId
	model: ModelId
	provider: ProviderId
	setModel: (model: string) => void
}) {
	const inputRef = useRef<RichTextArea.Handle<{label: string}>>(null)
	const files = useAtomSuspense(filesAtom(input.cwd)).value
	const events = useAtomSuspense(agentEventsAtom(input.agentId)).value
	const [stashedPrompts, setStashedPrompts] = useState(
		agentStashedPrompts.get(input.agentId) ??
			Array.empty<{
				id: string
				model: ModelId
				provider: ProviderId
				snapshot: RichTextArea.Snapshot<{label: string}>
				text: string
			}>()
	)
	const runs = pipe(
		events,
		Array.reduce(Array.empty<{prompt: string; runId: string; parts: readonly AgentEvent[]}>(), (runs, event) => {
			if (event.type === 'user-message')
				return Array.append(runs, {parts: [], prompt: event.prompt, runId: event.runId})
			if (!Array.isArrayNonEmpty(runs)) return runs
			const [previousRuns, currentRun] = Array.unappend(runs)
			if (currentRun.runId !== event.runId) return runs
			return [...previousRuns, {...currentRun, parts: [...currentRun.parts, event]}]
		})
	)
	const promptAgent = useAtomSet(RpcClient.mutation('agent.prompt'), {mode: 'promise'})
	const stopAgent = useAtomSet(RpcClient.mutation('agent.stop'), {mode: 'promise'})
	function setAgentStash(
		prompts: readonly {
			id: string
			model: ModelId
			provider: ProviderId
			snapshot: RichTextArea.Snapshot<{label: string}>
			text: string
		}[]
	) {
		agentStashedPrompts.set(input.agentId, prompts)
		setStashedPrompts(prompts)
	}

	function savePrompt(snapshot = inputRef.current?.getSnapshot()) {
		if (!snapshot || String.isEmpty(snapshot.text)) return

		return {id: crypto.randomUUID(), model: input.model, provider: input.provider, snapshot, text: snapshot.text}
	}

	function submitPrompt(snapshot = inputRef.current?.getSnapshot()) {
		const prompt = savePrompt(snapshot)
		if (!prompt) return

		void promptAgent({
			payload: {
				agentId: input.agentId,
				model: prompt.model,
				prompt: prompt.text,
				provider: prompt.provider,
				runId: crypto.randomUUID()
			}
		})
		inputRef.current?.clear()
	}

	function stashPrompt() {
		const prompt = savePrompt()
		if (!prompt) return

		setAgentStash([...stashedPrompts, prompt])
		inputRef.current?.clear()
	}

	useEffect(() => {
		return () => {
			const snapshot = inputRef.current?.getSnapshot()
			if (snapshot && String.isNonEmpty(snapshot.text)) agentInputStates.set(input.agentId, snapshot)
		}
	}, [input.agentId])

	return (
		<div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				<div className="mx-auto flex max-w-4xl flex-col gap-3">
					{Array.isReadonlyArrayEmpty(runs) && (
						<div className="flex min-h-48 items-center justify-center text-muted-foreground text-sm">
							Send a message to start the thread.
						</div>
					)}
					{Array.map(runs, run => (
						<div key={run.runId} className="flex flex-col gap-3">
							<article className="flex gap-2">
								<div className="w-0.5 shrink-0 bg-orange-500/50" />
								<div className="min-w-0 flex-1 border-2 border-orange-500/20 bg-orange-500/[0.003] px-3">
									<div className="flex items-center gap-1.5 border-border/60 border-b py-2 font-mono text-[11px] text-muted-foreground leading-none">
										<UserIcon className="size-3 shrink-0 text-orange-500" />
										<span>prompt</span>
									</div>
									<div className="py-2 text-[13px] leading-relaxed">
										<Markdown>{run.prompt}</Markdown>
									</div>
								</div>
							</article>
							<AgentResponse parts={run.parts} />
						</div>
					))}
				</div>
			</div>
			<div className="border-t p-3">
				<div className="relative mx-auto max-w-4xl">
					{!Array.isReadonlyArrayEmpty(stashedPrompts) && (
						<RichTextArea.Actions>
							<div className="flex items-center gap-2 border-input border-b px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
								<Archive className="size-3.5" />
								<span>{stashedPrompts.length} stashed</span>
							</div>
							<div className="flex max-h-48 flex-col overflow-y-auto">
								{Array.map(stashedPrompts, prompt => (
									<div
										key={prompt.id}
										className="flex min-w-0 items-center gap-2 border-input border-b px-2 py-1.5 last:border-b-0 hover:bg-muted/70"
									>
										<button
											type="button"
											className="min-w-0 flex-1 text-left"
											onMouseDown={event => event.preventDefault()}
											onClick={() => {
												const currentPrompt = savePrompt()
												const nextPrompts = Array.filter(stashedPrompts, savedPrompt => savedPrompt.id !== prompt.id)

												setAgentStash(currentPrompt ? [...nextPrompts, currentPrompt] : nextPrompts)
												agentInputStates.set(input.agentId, prompt.snapshot)
												inputRef.current?.restore(prompt.snapshot)
												input.setModel(`${prompt.provider}:${prompt.model}`)
											}}
										>
											<div className="truncate text-[12px] text-muted-foreground">{prompt.text}</div>
											<div className="truncate font-mono text-[10px] text-muted-foreground/70">
												{prompt.provider}/{prompt.model}
											</div>
										</button>
										<Button
											variant="ghost"
											size="icon-xs"
											className="rounded-none"
											onMouseDown={event => event.preventDefault()}
											onClick={event => {
												event.stopPropagation()
												setAgentStash(Array.filter(stashedPrompts, savedPrompt => savedPrompt.id !== prompt.id))
											}}
										>
											<Trash className="size-3" />
										</Button>
									</div>
								))}
							</div>
						</RichTextArea.Actions>
					)}
					<RichTextArea
						ref={inputRef}
						initialSnapshot={agentInputStates.get(input.agentId)}
						onSubmit={submitPrompt}
						placeholder="Send a message, type @ to attach files..."
						options={{
							'@': {
								color: 'oklch(0.74 0.12 220)',
								values: pipe(
									files,
									Array.map(label => ({label}))
								)
							}
						}}
					>
						{entry => (
							<>
								<FileIcon filePath={entry.value.label} className="size-3.5" />
								<span className="min-w-0 truncate">{entry.value.label}</span>
							</>
						)}
					</RichTextArea>
					<RichTextArea.ToolBar>
						<div className="flex w-full items-center gap-2">
							<Select
								value={`${input.provider}:${input.model}`}
								onValueChange={modelId => {
									if (Predicate.isString(modelId)) input.setModel(modelId)
								}}
							>
								<SelectTrigger className="h-7 w-64 rounded-none text-xs">
									<SelectValue placeholder="Model" />
								</SelectTrigger>
								<SelectContent>
									{pipe(
										models,
										Array.filter(model => pipe(model.agents, Array.contains(input.layer))),
										Array.map(model => (
											<SelectItem key={`${model.provider}:${model.model}`} value={`${model.provider}:${model.model}`}>
												{model.provider}/{model.model}
											</SelectItem>
										))
									)}
								</SelectContent>
							</Select>
							<div className="ml-auto flex items-center gap-2">
								<Button variant="outline" size="icon-xs" className="rounded-none" onClick={stashPrompt}>
									<Archive className="size-3.5" />
								</Button>
								<Button
									variant="outline"
									size="icon-xs"
									className="rounded-none"
									onClick={() => {
										void stopAgent({payload: {agentId: input.agentId}})
									}}
								>
									<Square className="size-3.5 fill-current" />
								</Button>
								<Button size="icon-xs" className="rounded-none" onClick={() => submitPrompt()}>
									<ArrowUpIcon className="size-3.5" />
								</Button>
							</div>
						</div>
					</RichTextArea.ToolBar>
				</div>
			</div>
		</div>
	)
}
