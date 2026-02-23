import {Effect, pipe, Schema, Stream} from 'effect'

import type {Model} from '@ai-toolkit/ai/catalog'
import {ChatInput, Snippet, Snippets, Toolbar} from '@ai-toolkit/components/ai/input'
import {Message} from '@ai-toolkit/components/ai/message'
import {ModelSelector} from '@ai-toolkit/components/ai/model-selector'
import {Conversation} from '@ai-toolkit/components/conversation'
import {Loading} from '@ai-toolkit/components/fallbacks'
import {Bot, Code, CodeXml, Plus, Trash2} from '@ai-toolkit/components/icons'
import {TreeExplorer, TreeExplorerItem, TreeExplorerSection} from '@ai-toolkit/components/tree-explorer'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import {Atom, useAtomSet, useAtomSuspense} from '@effect-atom/atom-react'
import {createFileRoute} from '@tanstack/react-router'
import {Suspense, useState} from 'react'

import {AtomRuntime, RpcClient} from '#lib/atomRuntime.ts'
import {SessionId} from '#rpcs/sessions/contracts.ts'

export const Route = createFileRoute('/(home)/')({
	component: RouteComponent,
	validateSearch: Schema.standardSchemaV1(
		Schema.Struct({
			sessionId: Schema.optionalWith(SessionId, {default: () => SessionId.make(crypto.randomUUID())})
		})
	)
})

function RouteComponent() {
	const {sessionId} = Route.useSearch()

	return (
		<ResizablePanelGroup orientation="horizontal">
			<ResizablePanel defaultSize="15%" minSize="10%" maxSize="40%">
				<Sidebar sessionId={sessionId} />
			</ResizablePanel>
			<ResizableHandle />
			<ResizablePanel className="flex h-full w-full">
				<Suspense fallback={<Loading />}>
					<Session sessionId={sessionId} />
				</Suspense>
			</ResizablePanel>
		</ResizablePanelGroup>
	)
}

const sessionsAtom = Atom.keepAlive(
	AtomRuntime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('sessions.list', void 0)),
			Stream.unwrap
		)
	)
)

function Sidebar(props: {sessionId: SessionId}) {
	const navigate = Route.useNavigate()

	const {value: sessions} = useAtomSuspense(sessionsAtom)
	const addSession = useAtomSet(RpcClient.mutation('sessions.add'))
	const removeSession = useAtomSet(RpcClient.mutation('sessions.remove'))

	return (
		<aside className="flex h-full flex-col border-sidebar-border bg-sidebar text-sidebar-foreground">
			<div className="flex items-center justify-between border-sidebar-border border-b px-3 py-2">
				<div className="font-semibold text-[11px] text-muted-foreground uppercase">Sessions</div>
				<button
					type="button"
					onClick={() => {
						const newSessionId = SessionId.make(crypto.randomUUID())
						addSession({payload: {name: 'New Session', sessionId: newSessionId}})
						navigate({search: {sessionId: newSessionId}})
					}}
					className="text-muted-foreground hover:text-foreground"
				>
					<Plus className="size-3.5" />
				</button>
			</div>
			<TreeExplorer
				selectedId={props.sessionId}
				onSelectedIdChange={id => navigate({search: {sessionId: SessionId.make(id)}})}
				className="min-h-0 flex-1 overflow-auto py-2"
			>
				<TreeExplorerSection>
					{sessions.map(session => (
						<TreeExplorerItem
							key={session.id}
							id={session.id}
							icon={<Bot className="size-3.5" />}
							trailing={
								<span className="flex items-center gap-1">
									<button
										type="button"
										onClick={event => {
											event.stopPropagation()
											removeSession({payload: {sessionId: session.id}})
										}}
										className="text-muted-foreground hover:text-foreground"
									>
										<Trash2 className="size-3" />
									</button>
								</span>
							}
						>
							{session.name}
						</TreeExplorerItem>
					))}
				</TreeExplorerSection>
			</TreeExplorer>
		</aside>
	)
}

const messagesAtom = Atom.family((sessionId: SessionId) =>
	Atom.keepAlive(
		AtomRuntime.atom(
			pipe(
				RpcClient,
				Effect.map(client => client('ai.listMessages', {sessionId})),
				Stream.unwrap
			)
		)
	)
)

function Session(props: {sessionId: SessionId}) {
	const {value: messages} = useAtomSuspense(messagesAtom(props.sessionId))
	const sendMessage = useAtomSet(RpcClient.mutation('ai.sendMessage'))
	const [model, setModel] = useState<Model>({provider: 'openrouter', model: 'google/gemma-3n-e4b-it:free'})

	return (
		<div className="flex h-full w-full flex-col">
			<Conversation className="min-h-0 flex-1">
				{messages.map((message, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: _
					<Message key={index} {...message} />
				))}
			</Conversation>

			<ChatInput
				onSubmit={data =>
					sendMessage({
						payload: {
							sessionId: props.sessionId,
							prompt: data.text,
							model,
							attachments: data.attachments
						}
					})
				}
			>
				<Toolbar>
					<ModelSelector model={model} onModelChange={setModel} />
				</Toolbar>

				<Snippets>
					<Snippet insert={'```\n\n```\n'}>
						<Code className="size-3.5" />
					</Snippet>
					<Snippet insert={'<section>\n\n</section>\n'}>
						<CodeXml className="size-3.5" />
					</Snippet>
				</Snippets>
			</ChatInput>
		</div>
	)
}
