import {Array, Number, Option, Order, pipe, Record, String} from 'effect'

import {LexicalComposer} from '@lexical/react/LexicalComposer'
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import {ContentEditable} from '@lexical/react/LexicalContentEditable'
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary'
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin'
import {PlainTextPlugin} from '@lexical/react/LexicalPlainTextPlugin'
import {LexicalTypeaheadMenuPlugin, MenuOption} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import * as Lexical from 'lexical'
import {useEffect, useImperativeHandle, useRef, useState} from 'react'
import {createPortal} from 'react-dom'

import {Command, CommandItem, CommandList} from '#components/ui/command.tsx'
import {cn} from '#lib/utils.ts'

type SerializedTokenNode = Lexical.SerializedTextNode & {
	id: string
	kind: 'entry' | 'file'
	type: 'input-token'
}

class TokenNode extends Lexical.TextNode {
	__id: string
	__kind: 'entry' | 'file'

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

	constructor(text: string, id: string, kind: 'entry' | 'file', key?: Lexical.NodeKey) {
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

class Item<TValue extends RichTextArea.Value> extends MenuOption {
	readonly entry: RichTextArea.Entry<TValue>

	constructor(entry: RichTextArea.Entry<TValue>, key: string) {
		super(key)
		this.entry = entry
	}
}

function snapshot<TValue extends RichTextArea.Value>(
	editor: Lexical.LexicalEditor | null,
	tokensMap: Map<string, RichTextArea.Token<TValue>>
) {
	if (!editor) return emptySnapshot<TValue>()

	const editorState = editor.getEditorState().toJSON()
	const ids = new Set<string>()
	const tokens = Array.empty<RichTextArea.Token<TValue>>()
	const text = editor.getEditorState().read(() => {
		for (const node of Lexical.$getRoot().getAllTextNodes()) {
			if (!(node instanceof TokenNode)) continue

			ids.add(node.__id)

			const value = tokensMap.get(node.__id)
			if (value) tokens.push(value)
		}

		return String.trim(Lexical.$getRoot().getTextContent())
	})

	for (const id of tokensMap.keys()) {
		if (!ids.has(id)) tokensMap.delete(id)
	}

	return {text, editorState, tokens}
}

function restore<TValue extends RichTextArea.Value>(
	editor: Lexical.LexicalEditor | null,
	snapshot: RichTextArea.Snapshot<TValue>,
	tokensMap: Map<string, RichTextArea.Token<TValue>>
) {
	if (!editor) return

	tokensMap.clear()

	for (const token of snapshot.tokens) tokensMap.set(token.id, token)

	editor.setEditorState(editor.parseEditorState(JSON.stringify(snapshot.editorState)))
}

function getItems<TValue extends RichTextArea.Value>(
	search: null | {trigger: string; query: string},
	options: RichTextArea.Options<TValue> | undefined
) {
	if (!search) return Array.empty<Item<TValue>>()

	const group = options?.[search.trigger]
	if (!group) return Array.empty<Item<TValue>>()

	const noMatchScore = -1_000_000

	return pipe(
		group.values,
		Array.map(value => {
			const query = String.toLowerCase(search.query)
			if (String.isEmpty(query)) return {score: 0, value}

			let total = 0
			let queryIndex = 0
			let lastMatchIndex = -1
			const label = String.toLowerCase(value.label)

			for (let index = 0; index < String.length(label) && queryIndex < String.length(query); index++) {
				if (label[index] !== query[queryIndex]) continue

				total += lastMatchIndex === index - 1 ? 8 : 1
				if (index === 0 || label[index - 1] === '/' || label[index - 1] === '-' || label[index - 1] === '_') total += 4
				lastMatchIndex = index
				queryIndex++
			}

			return {
				score: queryIndex === String.length(query) ? total - String.length(label) / 1000 : noMatchScore,
				value
			}
		}),
		Array.filter(candidate => candidate.score > noMatchScore),
		Array.sortWith(candidate => -candidate.score, Order.Number),
		Array.take(10),
		Array.map(
			(value, index) =>
				new Item(
					{trigger: search.trigger, value: value.value, color: group.color},
					`${search.trigger}:${value.value.label}:${index}`
				)
		)
	)
}

function match<const TTrigger extends string>(text: string, triggers: readonly TTrigger[]) {
	for (const trigger of triggers) {
		const index = text.lastIndexOf(trigger)
		if (index < 0) continue

		if (index > 0 && text[index - 1] !== '(' && !RegExp('\\s').test(text[index - 1] ?? '')) continue

		const query = String.slice(index + String.length(trigger))(text)
		if (String.length(query) > 32 || RegExp('\\s').test(query)) continue

		return {
			trigger,
			query,
			leadOffset: index,
			replaceableString: String.slice(index)(text)
		}
	}
}

function currentTextNodeSelection() {
	const selection = Lexical.$getSelection()
	if (!Lexical.$isRangeSelection(selection)) return
	if (!selection.isCollapsed()) return

	const node = selection.anchor.getNode()
	if (!Lexical.$isTextNode(node)) return

	return {node, selection}
}

function lineBeforeCursor(text: string, offset: number) {
	const before = String.slice(0, offset)(text)
	const index = before.lastIndexOf('\n')

	return {
		line: String.slice(index + 1)(before),
		start: index + 1
	}
}

function continueList(event: KeyboardEvent | null) {
	if (!event?.shiftKey) return false

	const current = currentTextNodeSelection()
	if (!current) return false

	const text = current.node.getTextContent()
	const currentLine = lineBeforeCursor(text, current.selection.anchor.offset)
	if (RegExp('^(\\s*)[-*+]\\s*$').exec(currentLine.line) || RegExp('^(\\s*)\\d+\\.\\s*$').exec(currentLine.line)) {
		event.preventDefault()
		current.node.spliceText(currentLine.start, String.length(currentLine.line), '', true)
		return true
	}

	const unordered = RegExp('^(\\s*)([-*+])\\s+\\S').exec(currentLine.line)
	const ordered = RegExp('^(\\s*)(\\d+)\\.\\s+\\S').exec(currentLine.line)
	if (!(unordered || ordered)) return false

	event.preventDefault()
	if (unordered) current.selection.insertRawText(`\n${unordered[1]}${unordered[2]} `)
	if (ordered) {
		current.selection.insertRawText(`\n${ordered[1] ?? ''}${Option.getOrThrow(Number.parse(ordered[2] ?? '0')) + 1}. `)
	}
	return true
}

function closeXmlTag(event: KeyboardEvent) {
	if (event.key !== '>' || event.metaKey || event.ctrlKey || event.altKey) return false

	const current = currentTextNodeSelection()
	if (!current) return false

	const text = current.node.getTextContent()
	const currentLine = lineBeforeCursor(text, current.selection.anchor.offset)
	const tag = RegExp('<([A-Za-z][A-Za-z0-9:_-]*)$').exec(currentLine.line)
	if (!tag) return false

	event.preventDefault()
	current.node.spliceText(current.selection.anchor.offset, 0, `></${tag[1]}>`, true)
	current.selection.setTextNodeRange(
		current.node,
		current.selection.anchor.offset - String.length(`</${tag[1]}>`),
		current.node,
		current.selection.anchor.offset - String.length(`</${tag[1]}>`)
	)
	return true
}

function EditorPlugin<TValue extends RichTextArea.Value>(props: {
	editorRef: {current: Lexical.LexicalEditor | null}
	tokensRef: {current: Map<string, RichTextArea.Token<TValue>>}
	initialSnapshot?: RichTextArea.Snapshot<TValue>
	menuRef: {current: boolean}
	onSubmit?: (snapshot: RichTextArea.Snapshot<TValue>) => void
}) {
	const [editor] = useLexicalComposerContext()
	const initializedRef = useRef(false)

	useEffect(() => {
		// biome-ignore lint/style/noParameterAssign: refs are the mutable handoff API here
		props.editorRef.current = editor

		return () => {
			// biome-ignore lint/style/noParameterAssign: refs are the mutable handoff API here
			props.editorRef.current = null
		}
	}, [editor, props.editorRef])

	useEffect(() => {
		if (initializedRef.current) return
		initializedRef.current = true

		if (props.initialSnapshot) restore(editor, props.initialSnapshot, props.tokensRef.current)
	}, [editor, props.initialSnapshot, props.tokensRef])

	useEffect(() => {
		return editor.registerCommand(
			Lexical.KEY_ENTER_COMMAND,
			event => {
				if (continueList(event)) return true
				if (event?.shiftKey || props.menuRef.current || !props.onSubmit) return false

				event?.preventDefault()
				props.onSubmit(snapshot(editor, props.tokensRef.current))
				return true
			},
			Lexical.COMMAND_PRIORITY_LOW
		)
	}, [editor, props.menuRef, props.onSubmit, props.tokensRef])

	useEffect(() => {
		return editor.registerCommand(Lexical.KEY_DOWN_COMMAND, closeXmlTag, Lexical.COMMAND_PRIORITY_HIGH)
	}, [editor])

	useEffect(() => {
		return editor.registerCommand(
			Lexical.PASTE_COMMAND,
			event => {
				const files =
					event instanceof ClipboardEvent ? Array.fromIterable(event.clipboardData?.files ?? []) : Array.empty<File>()
				if (Array.isReadonlyArrayEmpty(files)) return false

				event.preventDefault()

				editor.update(() => {
					let selection = Lexical.$getSelection()

					if (!Lexical.$isRangeSelection(selection)) {
						Lexical.$getRoot().selectEnd()
						selection = Lexical.$getSelection()
						if (!Lexical.$isRangeSelection(selection)) return
					}

					for (const file of files) {
						const id = crypto.randomUUID()
						props.tokensRef.current.set(id, {id, kind: 'file', color: '#f59e0b', file})

						selection.insertNodes([
							Lexical.$applyNodeReplacement(new TokenNode(file.name, id, 'file'))
								.setMode('token')
								.setStyle('color: #f59e0b'),
							Lexical.$createTextNode(' ')
						])
					}
				})

				return true
			},
			Lexical.COMMAND_PRIORITY_HIGH
		)
	}, [editor, props.tokensRef])

	return <HistoryPlugin />
}

function TypeaheadPlugin<TValue extends RichTextArea.Value>(props: {
	children?: (entry: RichTextArea.Entry<TValue>) => React.ReactNode
	menuBoxRef: React.RefObject<HTMLDivElement | null>
	menuRef: {current: boolean}
	tokensRef: {current: Map<string, RichTextArea.Token<TValue>>}
	options?: RichTextArea.Options<TValue>
}) {
	const [search, setSearch] = useState<null | {trigger: string; query: string}>(null)

	const triggers = pipe(
		props.options ?? {},
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

	return (
		<LexicalTypeaheadMenuPlugin<Item<TValue>>
			onQueryChange={() => {}}
			onOpen={() => {
				// biome-ignore lint/style/noParameterAssign: refs are the mutable handoff API here
				props.menuRef.current = true
			}}
			onClose={() => {
				// biome-ignore lint/style/noParameterAssign: refs are the mutable handoff API here
				props.menuRef.current = false
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
				props.tokensRef.current.set(id, {id, kind: 'entry', ...option.entry})

				const token = Lexical.$applyNodeReplacement(
					new TokenNode(`${option.entry.trigger}${option.entry.value.label}`, id, 'entry')
				)
					.setMode('token')
					.setStyle(`color: ${option.entry.color}`)

				if (node) {
					node.replace(token)
				}

				if (!node) {
					const selection = Lexical.$getSelection()
					if (!Lexical.$isRangeSelection(selection)) return
					selection.insertNodes([token])
				}

				const gap = Lexical.$createTextNode(' ')
				token.insertAfter(gap)
				gap.selectEnd()
				close()
			}}
			options={getItems(search, props.options)}
			anchorClassName="z-50"
			menuRenderFn={(anchorRef, menuProps) =>
				!(anchorRef.current && props.menuBoxRef.current) || Array.isReadonlyArrayEmpty(menuProps.options)
					? null
					: createPortal(
							<Command
								aria-label="Autocomplete suggestions"
								className="h-auto w-full border-input border-b bg-card text-foreground"
							>
								<CommandList className="max-h-48" role="listbox">
									{Array.map(menuProps.options, (option, index) => (
										<CommandItem
											key={option.key}
											id={`typeahead-item-${index}`}
											ref={option.setRefElement}
											value={option.key}
											role="option"
											aria-selected={menuProps.selectedIndex === index}
											className={cn('px-3', menuProps.selectedIndex === index && 'bg-muted')}
											onMouseDown={event => event.preventDefault()}
											onMouseEnter={() => menuProps.setHighlightedIndex(index)}
											onSelect={() => menuProps.selectOptionAndCleanUp(option)}
										>
											<div className="flex min-w-0 items-center gap-2">
												{props.children ? (
													props.children(option.entry)
												) : (
													<>
														<span className="font-medium" style={{color: option.entry.color}}>
															{option.entry.trigger}
														</span>
														<span className="text-foreground">{option.entry.value.label}</span>
													</>
												)}
											</div>
										</CommandItem>
									))}
								</CommandList>
							</Command>,
							props.menuBoxRef.current
						)
			}
		/>
	)
}

export declare namespace RichTextArea {
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

	export type Token<TValue extends Value = Value> =
		| ({id: string; kind: 'entry'} & Entry<TValue>)
		| {id: string; kind: 'file'; color: string; file: File}

	export type Handle<TValue extends Value = Value> = {
		getSnapshot: () => Snapshot<TValue>
		restore: (snapshot: Snapshot<TValue>) => void
		clear: () => void
		focus: () => void
	}

	export type Snapshot<TValue extends Value = Value> = {
		text: string
		editorState: Lexical.SerializedEditorState<Lexical.SerializedLexicalNode>
		tokens: readonly Token<TValue>[]
	}

	export type EmptyOptions = Record<never, Option<never>>

	export type Props<TValue extends Value = Value> = {
		ref?: React.Ref<Handle<TValue>>
		options?: Options<TValue>
		onSubmit?: (snapshot: Snapshot<TValue>) => void
		initialSnapshot?: Snapshot<TValue>
		children?: (entry: RenderEntry<TValue>) => React.ReactNode
		placeholder?: string
		className?: string
	}
}

function emptySnapshot<TValue extends RichTextArea.Value = RichTextArea.Value>(): RichTextArea.Snapshot<TValue> {
	const editorState = JSON.parse(
		'{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}'
	)

	return {
		text: '',
		editorState,
		tokens: Array.empty<RichTextArea.Token<TValue>>()
	}
}

export function RichTextArea<TValue extends RichTextArea.Value = RichTextArea.Value>(
	props: RichTextArea.Props<TValue>
) {
	const editorRef = useRef<Lexical.LexicalEditor | null>(null)
	const menuBoxRef = useRef<HTMLDivElement>(null)
	const menuRef = useRef(false)
	const tokensRef = useRef(new Map<string, RichTextArea.Token<TValue>>())

	useImperativeHandle(
		props.ref,
		() => ({
			getSnapshot() {
				return snapshot(editorRef.current, tokensRef.current)
			},
			restore(nextSnapshot) {
				restore(editorRef.current, nextSnapshot, tokensRef.current)
			},
			clear() {
				if (!editorRef.current) return
				menuRef.current = false
				restore(editorRef.current, emptySnapshot<TValue>(), tokensRef.current)
			},
			focus() {
				editorRef.current?.focus()
			}
		}),
		[]
	)

	return (
		<div className={cn('relative', props.className)}>
			<LexicalComposer
				initialConfig={{
					namespace: 'rich-text-area',
					nodes: [TokenNode],
					theme: {},
					onError(error) {
						throw error
					}
				}}
			>
				<div className="relative flex w-full flex-col border border-input bg-input/30">
					<div ref={menuBoxRef} className="absolute inset-x-0 bottom-full z-50" />

					<div className="relative max-h-90 min-h-24 overflow-y-auto">
						<PlainTextPlugin
							contentEditable={
								<ContentEditable className="wrap-break-word block min-h-24 w-full whitespace-pre-wrap p-2 text-[13px] leading-relaxed outline-none" />
							}
							placeholder={
								<div className="pointer-events-none absolute inset-x-2 top-2 select-none text-[13px] text-muted-foreground">
									{props.placeholder ?? 'Write something...'}
								</div>
							}
							ErrorBoundary={LexicalErrorBoundary}
						/>
					</div>
				</div>

				<EditorPlugin
					editorRef={editorRef}
					initialSnapshot={props.initialSnapshot}
					menuRef={menuRef}
					onSubmit={props.onSubmit}
					tokensRef={tokensRef}
				/>
				<TypeaheadPlugin
					children={props.children}
					menuBoxRef={menuBoxRef}
					menuRef={menuRef}
					options={props.options}
					tokensRef={tokensRef}
				/>
			</LexicalComposer>
		</div>
	)
}

RichTextArea.Actions = (props: {children: React.ReactNode; className?: string}) => {
	return (
		<div
			className={cn(
				'absolute inset-x-0 bottom-full z-40 border border-input border-b-0 bg-card shadow-lg',
				props.className
			)}
		>
			{props.children}
		</div>
	)
}

RichTextArea.ToolBar = (props: {children: React.ReactNode; className?: string}) => {
	return (
		<div
			className={cn(
				'flex w-full flex-row items-center justify-between border border-input border-t-0 bg-input/30 p-2',
				props.className
			)}
		>
			{props.children}
		</div>
	)
}
