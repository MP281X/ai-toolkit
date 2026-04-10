import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, Predicate, pipe, Schema, Stream, String} from 'effect'

import {makeFileParts, partsStreamReducer} from '@ai-toolkit/ai/utils'
import {Conversation} from '@ai-toolkit/components/conversation'
import {
	ArrowUpIcon,
	BookOpenTextIcon,
	Brain,
	ChevronRight,
	ClockIcon,
	Ellipsis,
	ExternalLink,
	FolderOpen,
	FolderPlus,
	HashIcon,
	InboxIcon,
	Paperclip,
	Pencil,
	Plus,
	SparklesIcon,
	Square,
	SquarePen,
	Trash2,
	UserIcon,
	Wrench,
	X
} from '@ai-toolkit/components/icons'
import {AutocompleteInput} from '@ai-toolkit/components/input'
import {Favicon} from '@ai-toolkit/components/render/link-preview'
import {Markdown} from '@ai-toolkit/components/render/markdown'
import {Button} from '@ai-toolkit/components/ui/button'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@ai-toolkit/components/ui/collapsible'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger
} from '@ai-toolkit/components/ui/dropdown-menu'
import {Input} from '@ai-toolkit/components/ui/input'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import {cn, formatError, formatNumber, formatTimestamp} from '@ai-toolkit/components/utils'
import {createFileRoute} from '@tanstack/react-router'
import {Prompt} from 'effect/unstable/ai'
import {Atom} from 'effect/unstable/reactivity'
import {Fragment, useRef, useState} from 'react'

import {RpcClient} from '#lib/atomRuntime.ts'
import {Session, SessionId} from '#rpcs/contracts.ts'

const workspacesAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('agent.workspaces', void 0)),
			Stream.unwrap
		),
		{initialValue: []}
	)
)

const sessionsAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('agent.sessions', void 0)),
			Stream.unwrap
		),
		{initialValue: []}
	)
)

const turnsAtom = Atom.family((sessionId: SessionId) =>
	Atom.keepAlive(
		RpcClient.runtime.atom(
			pipe(
				RpcClient.asEffect(),
				Effect.map(client => client('agent.events', {sessionId})),
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
								turn.responses.push({id: turn.responses.length, metadata: part, finish: undefined, parts: []})
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
)

const sendPromptAtom = RpcClient.runtime.fn(
	Effect.fnUntraced(function* (payload: {sessionId: SessionId; text: string; attachments: File[]}) {
		const client = yield* RpcClient
		yield* client('agent.prompt', {
			sessionId: payload.sessionId,
			message: Prompt.userMessage({
				content: [Prompt.makePart('text', {text: payload.text}), ...(yield* makeFileParts(payload.attachments))]
			})
		})
	})
)

const stopAgentAtom = RpcClient.runtime.fn(
	Effect.fnUntraced(function* (payload: {sessionId: SessionId}) {
		const client = yield* RpcClient
		yield* client('agent.stop', {sessionId: payload.sessionId})
	})
)

export const Route = createFileRoute('/(home)/')({
	validateSearch: Schema.toStandardSchemaV1(
		Schema.Struct({
			sessionId: Schema.optional(SessionId)
		})
	),
	component: RouteComponent
})

function RouteComponent() {
	const {sessionId: selectedId} = Route.useSearch()
	const {value: workspaces} = useAtomSuspense(workspacesAtom)
	const {value: sessions} = useAtomSuspense(sessionsAtom)
	const navigate = Route.useNavigate()
	const createWorkspace = useAtomSet(RpcClient.mutation('agent.createWorkspace'))
	const updateWorkspace = useAtomSet(RpcClient.mutation('agent.updateWorkspace'))
	const deleteWorkspace = useAtomSet(RpcClient.mutation('agent.deleteWorkspace'))
	const createSession = useAtomSet(RpcClient.mutation('agent.createSession'))
	const updateSession = useAtomSet(RpcClient.mutation('agent.updateSession'))
	const deleteSession = useAtomSet(RpcClient.mutation('agent.deleteSession'))
	const [creatingWorkspace, setCreatingWorkspace] = useState<{parentId: string | null} | null>(null)
	const [creatingWorkspaceName, setCreatingWorkspaceName] = useState('')
	const [editingWorkspace, setEditingWorkspace] = useState<string | null>(null)
	const [editingWorkspaceName, setEditingWorkspaceName] = useState('')
	const [editingSession, setEditingSession] = useState<string | null>(null)
	const [editingSessionTitle, setEditingSessionTitle] = useState('')

	// Build parent → children map for workspaces
	const childrenMap = new Map<string | null, typeof workspaces>()
	for (const ws of workspaces) {
		const existing = childrenMap.get(ws.parentId) ?? []
		childrenMap.set(ws.parentId, [...existing, ws])
	}

	// Build workspace → sessions map
	const sessionMap = new Map<string, typeof sessions>()
	for (const session of sessions) {
		const existing = sessionMap.get(session.workspaceId) ?? []
		sessionMap.set(session.workspaceId, [...existing, session])
	}

	const renderTree = (parentId: string | null, depth: number) =>
		pipe(
			childrenMap.get(parentId) ?? [],
			Array.map(ws => {
				const wsItems = sessionMap.get(ws.id) ?? []
				return (
					<Collapsible key={ws.id} defaultOpen>
						<div
							className="group flex items-center gap-1 py-1 pr-2 hover:bg-muted"
							style={{paddingLeft: `${depth * 12 + 8}px`}}
						>
							{editingWorkspace === ws.id ? (
								<>
									<FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
									<Input
										value={editingWorkspaceName}
										onChange={e => setEditingWorkspaceName(e.target.value)}
										autoFocus
										className="h-5 min-w-0 flex-1 border-none bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
										onKeyDown={e => {
											if (e.key === 'Enter') {
												const name = pipe(editingWorkspaceName, String.trim)
												if (String.isNonEmpty(name)) {
													updateWorkspace({payload: {id: ws.id, name}})
												}
												setEditingWorkspace(null)
											}
											if (e.key === 'Escape') setEditingWorkspace(null)
										}}
										onBlur={() => setEditingWorkspace(null)}
									/>
								</>
							) : (
								<>
									<CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
										<FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
										<span className="min-w-0 flex-1 truncate text-sm">{ws.name}</span>
									</CollapsibleTrigger>

									<DropdownMenu>
										<DropdownMenuTrigger
											className="shrink-0 rounded-sm p-0.5 opacity-0 hover:bg-accent focus:opacity-100 group-hover:opacity-100"
											onClick={e => e.stopPropagation()}
										>
											<Ellipsis className="size-3.5 text-muted-foreground" />
										</DropdownMenuTrigger>
										<DropdownMenuContent side="bottom" align="end" sideOffset={4}>
											<DropdownMenuItem
												onClick={() => {
													const session = new Session({
														title: 'New chat',
														workspaceId: ws.id
													})
													createSession({
														payload: {id: session.id, workspaceId: session.workspaceId}
													})
													navigate({search: {sessionId: session.id}})
												}}
											>
												<SquarePen className="size-3.5" />
												New thread
											</DropdownMenuItem>
											<DropdownMenuItem onClick={() => setCreatingWorkspace({parentId: ws.id})}>
												<FolderPlus className="size-3.5" />
												New workspace
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={() => {
													setEditingWorkspace(ws.id)
													setEditingWorkspaceName(ws.name)
												}}
											>
												<Pencil className="size-3.5" />
												Edit name
											</DropdownMenuItem>
											<DropdownMenuItem
												variant="destructive"
												onClick={() => {
													navigate({search: {sessionId: undefined}})
													deleteWorkspace({payload: {id: ws.id}})
												}}
											>
												<X className="size-3.5" />
												Remove
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</>
							)}
						</div>

						<CollapsibleContent>
							{/* Sub-workspace creation input */}
							{Predicate.isNotNull(creatingWorkspace) && creatingWorkspace.parentId === ws.id && (
								<div className="flex items-center gap-1.5 py-1 pr-2" style={{paddingLeft: `${(depth + 1) * 12 + 8}px`}}>
									<FolderPlus className="size-3.5 shrink-0 text-muted-foreground" />
									<Input
										value={creatingWorkspaceName}
										onChange={e => setCreatingWorkspaceName(e.target.value)}
										autoFocus
										placeholder="Workspace name..."
										className="h-5 min-w-0 flex-1 border-none bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
										onKeyDown={e => {
											if (e.key === 'Enter') {
												const name = pipe(creatingWorkspaceName, String.trim)
												if (String.isNonEmpty(name)) {
													createWorkspace({payload: {name, parentId: ws.id}})
												}
												setCreatingWorkspaceName('')
												setCreatingWorkspace(null)
											}
											if (e.key === 'Escape') {
												setCreatingWorkspaceName('')
												setCreatingWorkspace(null)
											}
										}}
										onBlur={() => {
											setCreatingWorkspaceName('')
											setCreatingWorkspace(null)
										}}
									/>
								</div>
							)}

							{/* Recursive child workspaces */}
							{renderTree(ws.id, depth + 1)}

							{/* Sessions */}
							{Array.map(wsItems, session => (
								<div
									key={session.id}
									className={cn(
										'group/session flex items-center gap-1 py-1 pr-2',
										selectedId === session.id
											? 'bg-primary/15 text-primary'
											: 'text-muted-foreground hover:bg-muted hover:text-foreground'
									)}
									style={{paddingLeft: `${(depth + 1) * 12 + 8}px`}}
								>
									{editingSession === session.id ? (
										<Input
											value={editingSessionTitle}
											onChange={e => setEditingSessionTitle(e.target.value)}
											autoFocus
											className="h-5 min-w-0 flex-1 border-none bg-transparent px-0 py-0 text-xs shadow-none focus-visible:ring-0"
											onKeyDown={e => {
												if (e.key === 'Enter') {
													const title = pipe(editingSessionTitle, String.trim)
													if (String.isNonEmpty(title)) {
														updateSession({payload: {id: session.id, title}})
													}
													setEditingSession(null)
												}
												if (e.key === 'Escape') setEditingSession(null)
											}}
											onBlur={() => setEditingSession(null)}
										/>
									) : (
										<button
											type="button"
											onClick={() => navigate({search: {sessionId: session.id}})}
											className="min-w-0 flex-1 truncate text-left text-xs"
										>
											{session.title}
										</button>
									)}

									<DropdownMenu>
										<DropdownMenuTrigger
											className="shrink-0 rounded-sm p-0.5 opacity-0 hover:bg-accent focus:opacity-100 group-hover/session:opacity-100"
											onClick={e => e.stopPropagation()}
										>
											<Ellipsis className="size-3.5" />
										</DropdownMenuTrigger>
										<DropdownMenuContent side="bottom" align="end" sideOffset={4}>
											<DropdownMenuItem
												onClick={() => {
													setEditingSession(session.id)
													setEditingSessionTitle(session.title)
												}}
											>
												<Pencil className="size-3.5" />
												Rename thread
											</DropdownMenuItem>
											<DropdownMenuItem
												variant="destructive"
												onClick={() => {
													if (selectedId === session.id) navigate({search: {sessionId: undefined}})
													deleteSession({payload: {id: session.id}})
												}}
											>
												<Trash2 className="size-3.5" />
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							))}
						</CollapsibleContent>
					</Collapsible>
				)
			})
		)

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
				<ResizablePanel
					defaultSize="25%"
					minSize="15%"
					maxSize="40%"
					className="flex min-h-0 flex-col overflow-hidden border-r"
				>
					{/* Workspaces header */}
					<div className="flex items-center justify-between px-3 pt-3 pb-1">
						<span className="font-medium text-muted-foreground text-xs">Workspaces</span>
						<Button
							variant="ghost"
							size="icon-xs"
							className="rounded-none"
							onClick={() => setCreatingWorkspace({parentId: null})}
							title="New workspace"
						>
							<Plus className="size-3.5" />
						</Button>
					</div>

					{/* Root workspace creation input */}
					{Predicate.isNotNull(creatingWorkspace) && Predicate.isNull(creatingWorkspace.parentId) && (
						<div className="flex items-center gap-1.5 px-2 py-1">
							<FolderPlus className="size-3.5 shrink-0 text-muted-foreground" />
							<Input
								value={creatingWorkspaceName}
								onChange={e => setCreatingWorkspaceName(e.target.value)}
								autoFocus
								placeholder="Workspace name..."
								className="h-5 min-w-0 flex-1 border-none bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
								onKeyDown={e => {
									if (e.key === 'Enter') {
										const name = pipe(creatingWorkspaceName, String.trim)
										if (String.isNonEmpty(name)) {
											createWorkspace({payload: {name, parentId: null}})
										}
										setCreatingWorkspaceName('')
										setCreatingWorkspace(null)
									}
									if (e.key === 'Escape') {
										setCreatingWorkspaceName('')
										setCreatingWorkspace(null)
									}
								}}
								onBlur={() => {
									setCreatingWorkspaceName('')
									setCreatingWorkspace(null)
								}}
							/>
						</div>
					)}

					{/* Workspace tree */}
					<div className="flex-1 overflow-y-auto">{renderTree(null, 0)}</div>
				</ResizablePanel>

				<ResizableHandle />

				<ResizablePanel defaultSize="75%" className="flex min-h-0 flex-col overflow-hidden">
					{Predicate.isNotUndefined(selectedId) ? (
						<ConversationPanel key={selectedId} sessionId={selectedId} />
					) : (
						<div className="flex flex-1 items-center justify-center text-muted-foreground text-xs">
							Select or create a chat
						</div>
					)}
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	)
}

function ConversationPanel(props: {sessionId: SessionId}) {
	const {value: turns} = useAtomSuspense(turnsAtom(props.sessionId))
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
													{Predicate.isNotUndefined(response.finish?.usage.inputTokens.total) &&
														response.finish.usage.inputTokens.total > 0 && (
															<span className="inline-flex items-center gap-1 font-mono" title="input">
																<InboxIcon className="size-3 shrink-0" />
																{formatNumber(response.finish.usage.inputTokens.total)}
															</span>
														)}
													{Predicate.isNotUndefined(response.finish?.usage.outputTokens.total) &&
														response.finish.usage.outputTokens.total > 0 && (
															<span className="inline-flex items-center gap-1 font-mono" title="output">
																<BookOpenTextIcon className="size-3 shrink-0" />
																{formatNumber(response.finish.usage.outputTokens.total)}
															</span>
														)}
													{Predicate.isNotUndefined(response.finish?.usage.outputTokens.reasoning) &&
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
						sendPrompt({
							sessionId: props.sessionId,
							text,
							attachments: Array.fromIterable(inputRef.current?.getFiles() ?? [])
						})
						inputRef.current?.clear()
					}}
					placeholder="Send a message, paste a URL, drop files..."
					className="w-full"
				/>
				<AutocompleteInput.ToolBar className="border-t-0">
					<div className="ml-auto flex items-center gap-2">
						<Button
							onClick={() => stopAgent({sessionId: props.sessionId})}
							variant="outline"
							size="icon-xs"
							className="rounded-none"
						>
							<Square className="size-3.5 fill-current" />
						</Button>
						<Button
							onClick={() => {
								const text = pipe(inputRef.current?.getText() ?? '', String.trim)
								if (String.isEmpty(text)) return
								sendPrompt({
									sessionId: props.sessionId,
									text,
									attachments: Array.fromIterable(inputRef.current?.getFiles() ?? [])
								})
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
