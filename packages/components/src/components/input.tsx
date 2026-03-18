import {Array, Order, Predicate, pipe, Record, String} from 'effect'

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

import {cn} from '#lib/utils.ts'

class AutocompleteTokenNode extends lexical.TextNode {
	__id: string

	static override getType() {
		return 'autocomplete-token'
	}

	static override clone(node: AutocompleteTokenNode) {
		return new AutocompleteTokenNode(node.__text, node.__id, node.__key)
	}

	static override importJSON(serializedNode: lexical.SerializedTextNode & {id: string}) {
		return new AutocompleteTokenNode(serializedNode.text, serializedNode.id)
			.setStyle(serializedNode.style)
			.setFormat(serializedNode.format)
			.setDetail(serializedNode.detail)
			.setMode(serializedNode.mode)
	}

	override exportJSON() {
		return {
			...super.exportJSON(),
			type: 'autocomplete-token',
			id: this.__id
		}
	}

	constructor(text: string, id: string, key?: lexical.NodeKey) {
		super(text, key)
		this.__id = id
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

class FileTokenNode extends lexical.TextNode {
	__id: string

	static override getType() {
		return 'file-token'
	}

	static override clone(node: FileTokenNode) {
		return new FileTokenNode(node.__text, node.__id, node.__key)
	}

	static override importJSON(serializedNode: lexical.SerializedTextNode & {id: string}) {
		return new FileTokenNode(serializedNode.text, serializedNode.id)
			.setStyle(serializedNode.style)
			.setFormat(serializedNode.format)
			.setDetail(serializedNode.detail)
			.setMode(serializedNode.mode)
	}

	override exportJSON() {
		return {...super.exportJSON(), type: 'file-token', id: this.__id}
	}

	constructor(text: string, id: string, key?: lexical.NodeKey) {
		super(text, key)
		this.__id = id
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

class AutocompleteMenuOption<TValue extends AutocompleteInput.Value> extends MenuOption {
	readonly entry: AutocompleteInput.Entry<TValue>

	constructor(entry: AutocompleteInput.Entry<TValue>, key: string) {
		super(key)
		this.entry = entry
	}
}

function readText(editor: lexical.LexicalEditor | null) {
	if (Predicate.isNull(editor)) return ''

	return editor.getEditorState().read(() => pipe(lexical.$getRoot().getTextContent(), String.trim))
}

function readEntries<TValue extends AutocompleteInput.Value>(
	editor: lexical.LexicalEditor | null,
	entriesById: Map<string, AutocompleteInput.Entry<TValue>>
) {
	if (Predicate.isNull(editor)) return Array.empty<AutocompleteInput.Entry<TValue>>()

	const activeIds = new Set<string>()

	const entries = editor.getEditorState().read(() => {
		const entries = Array.empty<AutocompleteInput.Entry<TValue>>()

		for (const node of lexical.$getRoot().getAllTextNodes()) {
			if (node instanceof AutocompleteTokenNode) {
				activeIds.add(node.__id)
				const entry = entriesById.get(node.__id)
				if (entry) entries.push(entry)
			}
		}

		return entries
	})

	for (const id of entriesById.keys()) {
		if (!activeIds.has(id)) entriesById.delete(id)
	}

	return entries
}

function readFiles(editor: lexical.LexicalEditor | null, filesById: Map<string, File>) {
	if (Predicate.isNull(editor)) return Array.empty<File>()

	const activeIds = new Set<string>()

	const files = editor.getEditorState().read(() => {
		const nextFiles = Array.empty<File>()

		for (const node of lexical.$getRoot().getAllTextNodes()) {
			if (node instanceof FileTokenNode) {
				activeIds.add(node.__id)
				const file = filesById.get(node.__id)
				if (file) nextFiles.push(file)
			}
		}

		return nextFiles
	})

	for (const id of filesById.keys()) {
		if (!activeIds.has(id)) filesById.delete(id)
	}

	return files
}

function getTriggerMatch<const TTrigger extends string>(text: string, triggers: readonly TTrigger[]) {
	const whitespace = /\s/
	let match: null | {trigger: TTrigger; query: string; leadOffset: number; replaceableString: string} = null

	for (const trigger of triggers) {
		// biome-ignore lint/plugin: small local parser for Lexical multi-trigger matching
		const index = text.lastIndexOf(trigger)
		if (index < 0) continue

		const previousCharacter = text[index - 1] ?? ''
		if (index > 0 && previousCharacter !== '(' && !whitespace.test(previousCharacter)) continue

		// biome-ignore lint/plugin: small local parser for Lexical multi-trigger matching
		const query = text.slice(index + trigger.length)
		if (query.length > 32 || whitespace.test(query)) continue

		match = {
			trigger,
			query,
			leadOffset: index,
			// biome-ignore lint/plugin: small local parser for Lexical multi-trigger matching
			replaceableString: text.slice(index)
		}
		break
	}

	return match
}

function EditorPlugin({
	editorRef,
	filesByIdRef
}: {
	editorRef: {current: lexical.LexicalEditor | null}
	filesByIdRef: {current: Map<string, File>}
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
			lexical.PASTE_COMMAND,
			event => {
				const clipboardData = event instanceof ClipboardEvent ? event.clipboardData : null
				const files = clipboardData ? Array.fromIterable(clipboardData.files) : Array.empty<File>()
				if (Array.isReadonlyArrayEmpty(files)) return false

				event.preventDefault()

				editor.update(() => {
					let selection = lexical.$getSelection()
					if (!lexical.$isRangeSelection(selection)) {
						lexical.$getRoot().selectEnd()
						selection = lexical.$getSelection()
						if (!lexical.$isRangeSelection(selection)) return
					}

					for (const file of files) {
						const id = crypto.randomUUID()
						filesByIdRef.current.set(id, file)
						selection.insertNodes([
							lexical.$applyNodeReplacement(
								new FileTokenNode(file.name, id).setMode('token').setStyle('color: #f59e0b')
							),
							lexical.$createTextNode(' ')
						])
					}
				})

				return true
			},
			lexical.COMMAND_PRIORITY_HIGH
		)
	}, [editor, filesByIdRef])

	return <HistoryPlugin />
}

function TypeaheadPlugin<TValue extends AutocompleteInput.Value>(props: {
	options?: AutocompleteInput.Options<TValue>
	children?: (entry: AutocompleteInput.Entry<TValue>) => React.ReactNode
	entriesByIdRef: {current: Map<string, AutocompleteInput.Entry<TValue>>}
}) {
	const [search, setSearch] = useState<null | {trigger: string; query: string}>(null)

	const triggers = pipe(
		props.options ?? {},
		Record.keys,
		Array.sort(
			Order.make<string>((left, right) => {
				if (left.length > right.length) return -1
				if (left.length < right.length) return 1
				return 0
			})
		)
	)

	const options = Array.empty<AutocompleteMenuOption<TValue>>()

	if (!(Predicate.isUndefined(props.options) || Predicate.isNull(search))) {
		const entries = props.options[search.trigger]

		if (!Predicate.isUndefined(entries)) {
			const query = pipe(search.query, String.toLowerCase)

			for (const value of entries.values) {
				if (!(String.isEmpty(query) || pipe(value.label, String.toLowerCase, String.includes(query)))) continue

				options.push(
					new AutocompleteMenuOption(
						{trigger: search.trigger, value, color: entries.color},
						`${search.trigger}:${value.label}:${options.length}`
					)
				)

				if (options.length === 10) break
			}
		}
	}

	return (
		<LexicalTypeaheadMenuPlugin<AutocompleteMenuOption<TValue>>
			onQueryChange={() => {}}
			triggerFn={text => {
				const match = getTriggerMatch(text, triggers)

				setSearch(current => {
					const next = Predicate.isNull(match) ? null : {trigger: match.trigger, query: match.query}
					if (current?.trigger === next?.trigger && current?.query === next?.query) return current
					return next
				})

				return Predicate.isNull(match)
					? null
					: {
							leadOffset: match.leadOffset,
							matchingString: match.query,
							replaceableString: match.replaceableString
						}
			}}
			onSelectOption={(option, nodeToReplace, closeMenu) => {
				const id = crypto.randomUUID()
				props.entriesByIdRef.current.set(id, option.entry)

				const token = lexical.$applyNodeReplacement(
					new AutocompleteTokenNode(`${option.entry.trigger}${option.entry.value.label}`, id)
						.setMode('token')
						.setStyle(`color: ${option.entry.color}`)
				)

				if (nodeToReplace) {
					// biome-ignore lint/plugin: Lexical node API uses imperative replacement here
					nodeToReplace.replace(token)
				}

				if (!nodeToReplace) {
					const selection = lexical.$getSelection()
					if (!lexical.$isRangeSelection(selection)) return
					selection.insertNodes([token])
				}

				const spacer = lexical.$createTextNode(' ')
				token.insertAfter(spacer)
				spacer.selectEnd()
				closeMenu()
			}}
			options={options}
			anchorClassName="z-50"
			menuRenderFn={(anchorElementRef, itemProps) =>
				Predicate.isNull(anchorElementRef.current) || Array.isReadonlyArrayEmpty(itemProps.options)
					? null
					: createPortal(
							<div className="max-h-64 min-w-56 overflow-y-auto rounded-md border border-input bg-background shadow-md">
								{Array.map(itemProps.options, (option, index) => (
									<button
										key={option.key}
										id={`typeahead-item-${index}`}
										type="button"
										ref={option.setRefElement}
										role="option"
										aria-selected={itemProps.selectedIndex === index}
										className={cn(
											'flex w-full items-start px-3 py-2 text-left text-xs',
											itemProps.selectedIndex === index && 'bg-muted'
										)}
										onMouseDown={event => event.preventDefault()}
										onMouseEnter={() => itemProps.setHighlightedIndex(index)}
										onClick={() => itemProps.selectOptionAndCleanUp(option)}
									>
										{props.children?.(option.entry) ?? (
											<>
												{/* biome-ignore lint/plugin: dynamic colors are part of the token/menu API here */}
												<span className="font-medium" style={{color: option.entry.color}}>
													{option.entry.trigger}
												</span>
												<span>{option.entry.value.label}</span>
											</>
										)}
									</button>
								))}
							</div>,
							anchorElementRef.current
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
		readonly text: string
		readonly entries: readonly Entry<TValue>[]
		readonly files: readonly File[]
		clear: () => void
	}

	export type EmptyOptions = Record<never, Option<never>>

	export type Props<TValue extends Value = Value> = {
		ref?: React.Ref<Handle<TValue>>
		options?: Options<TValue>
		children?: (entry: RenderEntry<TValue>) => React.ReactNode
		placeholder?: string
		className?: string
	}
}

export function AutocompleteInput<TValue extends AutocompleteInput.Value = AutocompleteInput.Value>(
	props: AutocompleteInput.Props<TValue>
) {
	const editorRef = useRef<lexical.LexicalEditor | null>(null)
	const autocompleteEntriesByIdRef = useRef(new Map<string, AutocompleteInput.Entry<TValue>>())
	const filesByIdRef = useRef(new Map<string, File>())

	useImperativeHandle(
		props.ref,
		() => ({
			get text() {
				return readText(editorRef.current)
			},
			get entries() {
				return readEntries(editorRef.current, autocompleteEntriesByIdRef.current)
			},
			get files() {
				return readFiles(editorRef.current, filesByIdRef.current)
			},
			clear() {
				if (Predicate.isNull(editorRef.current)) return

				autocompleteEntriesByIdRef.current.clear()
				filesByIdRef.current.clear()

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
					nodes: [AutocompleteTokenNode, FileTokenNode],
					theme: {},
					onError(error) {
						throw error
					}
				}}
			>
				<div className="relative max-h-90 min-h-24 overflow-y-auto border border-input dark:bg-input/30">
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

				<EditorPlugin editorRef={editorRef} filesByIdRef={filesByIdRef} />
				<TypeaheadPlugin options={props.options} entriesByIdRef={autocompleteEntriesByIdRef}>
					{props.children}
				</TypeaheadPlugin>
			</LexicalComposer>
		</div>
	)
}
