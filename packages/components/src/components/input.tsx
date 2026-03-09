import {Array, Predicate, pipe, Record, String} from 'effect'

import {ArrowUpIcon, Paperclip} from '@ai-toolkit/components/icons'
import {Button, buttonVariants} from '@ai-toolkit/components/ui/button'
import {LexicalComposer} from '@lexical/react/LexicalComposer'
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import {ContentEditable} from '@lexical/react/LexicalContentEditable'
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary'
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin'
import {OnChangePlugin} from '@lexical/react/LexicalOnChangePlugin'
import {PlainTextPlugin} from '@lexical/react/LexicalPlainTextPlugin'
import {mergeRegister} from '@lexical/utils'
import * as lexical from 'lexical'
import type * as React from 'react'
import type {ReactElement, ReactNode} from 'react'
import {Children, isValidElement, useId, useLayoutEffect, useRef, useState} from 'react'

import {cn} from '#lib/utils.ts'

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
	onSubmit: (payload: {text: string; completions: AutocompleteEntry[]; attachments: globalThis.File[]}) => void
	placeholder?: string
	children?: ReactNode
	disabled?: boolean
	className?: string
}

type ActiveMenu = {
	char: string
	query: string
}

type ResolvedOption = AutocompleteOptionConfig & {
	color: string
}

type CompletionState = AutocompleteEntry & {
	matchText: string
}

type AttachmentState = {
	file: globalThis.File
	matchText: string
}

function EditorKeyboard(props: {
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
		props.editorRef.current = editor
		if (!props.disabled) {
			editor.focus()
		}
	}, [editor, props.disabled, props.editorRef])

	useLayoutEffect(() => {
		editor.setEditable(!props.disabled)
	}, [editor, props.disabled])

	useLayoutEffect(
		() =>
			mergeRegister(
				editor.registerCommand(
					lexical.KEY_ENTER_COMMAND,
					event => {
						if (event?.shiftKey) return false

						if (props.menuOpen) {
							event?.preventDefault()
							props.onSelect()
							return true
						}

						event?.preventDefault()
						props.onSubmit()
						return true
					},
					lexical.COMMAND_PRIORITY_LOW
				),
				editor.registerCommand(
					lexical.KEY_DOWN_COMMAND,
					event => {
						if (event?.key === 'Escape' && props.menuOpen) {
							event.preventDefault()
							props.onDismiss()
							return true
						}

						if (props.menuOpen && (event?.key === 'ArrowUp' || event?.key === 'ArrowDown')) {
							event.preventDefault()
							props.onNavigate(event.key === 'ArrowUp' ? 'up' : 'down')
							return true
						}

						return false
					},
					lexical.COMMAND_PRIORITY_LOW
				)
			),
		[editor, props.menuOpen, props.onDismiss, props.onNavigate, props.onSelect, props.onSubmit]
	)

	return null
}

export function ChatInput(props: ChatInputProps) {
	const autocomplete: {[key: string]: ResolvedOption[]} = {}
	const snippets: SnippetConfig[] = []
	let toolbar: ReactNode = null
	let actions: ReactNode = null

	for (const child of Children.toArray(props.children)) {
		if (!isValidElement(child)) continue

		if (child.type === Autocomplete) {
			const autocompleteChild = child as ReactElement<AutocompleteConfig>
			const options: ResolvedOption[] = []

			for (const optionChild of Children.toArray(autocompleteChild.props.children)) {
				if (!isValidElement(optionChild)) continue

				if (optionChild.type !== AutocompleteOption) continue

				const autocompleteOptionChild = optionChild as ReactElement<AutocompleteOptionConfig>
				options.push({
					value: autocompleteOptionChild.props.value,
					description: autocompleteOptionChild.props.description,
					icon: autocompleteOptionChild.props.icon,
					children: autocompleteOptionChild.props.children,
					color: autocompleteChild.props.color
				})
			}

			autocomplete[autocompleteChild.props.trigger] = options
			continue
		}

		if (child.type === Snippets) {
			const snippetsChild = child as ReactElement<{children: ReactNode}>

			for (const snippetChild of Children.toArray(snippetsChild.props.children)) {
				if (!isValidElement(snippetChild)) continue

				if (snippetChild.type !== Snippet) continue

				const snippetElement = snippetChild as ReactElement<SnippetConfig>
				snippets.push({insert: snippetElement.props.insert, children: snippetElement.props.children})
			}

			continue
		}

		if (child.type === Toolbar) {
			toolbar = (child as ReactElement<{children: ReactNode}>).props.children
			continue
		}

		if (child.type === InputActions) actions = (child as ReactElement<{children?: ReactNode}>).props.children ?? null
	}

	const internalPromptRef = useRef(props.value ?? '')
	const [active, setActive] = useState<ActiveMenu | null>(null)
	const [selectedIndex, setSelectedIndex] = useState(0)
	const completionsRef = useRef<CompletionState[]>([])
	const attachmentsRef = useRef<AttachmentState[]>([])
	const fileInputId = useId()
	const editorRef = useRef<lexical.LexicalEditor | null>(null)

	const matched: ResolvedOption[] = []
	if (Predicate.isNotNull(active)) {
		const options = autocomplete[active.char]
		if (Predicate.isNotNullish(options)) {
			for (const option of options) {
				if (
					String.isEmpty(active.query) ||
					option.value.toLowerCase().includes(active.query.toLowerCase()) ||
					(Predicate.isNotNullish(option.description) &&
						option.description.toLowerCase().includes(active.query.toLowerCase()))
				) {
					matched.push(option)
				}

				if (matched.length >= 10) break
			}
		}
	}

	useLayoutEffect(() => {
		if (Predicate.isUndefined(props.value)) return

		if (Predicate.isNullish(editorRef.current)) return

		const nextValue = props.value

		const currentValue = editorRef.current.getEditorState().read(() => lexical.$getRoot().getTextContent())
		if (currentValue === nextValue) return

		editorRef.current.update(() => {
			const root = lexical.$getRoot()
			root.clear()
			const paragraph = lexical.$createParagraphNode()
			root.append(paragraph)
			if (String.isNonEmpty(nextValue)) paragraph.append(lexical.$createTextNode(nextValue))
			root.selectEnd()
		})

		internalPromptRef.current = nextValue
		completionsRef.current = []
		attachmentsRef.current = []
		setActive(null)
		setSelectedIndex(0)
	}, [props.value])

	return (
		<div className={cn('border-border/60 border-t bg-background', props.className)}>
			<div className="px-3 py-3">
				<div className="relative flex w-full flex-col border border-input dark:bg-input/30">
					{Predicate.isNotNull(active) && Array.isReadonlyArrayNonEmpty(matched) && (
						<div className="absolute right-0 bottom-full left-0 z-10 mb-2">
							<div
								role="listbox"
								aria-label="Autocomplete suggestions"
								className="max-h-48 overflow-y-auto border border-input bg-background"
							>
								{matched.map((entry, index) => (
									<button
										// biome-ignore lint/suspicious/noArrayIndexKey: local duplicated menu options are acceptable here
										key={`${entry.value}-${index}`}
										type="button"
										role="option"
										aria-selected={index === selectedIndex}
										ref={index === selectedIndex ? node => void node?.scrollIntoView({block: 'nearest'}) : undefined}
										className={cn(
											'flex w-full items-start gap-3 px-3 py-2 text-left text-xs',
											index === selectedIndex ? 'bg-muted' : ''
										)}
										onMouseDown={event => event.preventDefault()}
										onMouseEnter={() => setSelectedIndex(index)}
										onClick={() => {
											if (Predicate.isNullish(editorRef.current)) return

											const tokenText = `${active.char}${entry.value}`

											editorRef.current.update(() => {
												const selection = lexical.$getSelection()
												if (!lexical.$isRangeSelection(selection)) return

												const anchorNode = selection.anchor.getNode()
												const triggerLength = 1 + active.query.length
												const startOffset = selection.anchor.offset - triggerLength

												if (lexical.$isTextNode(anchorNode) && startOffset >= 0) {
													selection.setTextNodeRange(anchorNode, startOffset, anchorNode, selection.anchor.offset)
												}

												const tokenNode = new TokenNode(tokenText).setStyle(`color: ${entry.color}`)
												selection.insertNodes([tokenNode])
												const cursorNode = lexical.$createTextNode(' ')
												selection.insertNodes([cursorNode])
												cursorNode.select()
											})

											completionsRef.current = [
												...completionsRef.current,
												{kind: 'trigger', name: entry.value, char: active.char, matchText: tokenText}
											]
											setActive(null)
											setSelectedIndex(0)
										}}
									>
										{entry.children ?? (
											<div className="flex items-center gap-2">
												{Predicate.isNotNullish(entry.icon) && <span>{entry.icon}</span>}
												<span className="font-medium" style={{color: entry.color}}>
													{active.char}
													{entry.value}
												</span>
												{Predicate.isNotNullish(entry.description) && (
													<span className="text-muted-foreground">{entry.description}</span>
												)}
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
							onPaste={event => {
								const files = Array.fromIterable(event.clipboardData.files)
								if (Array.isReadonlyArrayEmpty(files)) return

								event.preventDefault()
								if (Predicate.isNullish(editorRef.current)) return

								const entries = Array.map(files, file => ({file, matchText: file.name}))
								attachmentsRef.current = [...attachmentsRef.current, ...entries]
								editorRef.current.focus()
								editorRef.current.update(() => {
									let selection = lexical.$getSelection()
									if (!lexical.$isRangeSelection(selection)) {
										lexical.$getRoot().selectEnd()
										selection = lexical.$getSelection()
										if (!lexical.$isRangeSelection(selection)) return
									}

									for (const entry of entries) {
										const tokenNode = new TokenNode(entry.matchText).setStyle('color: #f59e0b')
										selection.insertNodes([tokenNode])
										const cursorNode = lexical.$createTextNode(' ')
										selection.insertNodes([cursorNode])
										cursorNode.select()
									}
								})
							}}
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
						<OnChangePlugin
							onChange={editorState => {
								editorState.read(() => {
									const nextPrompt = lexical.$getRoot().getTextContent()
									if (nextPrompt !== (Predicate.isUndefined(props.value) ? internalPromptRef.current : props.value)) {
										if (Predicate.isUndefined(props.value)) internalPromptRef.current = nextPrompt

										if (Predicate.isFunction(props.onValueChange)) props.onValueChange(nextPrompt)
									}

									const selection = lexical.$getSelection()
									if (!lexical.$isRangeSelection(selection)) {
										setActive(null)
										return
									}

									const anchorNode = selection.anchor.getNode()
									if (!lexical.$isTextNode(anchorNode)) {
										setActive(null)
										return
									}

									const escaped = pipe(
										Record.keys(autocomplete),
										Array.map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
										Array.join('')
									)

									if (String.isEmpty(escaped)) {
										setActive(null)
										return
									}

									const match = new RegExp(`([${escaped}])([A-Za-z0-9_-]{0,32})$`).exec(
										anchorNode.getTextContent().slice(0, selection.anchor.offset)
									)
									if (Predicate.isNullish(match)) {
										setActive(null)
										return
									}

									if (Predicate.isUndefined(match[1]) || Predicate.isUndefined(match[2])) {
										setActive(null)
										return
									}

									const nextOptions = autocomplete[match[1]]
									if (Predicate.isNullish(nextOptions) || Array.isReadonlyArrayEmpty(nextOptions)) {
										setActive(null)
										return
									}

									setActive({char: match[1], query: match[2]})
									setSelectedIndex(0)
								})
							}}
						/>
						<HistoryPlugin />
						<EditorKeyboard
							editorRef={editorRef}
							onSubmit={() => {
								if (Predicate.isNullish(editorRef.current) || (props.disabled ?? false)) return

								const text = String.trim(
									editorRef.current.getEditorState().read(() => lexical.$getRoot().getTextContent())
								)
								if (String.isEmpty(text)) return

								props.onSubmit({
									text,
									completions: pipe(
										completionsRef.current,
										Array.filter(completion => text.includes(completion.matchText)),
										Array.map(completion => ({kind: completion.kind, name: completion.name, char: completion.char}))
									),
									attachments: pipe(
										attachmentsRef.current,
										Array.filter(attachment => text.includes(attachment.matchText)),
										Array.map(attachment => attachment.file)
									)
								})

								editorRef.current.update(() => {
									const root = lexical.$getRoot()
									root.clear()
									root.append(lexical.$createParagraphNode())
									root.selectStart()
								})

								if (Predicate.isUndefined(props.value)) internalPromptRef.current = ''

								if (Predicate.isFunction(props.onValueChange)) props.onValueChange('')

								setActive(null)
								setSelectedIndex(0)
								completionsRef.current = []
								attachmentsRef.current = []
							}}
							onDismiss={() => {
								setActive(null)
								setSelectedIndex(0)
							}}
							onNavigate={direction => {
								if (Array.isReadonlyArrayEmpty(matched)) return

								setSelectedIndex(previous => {
									if (direction === 'up') return previous <= 0 ? matched.length - 1 : previous - 1

									return previous >= matched.length - 1 ? 0 : previous + 1
								})
							}}
							onSelect={() => {
								const entry = matched[selectedIndex]
								if (
									Predicate.isNullish(entry) ||
									Predicate.isNullish(editorRef.current) ||
									Predicate.isNullish(active)
								) {
									return
								}

								const tokenText = `${active.char}${entry.value}`

								editorRef.current.update(() => {
									const selection = lexical.$getSelection()
									if (!lexical.$isRangeSelection(selection)) return

									const anchorNode = selection.anchor.getNode()
									const triggerLength = 1 + active.query.length
									const startOffset = selection.anchor.offset - triggerLength

									if (lexical.$isTextNode(anchorNode) && startOffset >= 0) {
										selection.setTextNodeRange(anchorNode, startOffset, anchorNode, selection.anchor.offset)
									}

									const tokenNode = new TokenNode(tokenText).setStyle(`color: ${entry.color}`)
									selection.insertNodes([tokenNode])
									const cursorNode = lexical.$createTextNode(' ')
									selection.insertNodes([cursorNode])
									cursorNode.select()
								})

								completionsRef.current = [
									...completionsRef.current,
									{kind: 'trigger', name: entry.value, char: active.char, matchText: tokenText}
								]
								setActive(null)
								setSelectedIndex(0)
							}}
							menuOpen={Array.isReadonlyArrayNonEmpty(matched)}
							disabled={props.disabled ?? false}
						/>
					</LexicalComposer>

					<div className="flex items-center justify-between border-border/40 border-t px-2.5 py-2">
						<div className="flex min-w-0 flex-1 items-center gap-2">{toolbar}</div>
						<div className="flex items-center gap-2">
							{snippets.map((entry, index) => (
								<Button
									// biome-ignore lint/suspicious/noArrayIndexKey: local duplicated snippet entries are acceptable here
									key={`snippet-${entry.insert}-${index}`}
									type="button"
									variant="outline"
									size="icon-xs"
									onMouseDown={event => event.preventDefault()}
									onClick={() => {
										if (Predicate.isNullish(editorRef.current)) return

										editorRef.current.update(() => {
											const selection = lexical.$getSelection()
											if (!lexical.$isRangeSelection(selection)) return

											const parts = entry.insert.split('\n')
											for (let partIndex = 0; partIndex < parts.length; partIndex++) {
												const part = parts[partIndex]
												if (Predicate.isUndefined(part)) continue
												if (String.isNonEmpty(part)) selection.insertText(part)

												if (
													partIndex < parts.length - 1 &&
													!(partIndex === parts.length - 2 && parts[parts.length - 1] === '')
												) {
													selection.insertNodes([lexical.$createLineBreakNode()])
												}
											}
										})

										completionsRef.current = [
											...completionsRef.current,
											{kind: 'snippet', name: entry.insert, matchText: entry.insert}
										]
									}}
									disabled={props.disabled ?? false}
								>
									{entry.children}
								</Button>
							))}
							<label
								htmlFor={fileInputId}
								className={cn(
									buttonVariants({variant: 'outline', size: 'icon-xs'}),
									(props.disabled ?? false) ? 'pointer-events-none' : 'cursor-pointer'
								)}
								aria-label="Attach file"
							>
								<Paperclip className="size-3.5" />
							</label>
							<input
								id={fileInputId}
								type="file"
								className="sr-only"
								multiple
								disabled={props.disabled ?? false}
								onChange={event => {
									const files = event.currentTarget.files
									if (Predicate.isNullish(files) || Predicate.isNullish(editorRef.current)) {
										return
									}

									const entries = Array.map(Array.fromIterable(files), file => ({file, matchText: file.name}))
									event.currentTarget.value = ''
									attachmentsRef.current = [...attachmentsRef.current, ...entries]
									editorRef.current.focus()
									editorRef.current.update(() => {
										let selection = lexical.$getSelection()
										if (!lexical.$isRangeSelection(selection)) {
											lexical.$getRoot().selectEnd()
											selection = lexical.$getSelection()
											if (!lexical.$isRangeSelection(selection)) {
												return
											}
										}

										for (const entry of entries) {
											const tokenNode = new TokenNode(entry.matchText).setStyle('color: #f59e0b')
											selection.insertNodes([tokenNode])
											const cursorNode = lexical.$createTextNode(' ')
											selection.insertNodes([cursorNode])
											cursorNode.select()
										}
									})
								}}
							/>
							{actions}
							<Button
								onClick={() => {
									if (Predicate.isNullish(editorRef.current)) {
										return
									}

									const text = String.trim(
										editorRef.current.getEditorState().read(() => lexical.$getRoot().getTextContent())
									)
									if (String.isEmpty(text)) {
										return
									}

									props.onSubmit({
										text,
										completions: pipe(
											completionsRef.current,
											Array.filter(completion => text.includes(completion.matchText)),
											Array.map(completion => ({kind: completion.kind, name: completion.name, char: completion.char}))
										),
										attachments: pipe(
											attachmentsRef.current,
											Array.filter(attachment => text.includes(attachment.matchText)),
											Array.map(attachment => attachment.file)
										)
									})

									editorRef.current.update(() => {
										const root = lexical.$getRoot()
										root.clear()
										root.append(lexical.$createParagraphNode())
										root.selectStart()
									})

									if (Predicate.isUndefined(props.value)) internalPromptRef.current = ''

									if (Predicate.isFunction(props.onValueChange)) props.onValueChange('')

									setActive(null)
									setSelectedIndex(0)
									completionsRef.current = []
									attachmentsRef.current = []
								}}
								variant="default"
								size="icon-xs"
								disabled={props.disabled ?? false}
							>
								<ArrowUpIcon className="size-3.5" />
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

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

export {Autocomplete, AutocompleteOption, InputActions, Snippet, Snippets, Toolbar}
