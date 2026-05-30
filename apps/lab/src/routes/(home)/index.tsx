import {useAtomSet, useAtomSuspense} from '@effect/atom-react'

import {Array, Effect, Option, Stream, String, pipe} from 'effect'

import {createFileRoute} from '@tanstack/react-router'
import {Atom} from 'effect/unstable/reactivity'
import {useRef, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import type {AgentId} from '@deslop/ai/catalog'
import {AgentId as AgentIdSchema, models} from '@deslop/ai/catalog'
import type {AgentEvent, AgentKey} from '@deslop/ai/schema'
import {compactAiParts} from '@deslop/ai/utils'
import {Conversation} from '@deslop/components/conversation'
import {
	AgentIcon,
	ArrowUpIcon,
	Brain,
	ProviderIcon,
	SparklesIcon,
	Square,
	UserIcon,
	Wrench
} from '@deslop/components/icons'
import {Markdown} from '@deslop/components/render/markdown'
import {RichTextArea} from '@deslop/components/rich-text-area'
import {Button} from '@deslop/components/ui/button'
import {Input} from '@deslop/components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger} from '@deslop/components/ui/select'
import {formatNumber} from '@deslop/components/utils'

export const Route = createFileRoute('/(home)/')({component: LabPage})

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

const agentStatusAtom = Atom.family((key: AgentKey) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient,
				Effect.map(client => client('agent.status', {key})),
				Stream.unwrap
			)
		)
	)
)

const cwdAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.flatMap(client => client('lab.cwd', void 0))
		)
	)
)

function LabPage() {
	const defaultCwd = useAtomSuspense(cwdAtom).value
	const inputRef = useRef<RichTextArea.Handle<{label: string}>>(null)
	const createAgent = useAtomSet(RpcClient.mutation('agent.create'), {mode: 'promise'})
	const promptAgent = useAtomSet(RpcClient.mutation('agent.prompt'), {mode: 'promise'})
	const stopAgent = useAtomSet(RpcClient.mutation('agent.stop'), {mode: 'promise'})
	const [cwd, setCwd] = useState(defaultCwd)
	const [agent, setAgent] = useState<AgentId>('codex')
	const availableModels = Array.filter(models, model => pipe(model.agents, Array.contains(agent)))
	const defaultModelId = `${availableModels[0]?.provider}:${availableModels[0]?.model}`
	const [modelId, setModelId] = useState(defaultModelId)
	const selectedModel = pipe(
		availableModels,
		Array.findFirst(model => `${model.provider}:${model.model}` === modelId),
		Option.orElse(() => Array.head(availableModels)),
		Option.getOrThrow
	)
	const [agentKey, setAgentKey] = useState<AgentKey>()

	async function submit(snapshot = inputRef.current?.getSnapshot()) {
		if (String.isEmpty(cwd)) return
		if (!snapshot || String.isEmpty(snapshot.text)) return
		const key = agentKey ?? (await createAgent({payload: {agent, cwd}}))
		setAgentKey(key)
		await promptAgent({
			payload: {key, model: selectedModel.model, prompt: snapshot.text, provider: selectedModel.provider}
		})
		inputRef.current?.clear()
	}

	function selectAgent(nextAgent: AgentId) {
		const nextModels = Array.filter(models, model => pipe(model.agents, Array.contains(nextAgent)))
		const nextModel = pipe(nextModels, Array.head, Option.getOrThrow)
		setAgent(nextAgent)
		setModelId(`${nextModel.provider}:${nextModel.model}`)
		setAgentKey(undefined)
	}

	return (
		<div className="bg-background flex h-full min-w-0 flex-col overflow-hidden">
			<header className="mx-auto mt-4 grid w-full max-w-4xl gap-3 border p-3 md:grid-cols-[minmax(0,1fr)_auto]">
				<Input
					value={cwd}
					onChange={event => {
						setCwd(event.target.value)
					}}
					placeholder="cwd"
					required
				/>
				<div className="flex items-center gap-1">
					{Array.map(AgentIdSchema.literals, layer => (
						<Button
							key={layer}
							variant={agent === layer ? 'default' : 'outline'}
							size="xs"
							className="gap-1.5 rounded-none"
							onClick={() => {
								selectAgent(layer)
							}}
						>
							<AgentIcon layer={layer} className="size-3" />
							{layer}
						</Button>
					))}
				</div>
			</header>
			<main className="min-h-0 flex-1 overflow-hidden">
				{agentKey ? (
					<AgentTranscript agentKey={agentKey} />
				) : (
					<div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
						Configure a session and send a prompt.
					</div>
				)}
			</main>
			<footer className="border-t p-3">
				<div className="relative mx-auto max-w-4xl">
					<RichTextArea ref={inputRef} onSubmit={submit} placeholder="Send a message..." />
					<RichTextArea.ToolBar>
						<div className="flex w-full items-center gap-2">
							<Select
								value={`${selectedModel.provider}:${selectedModel.model}`}
								onValueChange={value => {
									setModelId(value ?? '')
								}}
							>
								<SelectTrigger className="h-7 w-64 rounded-none text-xs">
									<span className="flex min-w-0 items-center gap-2">
										<ProviderIcon provider={selectedModel.provider} className="size-3" />
										<span className="min-w-0 truncate">{selectedModel.model}</span>
									</span>
								</SelectTrigger>
								<SelectContent>
									{Array.map(availableModels, model => (
										<SelectItem key={`${model.provider}:${model.model}`} value={`${model.provider}:${model.model}`}>
											<ProviderIcon provider={model.provider} className="size-3" />
											{model.model}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<div className="ml-auto flex items-center gap-2">
								<Button
									variant="outline"
									size="icon-xs"
									className="rounded-none"
									disabled={!agentKey}
									onClick={() => agentKey && void stopAgent({payload: {key: agentKey}})}
								>
									<Square className="size-3.5 fill-current" />
								</Button>
								<Button
									size="icon-xs"
									className="rounded-none"
									disabled={String.isEmpty(cwd)}
									onClick={() => void submit()}
								>
									<ArrowUpIcon className="size-3.5" />
								</Button>
							</div>
						</div>
					</RichTextArea.ToolBar>
				</div>
			</footer>
		</div>
	)
}

function AgentTranscript(input: {readonly agentKey: AgentKey}) {
	useAtomSuspense(agentStatusAtom(input.agentKey))
	const events = useAtomSuspense(agentEventsAtom(input.agentKey)).value
	const runs = Array.reduce(
		events,
		Array.empty<{readonly id: string; readonly prompt: string; readonly parts: readonly AgentEvent[]}>(),
		(runs, event) => {
			if (event.type === 'user-message') {
				return Array.append(runs, {id: `${Array.length(runs)}`, parts: [], prompt: event.prompt})
			}
			if (!Array.isArrayNonEmpty(runs)) return runs
			const [previousRuns, currentRun] = Array.unappend(runs)
			return [...previousRuns, {...currentRun, parts: [...currentRun.parts, event]}]
		}
	)

	return (
		<Conversation items={runs} className="p-4">
			{run => (
				<div className="mx-auto flex max-w-4xl flex-col gap-3">
					<article className="flex gap-2">
						<div className="w-0.5 shrink-0 bg-orange-500/50" />
						<div className="min-w-0 flex-1 border-2 border-orange-500/20 bg-orange-500/[0.003] px-3">
							<div className="border-border/60 text-muted-foreground flex items-center gap-1.5 border-b py-2 font-mono text-[11px] leading-none">
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
	)
}

function AgentResponse(input: {readonly parts: readonly AgentEvent[]}) {
	const parts = pipe(
		input.parts,
		Array.filter(event => event.type === 'agent-part'),
		Array.map(event => event.part),
		compactAiParts
	)
	const reasoningParts = pipe(
		parts,
		Array.filter(part => part.type === 'reasoning-delta')
	)
	const responseParts = pipe(
		parts,
		Array.filter(part => part.type !== 'reasoning-delta')
	)
	const metadata = pipe(
		parts,
		Array.findFirst(part => part.type === 'response-metadata'),
		Option.getOrUndefined
	)
	const finish = pipe(
		parts,
		Array.findFirst(part => part.type === 'finish'),
		Option.getOrUndefined
	)
	if (Array.isReadonlyArrayEmpty(parts)) return

	return (
		<div className="flex flex-col gap-3">
			{Array.map(reasoningParts, (part, index) => (
				<article key={index} className="flex gap-2">
					<div className="bg-muted-foreground/40 w-0.5 shrink-0" />
					<div className="border-muted-foreground/25 bg-muted/20 text-muted-foreground min-w-0 flex-1 border px-3 text-xs leading-5">
						<div className="border-border/60 flex items-center gap-1.5 border-b py-2 font-mono text-[11px] leading-none">
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
					<div className="border-border/60 text-muted-foreground flex items-center gap-1.5 border-b py-2 font-mono text-[11px] leading-none">
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
							if (part.type === 'tool-call' || part.type === 'tool-result') return <ToolPart key={index} part={part} />
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
	readonly part: Extract<ReturnType<typeof compactAiParts>[number], {readonly type: 'tool-call' | 'tool-result'}>
}) {
	return (
		<div className="group bg-muted/5 border">
			<div className="text-muted-foreground flex min-h-7 w-full items-center gap-2 px-2 py-1 text-left font-mono text-[11px]">
				<Wrench className="size-3 shrink-0" />
				<span className="text-foreground leading-none">{input.part.name}</span>
				<span>{input.part.type === 'tool-result' ? (input.part.isFailure ? 'failed' : 'done') : 'running'}</span>
			</div>
		</div>
	)
}
