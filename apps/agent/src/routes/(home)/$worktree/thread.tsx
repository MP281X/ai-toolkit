import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, Option, Predicate, pipe, Stream, String} from 'effect'

import type {AgentId, ModelId, ProviderId} from '@ai-toolkit/ai/catalog'
import {models} from '@ai-toolkit/ai/catalog'
import type {AgentEvent, AgentKey, AgentStatus} from '@ai-toolkit/ai/schema'
import {compactAiParts} from '@ai-toolkit/ai/utils'
import {Conversation} from '@ai-toolkit/components/conversation'
import {
	Archive,
	ArrowUpIcon,
	Brain,
	ChevronRight,
	ProviderIcon,
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
import {Select, SelectContent, SelectItem, SelectTrigger} from '@ai-toolkit/components/ui/select'
import {formatError, formatNumber} from '@ai-toolkit/components/utils'
import {createFileRoute, Navigate} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {useEffect, useRef, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {activeHomeAtom, selectedAgentAtom} from '#lib/state.ts'

export const Route = createFileRoute('/(home)/$worktree/thread')({
	component: ThreadPage
})

const agentInputStates = new Map<string, RichTextArea.Snapshot<{readonly label: string}>>()
const agentStashedPrompts = new Map<
	string,
	readonly {
		readonly id: string
		readonly model: ModelId
		readonly provider: ProviderId
		readonly snapshot: RichTextArea.Snapshot<{readonly label: string}>
		readonly text: string
	}[]
>()

const agentEventsAtom = Atom.family((key: AgentKey) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client => client('agent.events', {key})),
				Stream.unwrap,
				Stream.scan(Array.empty<AgentEvent>(), (events, event) => [...events, event])
			),
			{initialValue: Array.empty<AgentEvent>()}
		)
	)
)

const agentStatusAtom = Atom.family((key: AgentKey) => {
	return Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client => client('agent.status', {key})),
				Stream.unwrap
			)
		)
	)
})

function ThreadPage() {
	const search = Route.useSearch()
	const params = Route.useParams()
	if (!search.threadId) return <Navigate to="/$worktree/diff" params={params} replace />
	return <ThreadView threadId={search.threadId} />
}

function ThreadView(props: {readonly threadId: string}) {
	const params = Route.useParams()
	const activeWorktree = useAtomSuspense(activeHomeAtom(params.worktree)).value.activeWorktree
	const selectedAgent = useAtomSuspense(selectedAgentAtom(props.threadId)).value
	if (!(activeWorktree && selectedAgent)) return <Navigate to="/$worktree/diff" params={params} replace />
	return <ThreadAgentPanel selectedAgent={selectedAgent} />
}

function ThreadAgentPanel(input: {selectedAgent: AgentKey}) {
	const status = useAtomSuspense(agentStatusAtom(input.selectedAgent)).value
	const availableModels = Array.filter(models, model => pipe(model.agents, Array.contains(input.selectedAgent.agent)))
	const [agentModel, setAgentModel] = useState(`${availableModels[0]?.provider}:${availableModels[0]?.model}`)
	const selectedModel = pipe(
		availableModels,
		Array.findFirst(model => `${model.provider}:${model.model}` === agentModel),
		Option.orElse(() => Array.head(availableModels)),
		Option.getOrThrow
	)

	return (
		<AgentPanel
			key={input.selectedAgent.id}
			agent={input.selectedAgent.agent}
			agentKey={input.selectedAgent}
			model={selectedModel.model}
			provider={selectedModel.provider}
			setModel={setAgentModel}
			status={status}
		/>
	)
}

function AgentResponse(input: {readonly parts: readonly AgentEvent[]}) {
	const effectiveParts = pipe(
		input.parts,
		Array.filter(event => event.type === 'agent-part'),
		Array.map(event => event.part),
		compactAiParts
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
								<span className="ml-auto">reasoning {formatNumber(finish.usage.outputTokens.reasoning ?? 0)}</span>
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
								<span>in {formatNumber(finish.usage.inputTokens.total ?? 0)}</span>
								<span>out {formatNumber(finish.usage.outputTokens.total ?? 0)}</span>
								<span>reasoning {formatNumber(finish.usage.outputTokens.reasoning ?? 0)}</span>
							</span>
						)}
					</div>
					<div className="flex flex-col gap-2 py-2 text-[13px] leading-relaxed">
						{Array.map(responseParts, (part, index) => {
							if (part.type === 'text-delta') return <Markdown key={index}>{part.delta}</Markdown>
							if (part.type === 'tool-call') {
								const hasLaterToolPart = pipe(
									responseParts,
									Array.drop(index + 1),
									Array.some(
										candidate =>
											(candidate.type === 'tool-call' || candidate.type === 'tool-result') &&
											candidate.id === part.id &&
											candidate.name === part.name
									)
								)
								if (hasLaterToolPart) return
								return <ToolPart key={`${index}-${part.id}`} callPart={part} />
							}
							if (part.type === 'tool-result') {
								const hasLaterResult = pipe(
									responseParts,
									Array.drop(index + 1),
									Array.some(
										candidate =>
											candidate.type === 'tool-result' && candidate.id === part.id && candidate.name === part.name
									)
								)
								if (hasLaterResult) return
								const callPart = pipe(
									responseParts,
									Array.take(index),
									Array.findFirst(
										candidate =>
											candidate.type === 'tool-call' && candidate.id === part.id && candidate.name === part.name
									),
									Option.getOrUndefined
								)
								if (callPart?.type === 'tool-call')
									return <ToolPart key={`${index}-${part.id}`} callPart={callPart} resultPart={part} />
								return <ToolPart key={`${index}-${part.id}`} resultPart={part} />
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

function ToolPart(input: {
	readonly callPart?: Extract<ReturnType<typeof compactAiParts>[number], {readonly type: 'tool-call'}>
	readonly resultPart?: Extract<ReturnType<typeof compactAiParts>[number], {readonly type: 'tool-result'}>
}) {
	const part = input.resultPart ?? input.callPart
	if (!part) return
	const payload = input.resultPart?.result ?? input.callPart?.params
	const inputPayload = input.callPart?.params
	const summary = summarizeToolPayload(part.name, payload, inputPayload)
	let state = 'running'
	if (input.resultPart) state = input.resultPart.isFailure ? 'failed' : 'done'

	return (
		<Collapsible className="group border bg-muted/10">
			<CollapsibleTrigger className="flex min-h-6 w-full items-center gap-1.5 px-1.5 py-0.5 text-left font-mono text-[10px] text-muted-foreground">
				<Wrench className="size-3 shrink-0" />
				<span className="border px-1 text-foreground leading-none">{part.name}</span>
				<span>{state}</span>
				{input.resultPart?.preliminary && <span>preliminary</span>}
				<span className="min-w-0 flex-1 truncate text-foreground/80">{summary}</span>
				<ChevronRight className="size-3 shrink-0 transition-transform duration-150 group-data-open:rotate-90" />
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="grid gap-1 border-t p-1.5 font-mono text-[11px] leading-5">
					{renderToolPayload(part.name, payload, inputPayload)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}

function getField(value: unknown, key: string) {
	if (!Predicate.hasProperty(key)(value)) return
	return value[key]
}

function getStringField(value: unknown, key: string) {
	const field = getField(value, key)
	return Predicate.isString(field) ? field : undefined
}

function getArrayField(value: unknown, key: string) {
	const field = getField(value, key)
	return Array.isArray(field) ? field : []
}

function getBooleanField(value: unknown, key: string) {
	const field = getField(value, key)
	return Predicate.isBoolean(field) ? field : undefined
}

function getStringToolField(payload: unknown, inputPayload: unknown, key: string) {
	return getStringField(payload, key) ?? getStringField(inputPayload, key)
}

function getArrayToolField(payload: unknown, inputPayload: unknown, key: string) {
	const field = getArrayField(payload, key)
	return Array.isReadonlyArrayEmpty(field) ? getArrayField(inputPayload, key) : field
}

function summarizeToolPayload(name: string, payload: unknown, inputPayload: unknown) {
	if (name === 'command_execution') return getStringToolField(payload, inputPayload, 'command') ?? ''
	if (name === 'web_search')
		return (
			getStringToolField(payload, inputPayload, 'query') ??
			`${formatNumber(getArrayToolField(payload, inputPayload, 'results').length)} results`
		)
	if (name === 'web_fetch') return `${formatNumber(getArrayToolField(payload, inputPayload, 'urls').length)} urls`
	if (name === 'file_change') return `${formatNumber(getArrayToolField(payload, inputPayload, 'changes').length)} files`
	if (name === 'mcp_tool_call')
		return `${getStringToolField(payload, inputPayload, 'server') ?? 'mcp'} / ${getStringToolField(payload, inputPayload, 'tool') ?? 'tool'}`
	if (name === 'todo_list') return `${formatNumber(getArrayToolField(payload, inputPayload, 'items').length)} items`
	return ''
}

function getErrorText(value: unknown) {
	return formatError(
		getStringField(value, 'description') ?? getStringField(value, 'message') ?? getStringField(value, '_tag') ?? value
	)
}

function ToolField(input: {readonly label: string; readonly value: unknown}) {
	if (Predicate.isUndefined(input.value) || Predicate.isNull(input.value)) return
	if (Predicate.isString(input.value) && String.isEmpty(input.value)) return

	return (
		<div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-1 border px-1.5 py-0.5">
			<div className="text-muted-foreground">{input.label}</div>
			<div className="min-w-0 truncate text-foreground">{String.String(input.value)}</div>
		</div>
	)
}

function renderToolPayload(name: string, payload: unknown, inputPayload: unknown) {
	if (name === 'command_execution') {
		return (
			<>
				<ToolField label="error" value={getErrorText(payload)} />
				{getStringToolField(payload, inputPayload, 'output') && (
					<pre className="max-h-48 overflow-auto border bg-background p-1.5 text-foreground">
						{getStringField(payload, 'output')}
					</pre>
				)}
			</>
		)
	}

	if (name === 'web_search' || name === 'web_fetch') {
		return (
			<>
				<ToolField label="query" value={getStringToolField(payload, inputPayload, 'query')} />
				<ToolField label="urls" value={getArrayToolField(payload, inputPayload, 'urls').join(', ')} />
				<ToolField label="results" value={formatNumber(getArrayToolField(payload, inputPayload, 'results').length)} />
				<div className="grid gap-1">
					{Array.map(getArrayToolField(payload, inputPayload, 'results'), (result, index) => (
						<div key={index} className="border px-1.5 py-1">
							<div className="truncate text-foreground">
								{getStringField(result, 'title') ?? getStringField(result, 'url')}
							</div>
							<div className="truncate text-muted-foreground">{getStringField(result, 'url')}</div>
							{Array.map(getArrayField(result, 'highlights'), (highlight, index) => (
								<div key={index} className="line-clamp-2 whitespace-pre-wrap text-foreground">
									{String.String(highlight)}
								</div>
							))}
							<div className="line-clamp-2 whitespace-pre-wrap text-muted-foreground">
								{getStringField(result, 'text')}
							</div>
						</div>
					))}
				</div>
			</>
		)
	}

	if (name === 'file_change') {
		return (
			<>
				<ToolField label="error" value={getErrorText(payload)} />
				<div className="grid gap-1">
					{Array.map(getArrayToolField(payload, inputPayload, 'changes'), (change, index) => (
						<div key={index} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-1 border px-1.5 py-0.5">
							<span className="text-muted-foreground">{getStringField(change, 'kind')}</span>
							<span className="truncate text-foreground">{getStringField(change, 'path')}</span>
						</div>
					))}
				</div>
			</>
		)
	}

	if (name === 'mcp_tool_call') {
		return (
			<>
				<ToolField label="server" value={getStringToolField(payload, inputPayload, 'server')} />
				<ToolField label="tool" value={getStringToolField(payload, inputPayload, 'tool')} />
				<ToolField label="text" value={getStringField(payload, 'text')} />
				<ToolField label="error" value={getErrorText(payload)} />
			</>
		)
	}

	if (name === 'todo_list') {
		return (
			<div className="grid gap-1">
				{Array.map(getArrayToolField(payload, inputPayload, 'items'), (item, index) => (
					<div key={index} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-1 border px-1.5 py-0.5">
						<span className="text-muted-foreground">{getBooleanField(item, 'completed') ? 'x' : ''}</span>
						<span className="truncate text-foreground">{getStringField(item, 'text')}</span>
					</div>
				))}
			</div>
		)
	}
}

function AgentPanel(input: {
	readonly agent: AgentId
	readonly agentKey: AgentKey
	readonly model: ModelId
	readonly provider: ProviderId
	readonly setModel: (model: string) => void
	readonly status: AgentStatus
}) {
	const inputRef = useRef<RichTextArea.Handle<{label: string}>>(null)
	const events = useAtomSuspense(agentEventsAtom(input.agentKey)).value
	const [stashedPrompts, setStashedPrompts] = useState(
		agentStashedPrompts.get(input.agentKey.id) ??
			Array.empty<{
				readonly id: string
				readonly model: ModelId
				readonly provider: ProviderId
				readonly snapshot: RichTextArea.Snapshot<{readonly label: string}>
				readonly text: string
			}>()
	)
	const runs = Array.reduce(
		events,
		Array.empty<{readonly id: string; readonly prompt: string; readonly parts: readonly AgentEvent[]}>(),
		(runs, event) => {
			if (event.type === 'user-message')
				return Array.append(runs, {id: `${Array.length(runs)}`, parts: [], prompt: event.prompt})
			if (!Array.isArrayNonEmpty(runs)) return runs
			const [previousRuns, currentRun] = Array.unappend(runs)
			return [...previousRuns, {...currentRun, parts: [...currentRun.parts, event]}]
		}
	)
	const promptAgent = useAtomSet(RpcClient.mutation('agent.prompt'), {mode: 'promise'})
	const stopAgent = useAtomSet(RpcClient.mutation('agent.stop'), {mode: 'promise'})
	function setAgentStash(
		prompts: readonly {
			readonly id: string
			readonly model: ModelId
			readonly provider: ProviderId
			readonly snapshot: RichTextArea.Snapshot<{readonly label: string}>
			readonly text: string
		}[]
	) {
		agentStashedPrompts.set(input.agentKey.id, prompts)
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
				key: input.agentKey,
				model: prompt.model,
				prompt: prompt.text,
				provider: prompt.provider
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
			if (snapshot && String.isNonEmpty(snapshot.text)) agentInputStates.set(input.agentKey.id, snapshot)
		}
	}, [input.agentKey.id])

	return (
		<div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
			{Array.isReadonlyArrayEmpty(runs) ? (
				<div className="flex min-h-0 flex-1 items-center justify-center p-4 text-muted-foreground text-sm">
					Send a message to start the thread.
				</div>
			) : (
				<Conversation items={runs} className="p-4">
					{run => (
						<div className="mx-auto flex max-w-4xl flex-col gap-3">
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
					)}
				</Conversation>
			)}
			<div className="border-t p-3">
				<div className="relative mx-auto max-w-4xl">
					{!Array.isReadonlyArrayEmpty(stashedPrompts) && (
						<RichTextArea.Actions>
							<div className="flex items-center gap-2 border-input border-b px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
								<Archive className="size-3.5" />
								<span>{formatNumber(stashedPrompts.length)} stashed</span>
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
												agentInputStates.set(input.agentKey.id, prompt.snapshot)
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
						initialSnapshot={agentInputStates.get(input.agentKey.id)}
						onSubmit={submitPrompt}
						placeholder="Send a message..."
					/>
					<RichTextArea.ToolBar>
						<div className="flex w-full items-center gap-2">
							<Select
								value={`${input.provider}:${input.model}`}
								onValueChange={modelId => {
									if (Predicate.isString(modelId)) input.setModel(modelId)
								}}
							>
								<SelectTrigger className="h-7 w-64 rounded-none text-xs">
									<span className="flex min-w-0 items-center gap-2">
										<ProviderIcon provider={input.provider} className="size-3" />
										<span className="min-w-0 truncate">{input.model}</span>
									</span>
								</SelectTrigger>
								<SelectContent>
									{pipe(
										models,
										Array.filter(model => Array.contains(model.agents, input.agent)),
										Array.map(model => (
											<SelectItem key={`${model.provider}:${model.model}`} value={`${model.provider}:${model.model}`}>
												<ProviderIcon provider={model.provider} className="size-3" />
												{model.model}
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
									disabled={input.status.state === 'idle'}
									onClick={() => {
										void stopAgent({payload: {key: input.agentKey}})
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
