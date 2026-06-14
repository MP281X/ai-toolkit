import {Array, Number, Option, Order, Predicate, Record, String, pipe} from 'effect'

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

interface TextAreaEntry<TValue extends RichTextArea.Value = RichTextArea.Value> {
	readonly trigger: string
	readonly value: TValue
	readonly color: string
}

interface TextAreaEntryToken<TValue extends RichTextArea.Value = RichTextArea.Value> extends TextAreaEntry<TValue> {
	readonly id: string
	readonly kind: 'entry'
}

interface TextAreaFileToken {
	readonly id: string
	readonly kind: 'file'
	readonly color: string
	readonly file: File
}

class TokenNode extends Lexical.TextNode {
	public __id: string
	public __kind: 'entry' | 'file'

	public static override getType() {
		return 'input-token'
	}

	public static override clone(node: TokenNode) {
		return new TokenNode(node.__text, node.__id, node.__kind, node.__key)
	}

	public static override importJSON(
		node: Readonly<
			Lexical.SerializedTextNode & {readonly id: string; readonly kind: 'entry' | 'file'; readonly type: 'input-token'}
		>
	) {
		return new TokenNode(node.text, node.id, node.kind).updateFromJSON(node)
	}

	public override exportJSON() {
		return {...super.exportJSON(), id: this.__id, kind: this.__kind, type: 'input-token'}
	}

	public constructor(text: string, id: string, kind: 'entry' | 'file', key?: Lexical.NodeKey) {
		super(text, key)
		this.__id = id
		this.__kind = kind
	}

	public override isTextEntity() {
		return true
	}

	public override canInsertTextBefore() {
		return false
	}

	public override canInsertTextAfter() {
		return false
	}
}

class Item<TValue extends RichTextArea.Value> extends MenuOption {
	public readonly entry: TextAreaEntry<TValue>

	public constructor(entry: TextAreaEntry<TValue>, key: string) {
		super(key)
		this.entry = entry
	}
}

function emptySnapshot<TValue extends RichTextArea.Value = RichTextArea.Value>() {
	return {
		editorState: {
			root: {
				children: [{children: [], direction: null, format: '', indent: 0, type: 'paragraph', version: 1}],
				direction: null,
				format: '',
				indent: 0,
				type: 'root',
				version: 1
			}
		} satisfies Lexical.SerializedEditorState<Lexical.SerializedRootNode>,
		text: '',
		tokens: Array.empty<TextAreaEntryToken<TValue> | TextAreaFileToken>()
	}
}

function editorSnapshot<TValue extends RichTextArea.Value>(
	editor: Lexical.LexicalEditor | undefined,
	tokensMap: Map<string, TextAreaEntryToken<TValue> | TextAreaFileToken>
) {
	if (!editor) return emptySnapshot<TValue>()

	const editorState = editor.getEditorState().toJSON()
	const ids = new Set<string>()
	const text = editor.getEditorState().read(() => {
		const tokens = Array.empty<TextAreaEntryToken<TValue> | TextAreaFileToken>()
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

	return {editorState, text: text.text, tokens: text.tokens}
}

function restore<TValue extends RichTextArea.Value>(
	editor: Lexical.LexicalEditor | undefined,
	snapshot: Readonly<RichTextArea.Snapshot<TValue>>,
	tokensMap: Map<string, TextAreaEntryToken<TValue> | TextAreaFileToken>
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
	if (!options) return Array.empty<Item<TValue>>()

	const noMatchScore = -1_000_000

	return Option.match(Record.get(options, search.trigger), {
		onNone: () => Array.empty<Item<TValue>>(),
		onSome: group =>
			pipe(
				group.values,
				Array.map(value => {
					const query = String.toLowerCase(search.query)
					if (String.isEmpty(query)) return {score: 0, value}

					const label = String.toLowerCase(value.label)
					const score = Array.reduce(
						String.isEmpty(label) ? Array.empty<number>() : Array.range(0, String.length(label) - 1),
						{lastMatchIndex: -1, queryIndex: 0, total: 0},
						(current, index) => {
							if (current.queryIndex >= String.length(query)) return current
							if (label[index] !== query[current.queryIndex]) return current

							const boundaryBonus =
								index === 0 || label[index - 1] === '/' || label[index - 1] === '-' || label[index - 1] === '_' ? 4 : 0
							return {
								lastMatchIndex: index,
								queryIndex: current.queryIndex + 1,
								total: current.total + (current.lastMatchIndex === index - 1 ? 8 : 1) + boundaryBonus
							}
						}
					)

					return {
						score: score.queryIndex === String.length(query) ? score.total - String.length(label) / 1000 : noMatchScore,
						value
					}
				}),
				Array.filter(candidate => candidate.score > noMatchScore),
				Array.sortWith(candidate => -candidate.score, Order.Number),
				Array.take(10),
				Array.map(
					(value, index) =>
						new Item(
							{color: group.color, trigger: search.trigger, value: value.value},
							`${search.trigger}:${value.value.label}:${index}`
						)
				)
			)
	})
}

function match(text: string, triggers: readonly string[]) {
	for (const trigger of triggers) {
		const index = text.lastIndexOf(trigger)
		if (index === -1) continue

		if (index > 0 && text[index - 1] !== '(' && !/\s/u.test(text[index - 1] ?? '')) continue

		const query = String.slice(index + String.length(trigger))(text)
		if (String.length(query) > 32 || /\s/u.test(query)) continue

		return {leadOffset: index, query, replaceableString: String.slice(index)(text), trigger}
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

function pasteSelection() {
	const selection = Lexical.$getSelection()
	if (Lexical.$isRangeSelection(selection)) return selection
	Lexical.$getRoot().selectEnd()
	const nextSelection = Lexical.$getSelection()
	if (Lexical.$isRangeSelection(nextSelection)) return nextSelection
}

function lineBeforeCursor(text: string, offset: number) {
	const before = String.slice(0, offset)(text)
	const index = before.lastIndexOf('\n')

	return {line: String.slice(index + 1)(before), start: index + 1}
}

function continueList(event: KeyboardEvent | undefined) {
	if (event?.shiftKey !== true) return false

	const current = currentTextNodeSelection()
	if (!current) return false

	const currentLine = lineBeforeCursor(current.node.getTextContent(), current.selection.anchor.offset)
	if (/^(\s*)[-*+]\s*$/u.exec(currentLine.line) || /^(\s*)\d+\.\s*$/u.exec(currentLine.line)) {
		event.preventDefault()
		current.node.spliceText(currentLine.start, String.length(currentLine.line), '', true)
		return true
	}

	const unordered = /^(\s*)([-*+])\s+\S/u.exec(currentLine.line)
	const ordered = /^(\s*)(\d+)\.\s+\S/u.exec(currentLine.line)
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
	const tag = /<([A-Za-z][A-Za-z0-9:_-]*)$/u.exec(currentLine.line)
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
	readonly tokensRef: {current: Map<string, TextAreaEntryToken<TValue> | TextAreaFileToken>}
	readonly initialSnapshot?: Readonly<RichTextArea.Snapshot<TValue>>
	readonly menuRef: {current: boolean}
	readonly onSubmit?: (snapshot: Readonly<RichTextArea.Snapshot<TValue>>) => void
}) {
	const [editor] = useLexicalComposerContext()
	const initializedRef = useRef(false)

	useEffect(() => {
		Reflect.set(props.editorRef, 'current', editor)

		return () => {
			Reflect.set(props.editorRef, 'current', null)
		}
	}, [editor, props.editorRef])

	useEffect(() => {
		if (initializedRef.current) return
		initializedRef.current = true

		if (Predicate.isNotUndefined(props.initialSnapshot)) restore(editor, props.initialSnapshot, props.tokensRef.current)
	}, [editor, props.initialSnapshot, props.tokensRef])

	useEffect(
		() =>
			editor.registerCommand(
				Lexical.KEY_ENTER_COMMAND,
				event => {
					if (continueList(event ?? undefined)) return true
					if (event?.shiftKey === true || props.menuRef.current || Predicate.isUndefined(props.onSubmit)) return false

					event?.preventDefault()
					props.onSubmit(editorSnapshot(editor, props.tokensRef.current))
					return true
				},
				Lexical.COMMAND_PRIORITY_LOW
			),
		[editor, props, props.menuRef, props.onSubmit, props.tokensRef]
	)

	useEffect(
		() => editor.registerCommand(Lexical.KEY_DOWN_COMMAND, closeXmlTag, Lexical.COMMAND_PRIORITY_HIGH),
		[editor]
	)

	useEffect(
		() =>
			editor.registerCommand(
				Lexical.PASTE_COMMAND,
				event => {
					const files =
						event instanceof ClipboardEvent ? Array.fromIterable(event.clipboardData?.files ?? []) : Array.empty<File>()
					if (Array.isReadonlyArrayEmpty(files)) return false

					event.preventDefault()

					editor.update(() => {
						const selection = pasteSelection()
						if (Predicate.isUndefined(selection)) return

						for (const file of files) {
							const id = crypto.randomUUID()
							props.tokensRef.current.set(id, {color: '#f59e0b', file, id, kind: 'file'})

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
			),
		[editor, props.tokensRef]
	)

	return <HistoryPlugin />
}

function TypeaheadPlugin<TValue extends RichTextArea.Value>(props: {
	readonly children?: (entry: TextAreaEntry<TValue>) => React.ReactNode
	readonly menuBoxRef: React.RefObject<HTMLDivElement | null>
	readonly menuRef: {current: boolean}
	readonly tokensRef: {current: Map<string, TextAreaEntryToken<TValue> | TextAreaFileToken>}
	readonly options?: Record<string, {readonly color: string; readonly values: readonly TValue[]}>
}) {
	const [search, setSearch] = useState<{readonly trigger: string; readonly query: string} | undefined>()

	return (
		<LexicalTypeaheadMenuPlugin<Item<TValue>>
			onQueryChange={() => {}}
			onOpen={() => {
				// oxlint-disable-next-line no-param-reassign
				props.menuRef.current = true
			}}
			onClose={() => {
				// oxlint-disable-next-line no-param-reassign
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
					const value = next ? {query: next.query, trigger: next.trigger} : undefined
					if (current?.trigger === value?.trigger && current?.query === value?.query) return current
					return value
				})

				return next
					? {leadOffset: next.leadOffset, matchingString: next.query, replaceableString: next.replaceableString}
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

				// oxlint-disable-next-line deslop/no-prototype-effect-equivalent -- LexicalNode.replace inserts the token into the editor tree.
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
						<CommandList className="max-h-48">
							{Array.map(menuProps.options, (option, index) => (
								<CommandItem
									tabIndex={0}
									key={option.key}
									id={`typeahead-item-${index}`}
									ref={element => {
										option.setRefElement(element)
									}}
									value={option.key}
									aria-selected={menuProps.selectedIndex === index}
									className={cn('px-3', menuProps.selectedIndex === index && 'bg-muted')}
									onMouseDown={event => {
										event.preventDefault()
									}}
									onMouseEnter={() => {
										menuProps.setHighlightedIndex(index)
									}}
									onSelect={() => {
										menuProps.selectOptionAndCleanUp(option)
									}}
								>
									<div className="flex min-w-0 items-center gap-2">
										{props.children ? (
											props.children(option.entry)
										) : (
											<>
												<span style={{color: option.entry.color}}>{option.entry.trigger}</span>
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
	export type Value = {readonly label: string}

	export type Handle<TValue extends Value = Value> = {
		readonly getSnapshot: () => Snapshot<TValue>
		readonly restore: (snapshot: Readonly<Snapshot<TValue>>) => void
		readonly clear: () => void
		readonly focus: () => void
	}

	export type Snapshot<TValue extends Value = Value> = {
		readonly text: string
		readonly editorState: Lexical.SerializedEditorState
		readonly tokens: readonly (TextAreaEntryToken<TValue> | TextAreaFileToken)[]
	}

	export type Props<TValue extends Value = Value> = {
		readonly ref?: React.Ref<Handle<TValue>>
		readonly options?: Record<string, {readonly color: string; readonly values: readonly TValue[]}>
		readonly onSubmit?: (snapshot: Readonly<Snapshot<TValue>>) => void
		readonly initialSnapshot?: Readonly<Snapshot<TValue>>
		readonly children?: (entry: TextAreaEntry<TValue>) => React.ReactNode
		readonly placeholder?: string
		readonly className?: string
	}
}

export function RichTextArea<TValue extends RichTextArea.Value = RichTextArea.Value>(
	props: RichTextArea.Props<TValue>
) {
	const editorRef = useRef<Lexical.LexicalEditor | null>(null)
	const menuBoxRef = useRef<HTMLDivElement>(null)
	const menuRef = useRef(false)
	const tokensRef = useRef(new Map<string, TextAreaEntryToken<TValue> | TextAreaFileToken>())

	useImperativeHandle(
		props.ref,
		() => ({
			clear() {
				if (!editorRef.current) return
				menuRef.current = false
				restore(editorRef.current, emptySnapshot<TValue>(), tokensRef.current)
			},
			focus() {
				editorRef.current?.focus()
			},
			getSnapshot() {
				return editorSnapshot(editorRef.current ?? undefined, tokensRef.current)
			},
			restore(nextSnapshot) {
				restore(editorRef.current ?? undefined, nextSnapshot, tokensRef.current)
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
					onError(error) {
						throw error
					},
					theme: {}
				}}
			>
				<div className="border-input bg-input/30 relative flex w-full flex-col border">
					<div ref={menuBoxRef} className="absolute inset-x-0 bottom-full z-50" />

					<div className="relative max-h-90 min-h-24 overflow-y-auto">
						<PlainTextPlugin
							contentEditable={
								<ContentEditable className="block min-h-24 w-full p-2 wrap-break-word whitespace-pre-wrap outline-none" />
							}
							placeholder={
								<div className="text-muted-foreground pointer-events-none absolute inset-x-2 top-2 select-none">
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
				<TypeaheadPlugin menuBoxRef={menuBoxRef} menuRef={menuRef} options={props.options} tokensRef={tokensRef}>
					{props.children}
				</TypeaheadPlugin>
			</LexicalComposer>
		</div>
	)
}

RichTextArea.Actions = (props: {readonly children: React.ReactNode; readonly className?: string}) => (
	<div
		className={cn(
			'border-input bg-card absolute inset-x-0 bottom-full z-40 border border-b-0 shadow-lg',
			props.className
		)}
	>
		{props.children}
	</div>
)

RichTextArea.ToolBar = (props: {readonly children: React.ReactNode; readonly className?: string}) => (
	<div
		className={cn(
			'border-input bg-input/30 flex w-full flex-row items-center justify-between border border-t-0 p-2',
			props.className
		)}
	>
		{props.children}
	</div>
)
