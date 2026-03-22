import {useAtomSet, useAtomSuspense} from '@effect/atom-react'
import {Array, Effect, Match, Option, pipe, Schema, Stream, String} from 'effect'

import {makeFileParts} from '@ai-toolkit/ai/utils'
import {ChevronRight, Search, Sparkles, Trash2} from '@ai-toolkit/components/icons'
import {AutocompleteInput} from '@ai-toolkit/components/input'
import {Favicon, LinkPreview} from '@ai-toolkit/components/render/link-preview'
import {Markdown} from '@ai-toolkit/components/render/markdown'
import {Button} from '@ai-toolkit/components/ui/button'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@ai-toolkit/components/ui/collapsible'
import {Input} from '@ai-toolkit/components/ui/input'
import {ResizableHandle, ResizablePanel, ResizablePanelGroup} from '@ai-toolkit/components/ui/resizable'
import {createFileRoute} from '@tanstack/react-router'
import {Prompt} from 'effect/unstable/ai'
import {Atom} from 'effect/unstable/reactivity'
import {useRef} from 'react'

import {AtomRuntime, RpcClient} from '#lib/atomRuntime.ts'
import {NoteId} from '#rpcs/contracts.ts'

const allNotesAtom = Atom.keepAlive(
	AtomRuntime.atom(
		pipe(
			RpcClient.asEffect(),
			Effect.map(client => client('note.list', void 0)),
			Stream.unwrap
		),
		{initialValue: Array.empty()}
	)
)

const filteredNotesAtom = Atom.family((filters: {query?: string}) =>
	Atom.mapResult(allNotesAtom, notes => {
		const query = pipe(filters.query ?? '', String.toLowerCase)
		return pipe(
			notes,
			Array.filter(note => {
				if (String.isEmpty(query)) return true

				if (pipe(note.title, String.toLowerCase, String.includes(query))) return true
				return pipe(
					note.parts,
					Array.reduce(String.String(''), (text, part) => {
						if (Prompt.isMessage(part)) return text
						return pipe(
							Match.value(part),
							Match.when({type: 'text-delta'}, next => `${text}${next.delta}`),
							Match.when({type: 'tool-call'}, next => `${text}${JSON.stringify(next.params)}`),
							Match.when({type: 'tool-result'}, next => `${text}${JSON.stringify(next.result)}`),
							Match.orElse(() => text)
						)
					}),
					String.toLowerCase,
					String.includes(query)
				)
			})
		)
	})
)

const selectedNoteAtom = Atom.family((id?: string) =>
	Atom.mapResult(allNotesAtom, notes =>
		pipe(
			id,
			Option.fromNullishOr,
			Option.flatMap(id => Array.findFirst(notes, n => n.id === id))
		)
	)
)

const createNoteAtom = AtomRuntime.fn(
	Effect.fnUntraced(function* (payload: {text: string; files: readonly File[]}) {
		const files = yield* makeFileParts(payload.files)
		const client = yield* RpcClient.asEffect()
		return yield* client(
			'note.create',
			Prompt.userMessage({
				content: [Prompt.makePart('text', {text: payload.text}), ...files]
			})
		)
	})
)

export const Route = createFileRoute('/(home)/')({
	validateSearch: Schema.toStandardSchemaV1(
		Schema.Struct({
			id: Schema.optional(NoteId),
			query: Schema.optional(Schema.Trimmed)
		})
	),
	component: RouteComponent
})

function RouteComponent() {
	const {id: selectedId, query} = Route.useSearch()
	const {value: filteredNotes} = useAtomSuspense(filteredNotesAtom({query}))
	const {value: selectedNote} = useAtomSuspense(selectedNoteAtom(selectedId))
	const navigate = Route.useNavigate()
	const deleteNote = useAtomSet(RpcClient.mutation('note.delete'))
	const createNote = useAtomSet(createNoteAtom, {mode: 'promise'})
	const inputRef = useRef<AutocompleteInput.Handle>(null)

	function submit() {
		const text = pipe(inputRef.current?.getText() ?? '', String.trim)
		const files = Array.fromIterable(inputRef.current?.getFiles() ?? [])
		if (String.isEmpty(text)) return
		inputRef.current?.clear()
		createNote({text, files}).then(id => navigate({search: current => ({...current, id})}))
	}

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
				<ResizablePanel
					defaultSize="30%"
					minSize="15%"
					maxSize="60%"
					className="flex min-h-0 flex-col overflow-hidden border-r"
				>
					<div className="flex h-12 items-center border-b px-3">
						<div className="relative w-full">
							<Search className="absolute top-1/2 left-2.5 size-3 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="Search notes..."
								value={query ?? ''}
								onChange={e => navigate({search: current => ({...current, query: e.target.value || undefined})})}
								className="pl-7"
							/>
						</div>
					</div>

					<div className="border-b px-3 py-2 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
						{Array.length(filteredNotes)} notes
					</div>

					<div className="flex-1 overflow-y-auto">
						{Array.map(filteredNotes, note => (
							<div
								key={note.id}
								className={`group flex w-full items-center border-b transition-colors ${selectedId === note.id ? 'bg-muted' : 'hover:bg-muted/50'}`}
							>
								<button
									type="button"
									onClick={() =>
										navigate({
											search: current => ({...current, id: current.id === note.id ? undefined : note.id})
										})
									}
									className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2 text-left"
								>
									<div className="truncate font-medium text-xs">{note.title}</div>
								</button>
								<Button
									variant="ghost"
									size="icon-xs"
									className="mr-2 shrink-0 text-destructive opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
									onClick={e => {
										e.stopPropagation()
										if (selectedId === note.id) navigate({search: current => ({...current, id: undefined})})
										deleteNote({payload: note.id})
									}}
								>
									<Trash2 className="size-3" />
								</Button>
							</div>
						))}
					</div>
				</ResizablePanel>

				<ResizableHandle />

				<ResizablePanel defaultSize="70%" className="flex min-h-0 flex-col overflow-hidden">
					<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
						{Option.match(selectedNote, {
							onSome: note => {
								const userFiles = pipe(
									note.parts,
									Array.reduce(
										Array.empty<{
											type: 'file'
											mediaType: string
											fileName?: string
											data: string | Uint8Array | URL
										}>(),
										(files, part) => {
											if (!Prompt.isMessage(part)) return files
											if (part.role !== 'user') return files
											return pipe(
												part.content,
												Array.reduce(files, (nextFiles, item) => {
													if (item.type !== 'file') return nextFiles
													return Array.append(nextFiles, item)
												})
											)
										}
									)
								)
								const toolParts = pipe(
									note.parts,
									Array.filter(part => {
										if (Prompt.isMessage(part)) return false
										if (part.type !== 'tool-result') return false
										return part.name === 'WebFetch' || part.name === 'WebSearch'
									})
								)

								return (
									<>
										<div className="flex h-12 items-center border-b px-3">
											<h1 className="min-w-0 flex-1 truncate font-medium text-sm leading-snug">{note.title}</h1>
										</div>
										<div className="flex-1 overflow-y-auto">
											<div className="flex flex-col gap-3 px-3 py-3">
												{Array.map(note.parts, (part, index) => {
													if (Prompt.isMessage(part)) return
													return pipe(
														Match.value(part),
														Match.when({type: 'text-delta'}, text => <Markdown key={index}>{text.delta}</Markdown>),
														Match.orElse(() => null)
													)
												})}
												{(Array.isReadonlyArrayNonEmpty(userFiles) || Array.isReadonlyArrayNonEmpty(toolParts)) && (
													<hr className="border-border" />
												)}
												<div className="flex flex-col gap-2">
													{Array.map(userFiles, (file, index) =>
														pipe(
															file.mediaType,
															String.startsWith('image/'),
															Match.value,
															Match.when(true, () => (
																<Collapsible key={index} className="group">
																	<CollapsibleTrigger className="flex min-h-8 w-full items-center gap-2 rounded-md border px-3 py-1.5 text-left text-xs">
																		<img
																			src={`${file.data}`}
																			alt={file.fileName ?? 'image'}
																			className="size-4 shrink-0 rounded-sm border object-cover"
																		/>
																		<div className="min-w-0 flex-1 truncate text-muted-foreground">
																			{file.fileName ?? file.mediaType} · {file.mediaType}
																		</div>
																		<ChevronRight className="ml-auto size-3 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[open]:rotate-90" />
																	</CollapsibleTrigger>
																	<CollapsibleContent>
																		<div className="mt-1 overflow-hidden rounded-md border">
																			<img
																				src={`${file.data}`}
																				alt={file.fileName ?? 'image'}
																				className="max-h-120 w-full object-contain"
																			/>
																		</div>
																	</CollapsibleContent>
																</Collapsible>
															)),
															Match.orElse(() => (
																<div
																	key={index}
																	className="flex min-h-8 items-center gap-2 rounded-md border px-3 py-1.5 text-xs"
																>
																	<div className="flex size-4 shrink-0 items-center justify-center rounded-sm border text-muted-foreground">
																		•
																	</div>
																	<div className="min-w-0 flex-1 truncate text-muted-foreground">
																		{file.fileName ?? file.mediaType} · {file.mediaType}
																	</div>
																</div>
															))
														)
													)}
													{Array.map(toolParts, (part, index) => {
														return pipe(
															Match.value(part),
															Match.when({type: 'tool-result', name: 'WebFetch'}, toolResult => {
																const urlStr = pipe(toolResult.result.title, String.split(' ('), Array.headNonEmpty)
																return (
																	<Collapsible key={index} className="group">
																		<CollapsibleTrigger className="flex min-h-8 w-full items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
																			<Favicon url={urlStr} />
																			<span className="min-w-0 truncate text-muted-foreground">{urlStr}</span>
																			<ChevronRight className="ml-auto size-3 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[open]:rotate-90" />
																		</CollapsibleTrigger>
																		<CollapsibleContent>
																			<div className="mt-1 overflow-hidden rounded-md border">
																				<LinkPreview url={new URL(urlStr)} />
																			</div>
																		</CollapsibleContent>
																	</Collapsible>
																)
															}),
															Match.when({type: 'tool-result', name: 'WebSearch'}, toolResult => (
																<Collapsible key={index} className="group">
																	<CollapsibleTrigger className="flex min-h-8 w-full items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
																		<Search className="size-3.5 shrink-0 text-muted-foreground" />
																		<span className="min-w-0 truncate text-muted-foreground">
																			{Array.length(toolResult.result)} results
																		</span>
																		<ChevronRight className="ml-auto size-3 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[open]:rotate-90" />
																	</CollapsibleTrigger>
																	<CollapsibleContent>
																		<div className="mt-1 flex flex-col gap-1 rounded-md border p-3">
																			{Array.map(toolResult.result, (r, ri) => (
																				<a
																					key={ri}
																					href={r.url}
																					target="_blank"
																					rel="noreferrer"
																					className="block rounded px-2 py-1.5 transition-colors hover:bg-muted"
																				>
																					<div className="font-medium text-primary text-xs">{r.title ?? r.url}</div>
																					<div className="truncate text-[10px] text-muted-foreground">{r.url}</div>
																				</a>
																			))}
																		</div>
																	</CollapsibleContent>
																</Collapsible>
															)),
															Match.orElse(() => null)
														)
													})}
												</div>
											</div>
										</div>
									</>
								)
							},
							onNone: () => (
								<div className="flex flex-1 items-center justify-center text-muted-foreground text-xs">
									{Array.isReadonlyArrayEmpty(filteredNotes) ? 'No notes yet' : 'Select a note to read'}
								</div>
							)
						})}
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>

			<div className="flex w-full flex-col items-center justify-center border-t p-3">
				<AutocompleteInput
					ref={inputRef}
					placeholder="Paste text, links, ideas, ..."
					className="w-full flex-1"
					onSubmit={submit}
				/>
				<AutocompleteInput.ToolBar>
					<Button onClick={submit} size="icon" className="ml-auto">
						<Sparkles />
					</Button>
				</AutocompleteInput.ToolBar>
			</div>
		</div>
	)
}
