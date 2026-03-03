import {Array as EffectArray, Record as EffectRecord} from 'effect'

import {FilePart} from '@ai-toolkit/ai/schema'
import {ArrowUpIcon, Paperclip} from '@ai-toolkit/components/icons'
import {Button} from '@ai-toolkit/components/ui/button'
import {LexicalComposer} from '@lexical/react/LexicalComposer'
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import {ContentEditable} from '@lexical/react/LexicalContentEditable'
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary'
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin'
import {OnChangePlugin} from '@lexical/react/LexicalOnChangePlugin'
import {PlainTextPlugin} from '@lexical/react/LexicalPlainTextPlugin'
import {mergeRegister} from '@lexical/utils'
import * as lexical from 'lexical'
import type {ReactElement, ReactNode} from 'react'
import {useLayoutEffect, useRef, useState} from 'react'

import {cn} from '#lib/utils.ts'

// -- Lexical token node (atomic, non-splittable text) --

class TokenNode extends lexical.TextNode {
	static override getType() {
		return 'token'
	}

	static override clone(node: TokenNode) {
		return new TokenNode(node.__text, node.__key)
	}

	override isSegmented() {
		return true
	}

	override isToken() {
		return true
	}
}

function $createTokenNode(text: string, color: string) {
	return new TokenNode(text).setStyle(`color: ${color}`)
}

// -- Types --

export type AutocompleteEntry = {
	kind: 'trigger' | 'snippet' | 'attachment'
	name: string
	char?: string
}

type AutocompleteOptionConfig = {
	value: string
	description?: string
	icon?: ReactNode
	children?: ReactNode
}

type AutocompleteConfig = {
	trigger: string
	color: string
	children: ReactNode
}

type SnippetConfig = {
	insert: string
	children: ReactNode
}

type ChatInputProps = {
	value?: string
	onValueChange?: (value: string) => void
	onSubmit: (payload: {text: string; completions: AutocompleteEntry[]; attachments: FilePart[]}) => void
	placeholder?: string
	children?: ReactNode
	disabled?: boolean
	className?: string
}

type ActiveMenu = {kind: 'trigger'; char: string; query: string}

type ResolvedOption = AutocompleteOptionConfig & {color: string}

type CompletionState = AutocompleteEntry & {matchText: string}

type AttachmentState = {attachment: FilePart; matchText: string}

// -- Child parsing --

function normalizeChildren(children: ReactNode): ReactElement[] {
	const result: ReactElement[] = []
	const stack: ReactNode[] = EffectArray.isArray(children) ? (children as ReactNode[]) : [children]
	for (const child of stack) {
		if (child === null || child === undefined || child === false) continue
		if (EffectArray.isArray(child)) {
			result.push(...normalizeChildren(child as ReactNode[]))
			continue
		}
		if (typeof child === 'object' && 'type' in child) {
			result.push(child as ReactElement)
		}
	}
	return result
}

function parseChildren(children: ReactNode) {
	const autocomplete: Record<string, ResolvedOption[]> = {}
	const snippets: SnippetConfig[] = []
	let toolbar: ReactNode = null
	let actions: ReactNode = null

	for (const child of normalizeChildren(children)) {
		if (child.type === Autocomplete) {
			const autoProps = child.props as AutocompleteConfig
			const color = autoProps.color
			const options: ResolvedOption[] = []
			for (const entry of normalizeChildren(autoProps.children)) {
				if (entry.type !== AutocompleteOption) continue
				const optionProps = entry.props as AutocompleteOptionConfig
				options.push({...optionProps, color})
			}
			autocomplete[autoProps.trigger] = options
			continue
		}
		if (child.type === Snippets) {
			const snippetsProps = child.props as {children: ReactNode}
			for (const entry of normalizeChildren(snippetsProps.children)) {
				if (entry.type !== Snippet) continue
				const snippetProps = entry.props as SnippetConfig
				snippets.push({insert: snippetProps.insert, children: snippetProps.children})
			}
			continue
		}
		if (child.type === Toolbar) {
			toolbar = (child.props as {children: ReactNode}).children
			continue
		}
		if (child.type === InputActions) {
			actions = (child.props as {children?: ReactNode}).children ?? null
		}
	}

	return {autocomplete, snippets, toolbar, actions}
}

// -- Trigger detection --

function detectTrigger(selection: ReturnType<typeof lexical.$getSelection>, triggerChars: string[]): ActiveMenu | null {
	if (!lexical.$isRangeSelection(selection)) return null
	const anchorNode = selection.anchor.getNode()
	if (!lexical.$isTextNode(anchorNode)) return null

	const leading = anchorNode.getTextContent().slice(0, selection.anchor.offset)
	const escaped = triggerChars.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')
	if (!escaped) return null

	const regex = new RegExp(`([${escaped}])([A-Za-z0-9_-]{0,32})$`)
	const match = regex.exec(leading)
	if (match === null) return null

	const char = match[1]
	const query = match[2]
	if (char === undefined || query === undefined) return null
	return {kind: 'trigger', char, query}
}

function matchOptions(autocomplete: Record<string, ResolvedOption[]>, active: ActiveMenu | null): ResolvedOption[] {
	if (active === null) return []
	const options = autocomplete[active.char]
	if (!options) return []
	const query = active.query.toLowerCase()
	return options.filter(option => {
		if (!query) return true
		return option.value.toLowerCase().includes(query) || option.description?.toLowerCase().includes(query)
	})
}

// -- Keyboard handler (Lexical plugin) --

function EditorKeyboard(keyboardProps: {
	editorRef: React.RefObject<lexical.LexicalEditor | null>
	onSubmit: () => void
	onDismiss: () => void
	onNavigate: (direction: 'up' | 'down') => void
	onSelect: () => void
	menuOpen: boolean
	disabled: boolean
}) {
	const [editor] = useLexicalComposerContext()

	useLayoutEffect(() => {
		keyboardProps.editorRef.current = editor
		if (!keyboardProps.disabled) editor.focus()
	}, [editor, keyboardProps.editorRef, keyboardProps.disabled])

	useLayoutEffect(() => {
		editor.setEditable(!keyboardProps.disabled)
	}, [editor, keyboardProps.disabled])

	useLayoutEffect(
		() =>
			mergeRegister(
				editor.registerCommand(
					lexical.KEY_ENTER_COMMAND,
					event => {
						if (event?.shiftKey) return false
						if (keyboardProps.menuOpen) {
							event?.preventDefault()
							keyboardProps.onSelect()
							return true
						}
						event?.preventDefault()
						keyboardProps.onSubmit()
						return true
					},
					lexical.COMMAND_PRIORITY_LOW
				),
				editor.registerCommand(
					lexical.KEY_DOWN_COMMAND,
					event => {
						if (!event) return false
						if (event.key === 'Escape' && keyboardProps.menuOpen) {
							event.preventDefault()
							keyboardProps.onDismiss()
							return true
						}
						if (keyboardProps.menuOpen && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
							event.preventDefault()
							keyboardProps.onNavigate(event.key === 'ArrowUp' ? 'up' : 'down')
							return true
						}
						return false
					},
					lexical.COMMAND_PRIORITY_LOW
				)
			),
		[
			editor,
			keyboardProps.menuOpen,
			keyboardProps.onSubmit,
			keyboardProps.onDismiss,
			keyboardProps.onNavigate,
			keyboardProps.onSelect,
			keyboardProps
		]
	)

	return null
}

function scrollSelectedIntoView(node: HTMLButtonElement | null) {
	node?.scrollIntoView({block: 'nearest'})
}

// -- Main component --

export function ChatInput(props: ChatInputProps) {
	const {autocomplete, snippets, toolbar, actions} = parseChildren(props.children)
	const triggerChars = EffectRecord.keys(autocomplete)
	const disabled = props.disabled ?? false

	const [internalPrompt, setInternalPrompt] = useState(props.value ?? '')
	const prompt = props.value ?? internalPrompt
	const [active, setActive] = useState<ActiveMenu | null>(null)
	const [selectedIndex, setSelectedIndex] = useState(0)
	const completionsRef = useRef<CompletionState[]>([])
	const attachmentsRef = useRef<AttachmentState[]>([])
	const fileInputRef = useRef<HTMLInputElement | null>(null)
	const editorRef = useRef<lexical.LexicalEditor | null>(null)

	const matched = matchOptions(autocomplete, active).slice(0, 10)
	const menuOpen = matched.length > 0

	function setPromptValue(nextValue: string) {
		if (props.value === undefined) setInternalPrompt(nextValue)
		props.onValueChange?.(nextValue)
	}

	function handleSubmit() {
		const trimmed = prompt.trim()
		if (!trimmed || disabled) return

		const seen = new Set<string>()
		const activeCompletions = completionsRef.current.filter(c => {
			if (!trimmed.includes(c.matchText) || seen.has(c.matchText)) return false
			seen.add(c.matchText)
			return true
		})
		const activeAttachments = attachmentsRef.current.filter(a => trimmed.includes(a.matchText))
		props.onSubmit({
			text: trimmed,
			completions: activeCompletions.map(({kind, name, char}) => ({kind, name, char})),
			attachments: activeAttachments.map(a => a.attachment)
		})

		editorRef.current?.update(() => {
			const root = lexical.$getRoot()
			root.clear()
			root.selectStart()
		})

		setPromptValue('')
		setActive(null)
		completionsRef.current = []
		attachmentsRef.current = []
	}

	function handleDismiss() {
		setActive(null)
		setSelectedIndex(0)
	}

	function readAsBase64(file: globalThis.File) {
		return new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => {
				if (typeof reader.result !== 'string') {
					reject(new Error('Attachment read failed'))
					return
				}
				const commaIndex = reader.result.indexOf(',')
				const content = commaIndex === -1 ? reader.result : reader.result.slice(commaIndex + 1)
				resolve(content)
			}
			reader.onerror = () => reject(reader.error ?? new Error('Attachment read failed'))
			reader.readAsDataURL(file)
		})
	}

	async function handleAttachFiles(files: globalThis.File[]) {
		if (files.length === 0) return
		const editor = editorRef.current
		if (!editor) return

		const entries = await Promise.all(
			files.map(async file => {
				const name = file.name
				const base64 = await readAsBase64(file)
				const attachment = new FilePart({
					data: base64,
					mediaType: file.type || 'application/octet-stream',
					filename: name
				})
				return {attachment, matchText: name}
			})
		)
		attachmentsRef.current = [...attachmentsRef.current, ...entries]

		editor.update(() => {
			const selection = lexical.$getSelection()
			if (!lexical.$isRangeSelection(selection)) return
			for (const entry of entries) {
				const tokenNode = $createTokenNode(entry.matchText, '#f59e0b')
				selection.insertNodes([tokenNode])
				const cursorNode = lexical.$createTextNode(' ')
				selection.insertNodes([cursorNode])
				cursorNode.select()
			}
		})
	}

	function handleNavigate(direction: 'up' | 'down') {
		if (matched.length === 0) return
		setSelectedIndex(prev => {
			if (direction === 'up') return prev <= 0 ? matched.length - 1 : prev - 1
			return prev >= matched.length - 1 ? 0 : prev + 1
		})
	}

	function handleSelect() {
		const entry = matched[selectedIndex]
		if (entry) handlePick(entry)
	}

	function handlePick(entry: ResolvedOption) {
		const editor = editorRef.current
		if (!editor || active?.kind !== 'trigger') return

		const triggerChar = active.char
		const tokenText = `${triggerChar}${entry.value}`

		editor.update(() => {
			const selection = lexical.$getSelection()
			if (!lexical.$isRangeSelection(selection)) return

			const anchorNode = selection.anchor.getNode()
			const triggerLength = 1 + active.query.length
			const startOffset = selection.anchor.offset - triggerLength

			if (lexical.$isTextNode(anchorNode) && startOffset >= 0) {
				selection.setTextNodeRange(anchorNode, startOffset, anchorNode, selection.anchor.offset)
			}

			const tokenNode = $createTokenNode(tokenText, entry.color)
			selection.insertNodes([tokenNode])
			const cursorNode = lexical.$createTextNode(' ')
			selection.insertNodes([cursorNode])
			cursorNode.select()
		})

		completionsRef.current = [
			...completionsRef.current,
			{kind: 'trigger', name: entry.value, char: triggerChar, matchText: tokenText}
		]

		setActive(null)
		setSelectedIndex(0)
	}

	function handleSnippetInsert(entry: SnippetConfig) {
		const editor = editorRef.current
		if (!editor) return
		editor.update(() => {
			const selection = lexical.$getSelection()
			if (!lexical.$isRangeSelection(selection)) return
			const parts = entry.insert.split('\n')
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i]
				if (part !== undefined && part.length > 0) selection.insertText(part)
				if (i < parts.length - 1 && !(i === parts.length - 2 && parts[parts.length - 1] === '')) {
					selection.insertNodes([lexical.$createLineBreakNode()])
				}
			}
		})
		completionsRef.current = [...completionsRef.current, {kind: 'snippet', name: entry.insert, matchText: entry.insert}]
	}

	function handleEditorChange(editorState: lexical.EditorState) {
		editorState.read(() => {
			const nextPrompt = lexical.$getRoot().getTextContent()
			if (nextPrompt !== prompt) setPromptValue(nextPrompt)

			const detected = detectTrigger(lexical.$getSelection(), triggerChars)
			if (detected === null) {
				setActive(null)
				return
			}
			const options = autocomplete[detected.char]
			if (options && options.length > 0) {
				setActive(detected)
				setSelectedIndex(0)
			} else {
				setActive(null)
			}
		})
	}

	function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
		const files = EffectArray.fromIterable(event.clipboardData.files)
		if (files.length === 0) return
		event.preventDefault()
		void handleAttachFiles(files)
	}

	useLayoutEffect(() => {
		if (props.value === undefined) return
		const editor = editorRef.current
		if (!editor) return
		const currentValue = editor.getEditorState().read(() => lexical.$getRoot().getTextContent())
		if (currentValue === props.value) return
		editor.update(() => {
			const root = lexical.$getRoot()
			root.clear()
			if (props.value) root.append(lexical.$createTextNode(props.value))
			root.selectEnd()
		})
	}, [props.value])

	return (
		<div className={cn('border-border/60 border-t bg-background', props.className)}>
			<div className="px-3 py-3">
				<div className="relative flex w-full flex-col border border-input dark:bg-input/30">
					{menuOpen && (
						<div className="absolute right-0 bottom-full left-0 z-10 mb-2">
							<div
								role="listbox"
								aria-label="Autocomplete suggestions"
								className="max-h-48 overflow-y-auto border border-input bg-background"
							>
								{matched.map((entry, index) => (
									<button
										// biome-ignore lint/suspicious/noArrayIndexKey: _
										key={`${entry.value}-${index}`}
										type="button"
										role="option"
										aria-selected={index === selectedIndex}
										ref={index === selectedIndex ? scrollSelectedIntoView : undefined}
										className={cn(
											'flex w-full items-start gap-3 px-3 py-2 text-left text-xs',
											index === selectedIndex ? 'bg-muted' : ''
										)}
										onMouseEnter={() => setSelectedIndex(index)}
										onClick={() => handlePick(entry)}
									>
										{entry.children ?? (
											<div className="flex items-center gap-2">
												{entry.icon ? <span>{entry.icon}</span> : null}
												<span className="font-medium" style={{color: entry.color}}>
													{active?.kind === 'trigger' ? active.char : ''}
													{entry.value}
												</span>
												{entry.description ? <span className="text-muted-foreground">{entry.description}</span> : null}
											</div>
										)}
									</button>
								))}
							</div>
						</div>
					)}

					<LexicalComposer
						initialConfig={{
							namespace: 'chat-input',
							nodes: [TokenNode],
							theme: {},
							onError: (error: Error) => {
								throw error
							}
						}}
					>
						<div
							className="relative overflow-y-auto"
							style={{maxHeight: '22.5rem', minHeight: '6rem'}}
							onPaste={handlePaste}
						>
							<PlainTextPlugin
								contentEditable={
									<ContentEditable
										className="wrap-break-word block w-full resize-none whitespace-pre-wrap px-3 py-2 text-[13px] leading-relaxed outline-none"
										style={{minHeight: '6rem'}}
									/>
								}
								placeholder={
									<div className="pointer-events-none absolute inset-x-3 top-2 select-none text-[13px] text-muted-foreground">
										{props.placeholder ?? 'Send a message...'}
									</div>
								}
								ErrorBoundary={LexicalErrorBoundary}
							/>
						</div>
						<OnChangePlugin onChange={handleEditorChange} />
						<HistoryPlugin />
						<EditorKeyboard
							editorRef={editorRef}
							onSubmit={handleSubmit}
							onDismiss={handleDismiss}
							onNavigate={handleNavigate}
							onSelect={handleSelect}
							menuOpen={menuOpen}
							disabled={disabled}
						/>
					</LexicalComposer>

					<div className="flex items-center justify-between border-border/40 border-t px-2.5 py-2">
						<div className="flex min-w-0 flex-1 items-center gap-2">{toolbar}</div>
						<div className="flex items-center gap-2">
							{snippets.map((entry, index) => (
								<Button
									// biome-ignore lint/suspicious/noArrayIndexKey: _
									key={`snippet-${entry.insert}-${index}`}
									type="button"
									variant="outline"
									size="icon-xs"
									onClick={() => handleSnippetInsert(entry)}
									disabled={disabled}
								>
									{entry.children}
								</Button>
							))}
							<Button
								type="button"
								variant="outline"
								size="icon-xs"
								onClick={() => fileInputRef.current?.click()}
								disabled={disabled}
								aria-label="Attach file"
							>
								<Paperclip className="size-3.5" />
							</Button>
							<input
								ref={fileInputRef}
								type="file"
								className="sr-only"
								multiple
								onChange={event => {
									const files = event.currentTarget.files
									if (!files) return
									void handleAttachFiles([...files])
									event.currentTarget.value = ''
								}}
							/>
							{actions}
							<Button onClick={handleSubmit} variant="default" size="icon-xs" disabled={disabled}>
								<ArrowUpIcon className="size-3.5" />
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

// -- Declarative config components (render nothing, read by parseChildren) --

function Autocomplete(_: AutocompleteConfig) {
	return null
}

function AutocompleteOption(_: AutocompleteOptionConfig) {
	return null
}

function Snippets(_: {children: ReactNode}) {
	return null
}

function Snippet(_: SnippetConfig) {
	return null
}

function Toolbar(_: {children: ReactNode}) {
	return null
}

function InputActions(_: {children?: ReactNode}) {
	return null
}

export {Autocomplete, AutocompleteOption, Snippet, Snippets, Toolbar, InputActions}
