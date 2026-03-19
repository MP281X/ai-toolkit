import {Array, Order, pipe, Record, String} from 'effect'

import {LexicalComposer} from '@lexical/react/LexicalComposer'
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import {ContentEditable} from '@lexical/react/LexicalContentEditable'
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary'
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin'
import {PlainTextPlugin} from '@lexical/react/LexicalPlainTextPlugin'
import {LexicalTypeaheadMenuPlugin, MenuOption} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import * as lexical from 'lexical'
import {useEffect, useImperativeHandle, useRef, useState} from 'react'
import {createPortal} from 'react-dom'

import {Command, CommandItem, CommandList} from '#components/ui/command.tsx'
import {cn} from '#lib/utils.ts'

type TokenKind = 'entry' | 'file'

type SerializedTokenNode = lexical.SerializedTextNode & {
	id: string
	kind: TokenKind
	type: 'input-token'
}

class TokenNode extends lexical.TextNode {
	__id: string
	__kind: TokenKind

	static override getType() {
		return 'input-token'
	}

	static override clone(node: TokenNode) {
		return new TokenNode(node.__text, node.__id, node.__kind, node.__key)
	}

	static override importJSON(node: SerializedTokenNode) {
		return new TokenNode(node.text, node.id, node.kind).updateFromJSON(node)
	}

	override exportJSON(): SerializedTokenNode {
		return {...super.exportJSON(), type: 'input-token', id: this.__id, kind: this.__kind}
	}

	constructor(text: string, id: string, kind: TokenKind, key?: lexical.NodeKey) {
		super(text, key)
		this.__id = id
		this.__kind = kind
	}

	override isTextEntity(): true {
		return true
	}

	override canInsertTextBefore() {
		return false
	}

	override canInsertTextAfter() {
		return false
	}
}

class Item<TValue extends AutocompleteInput.Value> extends MenuOption {
	readonly entry: AutocompleteInput.Entry<TValue>

	constructor(entry: AutocompleteInput.Entry<TValue>, key: string) {
		super(key)
		this.entry = entry
	}
}

function read<T>(editor: lexical.LexicalEditor | null, kind: TokenKind, map: Map<string, T>) {
	if (!editor) return Array.empty<T>()

	const ids = new Set<string>()
	const values = Array.empty<T>()

	editor.getEditorState().read(() => {
		for (const node of lexical.$getRoot().getAllTextNodes()) {
			if (!(node instanceof TokenNode) || node.__kind !== kind) continue

			ids.add(node.__id)

			const value = map.get(node.__id)
			if (value) values.push(value)
		}
	})

	for (const id of map.keys()) {
		if (!ids.has(id)) map.delete(id)
	}

	return values
}

function getItems<TValue extends AutocompleteInput.Value>(
	search: null | {trigger: string; query: string},
	options: AutocompleteInput.Options<TValue> | undefined
) {
	if (!search) return Array.empty<Item<TValue>>()

	const group = options?.[search.trigger]
	if (!group) return Array.empty<Item<TValue>>()

	const query = pipe(search.query, String.toLowerCase)

	return pipe(
		group.values,
		Array.filter(value => String.isEmpty(query) || pipe(value.label, String.toLowerCase, String.includes(query))),
		Array.take(10),
		Array.map(
			(value, index) =>
				new Item({trigger: search.trigger, value, color: group.color}, `${search.trigger}:${value.label}:${index}`)
		)
	)
}

function renderEntry<TValue extends AutocompleteInput.Value>(
	entry: AutocompleteInput.Entry<TValue>,
	children?: (entry: AutocompleteInput.Entry<TValue>) => React.ReactNode
) {
	if (children) return children(entry)

	return (
		<>
			{/* biome-ignore lint/plugin: dynamic colors are part of the token/menu API here */}
			<span className="font-medium" style={{color: entry.color}}>
				{entry.trigger}
			</span>
			<span className="text-foreground">{entry.value.label}</span>
		</>
	)
}

function match<const TTrigger extends string>(text: string, triggers: readonly TTrigger[]) {
	for (const trigger of triggers) {
		// biome-ignore lint/plugin: small local parser for Lexical multi-trigger matching
		const index = text.lastIndexOf(trigger)
		if (index < 0) continue

		const prev = text[index - 1] ?? ''
		if (index > 0 && prev !== '(' && !/\s/.test(prev)) continue

		const query = pipe(text, String.slice(index + String.length(trigger)))
		if (String.length(query) > 32 || /\s/.test(query)) continue

		return {
			trigger,
			query,
			leadOffset: index,
			replaceableString: pipe(text, String.slice(index))
		}
	}
}

function EditorPlugin({
	editorRef,
	filesRef,
	menuRef,
	onSubmit
}: {
	editorRef: {current: lexical.LexicalEditor | null}
	filesRef: {current: Map<string, File>}
	menuRef: {current: boolean}
	onSubmit?: () => void
}) {
	const [editor] = useLexicalComposerContext()

	useEffect(() => {
		editorRef.current = editor

		return () => {
			editorRef.current = null
		}
	}, [editor, editorRef])

	useEffect(() => {
		return editor.registerCommand(
			lexical.KEY_ENTER_COMMAND,
			event => {
				if (event?.shiftKey || menuRef.current || !onSubmit) return false

				event?.preventDefault()
				onSubmit()
				return true
			},
			lexical.COMMAND_PRIORITY_LOW
		)
	}, [editor, menuRef, onSubmit])

	useEffect(() => {
		return editor.registerCommand(
			lexical.PASTE_COMMAND,
			event => {
				const data = event instanceof ClipboardEvent ? event.clipboardData : null
				const files = data ? Array.fromIterable(data.files) : Array.empty<File>()
				if (Array.isReadonlyArrayEmpty(files)) return false

				event?.preventDefault()

				editor.update(() => {
					let selection = lexical.$getSelection()

					if (!lexical.$isRangeSelection(selection)) {
						lexical.$getRoot().selectEnd()
						selection = lexical.$getSelection()
						if (!lexical.$isRangeSelection(selection)) return
					}

					for (const file of files) {
						const id = crypto.randomUUID()
						filesRef.current.set(id, file)

						selection.insertNodes([
							lexical
								.$applyNodeReplacement(new TokenNode(file.name, id, 'file'))
								.setMode('token')
								.setStyle('color: #f59e0b'),
							lexical.$createTextNode(' ')
						])
					}
				})

				return true
			},
			lexical.COMMAND_PRIORITY_HIGH
		)
	}, [editor, filesRef])

	return <HistoryPlugin />
}

function TypeaheadPlugin<TValue extends AutocompleteInput.Value>({
	children,
	entriesRef,
	menuBoxRef,
	menuRef,
	options
}: {
	children?: (entry: AutocompleteInput.Entry<TValue>) => React.ReactNode
	entriesRef: {current: Map<string, AutocompleteInput.Entry<TValue>>}
	menuBoxRef: React.RefObject<HTMLDivElement | null>
	menuRef: {current: boolean}
	options?: AutocompleteInput.Options<TValue>
}) {
	const [search, setSearch] = useState<null | {trigger: string; query: string}>(null)

	const triggers = pipe(
		options ?? {},
		Record.keys,
		Array.sortWith(
			String.length,
			Order.make((left, right) => {
				if (left > right) return -1
				if (left < right) return 1
				return 0
			})
		)
	)

	const items = getItems(search, options)

	return (
		<LexicalTypeaheadMenuPlugin<Item<TValue>>
			onQueryChange={() => {}}
			onOpen={() => {
				menuRef.current = true
			}}
			onClose={() => {
				menuRef.current = false
			}}
			triggerFn={text => {
				const next = match(text, triggers)

				setSearch(current => {
					const value = next ? {trigger: next.trigger, query: next.query} : null
					if (current?.trigger === value?.trigger && current?.query === value?.query) return current
					return value
				})

				return next
					? {
							leadOffset: next.leadOffset,
							matchingString: next.query,
							replaceableString: next.replaceableString
						}
					: null
			}}
			onSelectOption={(option, node, close) => {
				const id = crypto.randomUUID()
				entriesRef.current.set(id, option.entry)

				const token = lexical
					.$applyNodeReplacement(new TokenNode(`${option.entry.trigger}${option.entry.value.label}`, id, 'entry'))
					.setMode('token')
					.setStyle(`color: ${option.entry.color}`)

				if (node) {
					// biome-ignore lint/plugin: Lexical node API uses imperative replacement here
					node.replace(token)
				}

				if (!node) {
					const selection = lexical.$getSelection()
					if (!lexical.$isRangeSelection(selection)) return
					selection.insertNodes([token])
				}

				const gap = lexical.$createTextNode(' ')
				token.insertAfter(gap)
				gap.selectEnd()
				close()
			}}
			options={items}
			anchorClassName="z-50"
			menuRenderFn={(anchorRef, props) =>
				!(anchorRef.current && menuBoxRef.current) || Array.isReadonlyArrayEmpty(props.options)
					? null
					: createPortal(
							<Command
								aria-label="Autocomplete suggestions"
								className="h-auto w-full border-input border-b bg-card text-foreground"
							>
								<CommandList className="max-h-48" role="listbox">
									{Array.map(props.options, (option, index) => (
										<CommandItem
											key={option.key}
											id={`typeahead-item-${index}`}
											ref={option.setRefElement}
											value={option.key}
											role="option"
											aria-selected={props.selectedIndex === index}
											className={cn('px-3', props.selectedIndex === index && 'bg-muted')}
											onMouseDown={event => event.preventDefault()}
											onMouseEnter={() => props.setHighlightedIndex(index)}
											onSelect={() => props.selectOptionAndCleanUp(option)}
										>
											<div className="flex min-w-0 items-center gap-2">{renderEntry(option.entry, children)}</div>
										</CommandItem>
									))}
								</CommandList>
							</Command>,
							menuBoxRef.current
						)
			}
		/>
	)
}

export declare namespace AutocompleteInput {
	export type Value = {
		label: string
	}

	export type Option<TValue extends Value = Value> = {
		color: string
		values: readonly TValue[]
	}

	export type Options<TValue extends Value = Value> = Record<string, Option<TValue>>

	export type Trigger = string

	export type Entry<TValue extends Value = Value> = {
		trigger: string
		value: TValue
		color: string
	}

	export type RenderEntry<TValue extends Value = Value> = Entry<TValue>

	export type Handle<TValue extends Value = Value> = {
		getText: () => string
		getEntries: () => readonly Entry<TValue>[]
		getFiles: () => readonly File[]
		clear: () => void
	}

	export type EmptyOptions = Record<never, Option<never>>

	export type Props<TValue extends Value = Value> = {
		ref?: React.Ref<Handle<TValue>>
		options?: Options<TValue>
		onSubmit?: () => void
		children?: (entry: RenderEntry<TValue>) => React.ReactNode
		placeholder?: string
		className?: string
	}
}

export function AutocompleteInput<TValue extends AutocompleteInput.Value = AutocompleteInput.Value>(
	props: AutocompleteInput.Props<TValue>
) {
	const editorRef = useRef<lexical.LexicalEditor | null>(null)
	const menuBoxRef = useRef<HTMLDivElement>(null)
	const menuRef = useRef(false)
	const entriesRef = useRef(new Map<string, AutocompleteInput.Entry<TValue>>())
	const filesRef = useRef(new Map<string, File>())

	useImperativeHandle(
		props.ref,
		() => ({
			getText() {
				if (!editorRef.current) return ''

				return editorRef.current.getEditorState().read(() => pipe(lexical.$getRoot().getTextContent(), String.trim))
			},
			getEntries() {
				return read(editorRef.current, 'entry', entriesRef.current)
			},
			getFiles() {
				return read(editorRef.current, 'file', filesRef.current)
			},
			clear() {
				if (!editorRef.current) return

				entriesRef.current.clear()
				filesRef.current.clear()
				menuRef.current = false

				editorRef.current.update(() => {
					const root = lexical.$getRoot()
					root.clear()
					root.append(lexical.$createParagraphNode())
					root.selectEnd()
				})
			}
		}),
		[]
	)

	return (
		<div className={cn('relative', props.className)}>
			<LexicalComposer
				initialConfig={{
					namespace: 'autocomplete-input',
					nodes: [TokenNode],
					theme: {},
					onError(error) {
						throw error
					}
				}}
			>
				<div className="relative flex w-full flex-col border border-input bg-input/30">
					<div ref={menuBoxRef} />

					<div className="relative max-h-90 min-h-24 overflow-y-auto">
						<PlainTextPlugin
							contentEditable={
								<ContentEditable className="wrap-break-word block min-h-24 w-full whitespace-pre-wrap px-3 py-2 text-[13px] leading-relaxed outline-none" />
							}
							placeholder={
								<div className="pointer-events-none absolute inset-x-3 top-2 select-none text-[13px] text-muted-foreground">
									{props.placeholder ?? 'Write something...'}
								</div>
							}
							ErrorBoundary={LexicalErrorBoundary}
						/>
					</div>
				</div>

				<EditorPlugin editorRef={editorRef} filesRef={filesRef} menuRef={menuRef} onSubmit={props.onSubmit} />
				<TypeaheadPlugin
					children={props.children}
					entriesRef={entriesRef}
					menuBoxRef={menuBoxRef}
					menuRef={menuRef}
					options={props.options}
				/>
			</LexicalComposer>
		</div>
	)
}
