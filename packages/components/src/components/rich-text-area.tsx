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

class TokenNode extends Lexical.TextNode {
	__id: string
	__kind: 'entry' | 'file'

	static override getType() {
		return 'input-token'
	}

	static override clone(node: TokenNode) {
		return new TokenNode(node.__text, node.__id, node.__kind, node.__key)
	}

	static override importJSON(
		node: Lexical.SerializedTextNode & {
			readonly id: string
			readonly kind: 'entry' | 'file'
			readonly type: 'input-token'
		}
	) {
		return new TokenNode(node.text, node.id, node.kind).updateFromJSON(node)
	}

	override exportJSON() {
		return {...super.exportJSON(), type: 'input-token', id: this.__id, kind: this.__kind}
	}

	constructor(text: string, id: string, kind: 'entry' | 'file', key?: Lexical.NodeKey) {
		super(text, key)
		this.__id = id
		this.__kind = kind
	}

	override isTextEntity() {
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
	readonly entry: TextAreaEntry<TValue>

	constructor(entry: TextAreaEntry<TValue>, key: string) {
		super(key)
		this.entry = entry
	}
}

function snapshot<TValue extends RichTextArea.Value>(
	editor: Lexical.LexicalEditor | undefined,
	tokensMap: Map<string, TextAreaToken<TValue>>
) {
	if (!editor) return emptySnapshot(tokensMap)

	const editorState = editor.getEditorState().toJSON()
	const ids = new Set<string>()
	const text = editor.getEditorState().read(() => {
		const tokens = Array.empty<TextAreaToken<TValue>>()
		for (const node of Lexical.$getRoot().getAllTextNodes()) {
			if (!(node instanceof TokenNode)) continue

			ids.add(node.__id)

			const value = tokensMap.get(node.__id)
			if (value) tokens.push(value)
		}

		return {text: String.trim(Lexical.$getRoot().getTextContent()), tokens}
	})

	for (const id of tokensMap.keys()) {
		if (!ids.has(id)) tokensMap.delete(id)
	}

	return {text: text.text, editorState, tokens: text.tokens}
}

function restore<TValue extends RichTextArea.Value>(
	editor: Lexical.LexicalEditor | undefined,
	snapshot: RichTextArea.Snapshot<TValue>,
	tokensMap: Map<string, TextAreaToken<TValue>>
) {
	if (!editor) return

	tokensMap.clear()

	for (const token of snapshot.tokens) tokensMap.set(token.id, token)

	editor.setEditorState(editor.parseEditorState(JSON.stringify(snapshot.editorState)))
}

function getItems<TValue extends RichTextArea.Value>(
	search: {readonly trigger: string; readonly query: string} | undefined,
	options: Record<string, {readonly color: string; readonly values: readonly TValue[]}> | undefined
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
		Array.map((value, index) => {
			return new Item(
				{trigger: search.trigger, value: value.value, color: group.color},
				`${search.trigger}:${value.value.label}:${index}`
			)
		})
	)
}

function match(text: string, triggers: readonly string[]) {
	for (const trigger of triggers) {
		const index = text.lastIndexOf(trigger)
		if (index < 0) continue

		if (index > 0 && text[index - 1] !== '(' && !/\s/.test(text[index - 1] ?? '')) continue

		const query = String.slice(index + String.length(trigger))(text)
		if (String.length(query) > 32 || /\s/.test(query)) continue

		return {
			trigger,
			query,
			leadOffset: index,
			replaceableString: String.slice(index)(text)
		}
	}
}

type TextAreaEntry<TValue extends RichTextArea.Value = RichTextArea.Value> = {
	readonly trigger: string
	readonly value: TValue
	readonly color: string
}

type TextAreaToken<TValue extends RichTextArea.Value = RichTextArea.Value> =
	| ({readonly id: string; readonly kind: 'entry'} & TextAreaEntry<TValue>)
	| {readonly id: string; readonly kind: 'file'; readonly color: string; readonly file: File}

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

function continueList(event: KeyboardEvent | undefined) {
	if (!event?.shiftKey) return false

	const current = currentTextNodeSelection()
	if (!current) return false

	const currentLine = lineBeforeCursor(current.node.getTextContent(), current.selection.anchor.offset)
	if (/^(\s*)[-*+]\s*$/.exec(currentLine.line) || /^(\s*)\d+\.\s*$/.exec(currentLine.line)) {
		event.preventDefault()
		current.node.spliceText(currentLine.start, String.length(currentLine.line), '', true)
		return true
	}

	const unordered = /^(\s*)([-*+])\s+\S/.exec(currentLine.line)
	const ordered = /^(\s*)(\d+)\.\s+\S/.exec(currentLine.line)
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

	const currentLine = lineBeforeCursor(current.node.getTextContent(), current.selection.anchor.offset)
	const tag = /<([A-Za-z][A-Za-z0-9:_-]*)$/.exec(currentLine.line)
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
	readonly editorRef: {current: Lexical.LexicalEditor | null}
	readonly tokensRef: {current: Map<string, TextAreaToken<TValue>>}
	readonly initialSnapshot?: RichTextArea.Snapshot<TValue>
	readonly menuRef: {current: boolean}
	readonly onSubmit?: (snapshot: RichTextArea.Snapshot<TValue>) => void
}) {
	const [editor] = useLexicalComposerContext()
	const initializedRef = useRef(false)

	useEffect(() => {
		props.editorRef.current = editor

		return () => {
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
				if (continueList(event ?? undefined)) return true
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
	readonly children?: (entry: TextAreaEntry<TValue>) => React.ReactNode
	readonly menuBoxRef: React.RefObject<HTMLDivElement | null>
	readonly menuRef: {current: boolean}
	readonly tokensRef: {current: Map<string, TextAreaToken<TValue>>}
	readonly options?: Record<string, {readonly color: string; readonly values: readonly TValue[]}>
}) {
	const [search, setSearch] = useState<{readonly trigger: string; readonly query: string} | undefined>()

	return (
		<LexicalTypeaheadMenuPlugin<Item<TValue>>
			onQueryChange={() => {}}
			onOpen={() => {
				props.menuRef.current = true
			}}
			onClose={() => {
				props.menuRef.current = false
			}}
			triggerFn={text => {
				const next = match(
					text,
					pipe(
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
				)

				setSearch(current => {
					const value = next ? {trigger: next.trigger, query: next.query} : undefined
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

				if (node) node.replace(token)

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
			menuRenderFn={(anchorRef, menuProps) => {
				if (!(anchorRef.current && props.menuBoxRef.current) || Array.isReadonlyArrayEmpty(menuProps.options)) {
					return null
				}
				return createPortal(
					<Command
						aria-label="Autocomplete suggestions"
						className="border-input bg-card text-foreground h-auto w-full border-b"
					>
						<CommandList className="max-h-48" role="listbox">
							{Array.map(menuProps.options, (option, index) => (
								<CommandItem
									tabIndex={0}
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
			}}
		/>
	)
}

export declare namespace RichTextArea {
	export type Value = {
		readonly label: string
	}

	export type Handle<TValue extends Value = Value> = {
		readonly getSnapshot: () => Snapshot<TValue>
		readonly restore: (snapshot: Snapshot<TValue>) => void
		readonly clear: () => void
		readonly focus: () => void
	}

	export type Snapshot<TValue extends Value = Value> = {
		readonly text: string
		readonly editorState: Lexical.SerializedEditorState
		readonly tokens: readonly TextAreaToken<TValue>[]
	}

	export type Props<TValue extends Value = Value> = {
		readonly ref?: React.Ref<Handle<TValue>>
		readonly options?: Record<string, {readonly color: string; readonly values: readonly TValue[]}>
		readonly onSubmit?: (snapshot: Snapshot<TValue>) => void
		readonly initialSnapshot?: Snapshot<TValue>
		readonly children?: (entry: TextAreaEntry<TValue>) => React.ReactNode
		readonly placeholder?: string
		readonly className?: string
	}
}

function emptySnapshot<TValue extends RichTextArea.Value = RichTextArea.Value>(
	_tokensMap?: Map<string, TextAreaToken<TValue>>
) {
	const editorState = JSON.parse(
		'{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}'
	)

	return {
		text: '',
		editorState,
		tokens: Array.empty<TextAreaToken<TValue>>()
	}
}

export function RichTextArea<TValue extends RichTextArea.Value = RichTextArea.Value>(
	props: RichTextArea.Props<TValue>
) {
	const editorRef = useRef<Lexical.LexicalEditor | null>(null)
	const menuBoxRef = useRef<HTMLDivElement>(null)
	const menuRef = useRef(false)
	const tokensRef = useRef(new Map<string, TextAreaToken<TValue>>())

	useImperativeHandle(
		props.ref,
		() => ({
			getSnapshot() {
				return snapshot(editorRef.current ?? undefined, tokensRef.current)
			},
			restore(nextSnapshot) {
				restore(editorRef.current ?? undefined, nextSnapshot, tokensRef.current)
			},
			clear() {
				if (!editorRef.current) return
				menuRef.current = false
				restore(editorRef.current, emptySnapshot(tokensRef.current), tokensRef.current)
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
				<div className="border-input bg-input/30 relative flex w-full flex-col border">
					<div ref={menuBoxRef} className="absolute inset-x-0 bottom-full z-50" />

					<div className="relative max-h-90 min-h-24 overflow-y-auto">
						<PlainTextPlugin
							contentEditable={
								<ContentEditable className="block min-h-24 w-full p-2 text-[13px] leading-relaxed wrap-break-word whitespace-pre-wrap outline-none" />
							}
							placeholder={
								<div className="text-muted-foreground pointer-events-none absolute inset-x-2 top-2 text-[13px] select-none">
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

RichTextArea.Actions = (props: {readonly children: React.ReactNode; readonly className?: string}) => {
	return (
		<div
			className={cn(
				'border-input bg-card absolute inset-x-0 bottom-full z-40 border border-b-0 shadow-lg',
				props.className
			)}
		>
			{props.children}
		</div>
	)
}

RichTextArea.ToolBar = (props: {readonly children: React.ReactNode; readonly className?: string}) => {
	return (
		<div
			className={cn(
				'border-input bg-input/30 flex w-full flex-row items-center justify-between border border-t-0 p-2',
				props.className
			)}
		>
			{props.children}
		</div>
	)
}
