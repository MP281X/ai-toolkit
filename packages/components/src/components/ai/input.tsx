import {Array, pipe} from 'effect'

import {type AiInput, type Model, ModelId, ProviderId} from '@ai-toolkit/ai'
import {ArrowUpIcon, CheckIcon, ChevronsUpDownIcon} from '@ai-toolkit/components/icons'
import {Command, CommandGroup, CommandItem, CommandList} from '@ai-toolkit/components/ui/command'
import {InputGroup, InputGroupAddon, InputGroupButton} from '@ai-toolkit/components/ui/input-group'
import {Popover, PopoverContent, PopoverTrigger} from '@ai-toolkit/components/ui/popover'
import {type InitialConfigType, LexicalComposer} from '@lexical/react/LexicalComposer'
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext'
import {ContentEditable} from '@lexical/react/LexicalContentEditable'
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary'
import {HistoryPlugin} from '@lexical/react/LexicalHistoryPlugin'
import {OnChangePlugin} from '@lexical/react/LexicalOnChangePlugin'
import {PlainTextPlugin} from '@lexical/react/LexicalPlainTextPlugin'
import {mergeRegister} from '@lexical/utils'
import {
	$getRoot,
	$getSelection,
	$isRangeSelection,
	$isTextNode,
	COMMAND_PRIORITY_LOW,
	type EditorState,
	KEY_DOWN_COMMAND,
	KEY_ENTER_COMMAND,
	type LexicalEditor
} from 'lexical'
import {useEffect, useRef, useState} from 'react'

import {cn} from '#lib/utils.ts'

type ChatInputProps = {
	onSubmit: (input: AiInput) => void
	placeholder?: string
	actions?: ChatAction[]
	onActionSelect?: (action: ChatAction) => void
}

type TriggerType = 'command' | 'insert' | 'mention' | 'tag'

type TriggerState = {
	type: TriggerType
	query: string
}

type ChatAction = {
	id: string
	title: string
	description: string
	insert: string
	trigger: TriggerType
}

const defaultActions: ChatAction[] = [
	{
		id: 'mention-agent',
		title: '@agentname',
		description: 'Spawn an AI agent in a sandbox',
		insert: '@agent ',
		trigger: 'mention'
	},
	{
		id: 'mention-handoff',
		title: '@handoff',
		description: 'Hand conversation to a helper agent',
		insert: '@handoff ',
		trigger: 'mention'
	},
	{
		id: 'command-run',
		title: '/command',
		description: 'Run a slash command',
		insert: '/command ',
		trigger: 'command'
	},
	{
		id: 'tag-agent',
		title: '#agent',
		description: 'Change agent or system prompt',
		insert: '#agent ',
		trigger: 'tag'
	},
	{
		id: 'insert-code',
		title: 'Code block',
		description: 'Insert fenced code for prompts',
		insert: '```\n\n```\n',
		trigger: 'insert'
	},
	{
		id: 'insert-xml',
		title: 'XML section',
		description: 'Wrap content with XML markers',
		insert: '<section>\n\n</section>\n',
		trigger: 'insert'
	}
]

const lexicalConfig: InitialConfigType = {
	namespace: 'chat-input',
	theme: {},
	onError: (error: Error) => {
		throw error
	}
}

export function ChatInput(props: ChatInputProps) {
	const [model, setModel] = useState<Model>({provider: 'opencode_zen', model: 'kimi-k2.5-free'})
	const [comboboxOpen, setComboboxOpen] = useState(false)
	const [prompt, setPrompt] = useState('')
	const [textTrigger, setTextTrigger] = useState<TriggerState | null>(null)
	const [manualTrigger, setManualTrigger] = useState<TriggerState | null>(null)
	const editorRef = useRef<LexicalEditor | null>(null)
	const actions = props.actions ?? defaultActions
	const hasInsertActions = actions.some(action => action.trigger === 'insert')

	const activeTrigger = manualTrigger ?? textTrigger

	const filteredActions =
		activeTrigger === null
			? []
			: actions.filter(action => {
					if (action.trigger !== activeTrigger.type) return false
					if (!activeTrigger.query) return true
					const query = activeTrigger.query.toLowerCase()
					return action.title.toLowerCase().includes(query) || action.description.toLowerCase().includes(query)
				})

	function handleSubmit() {
		if (!prompt.trim()) return
		props.onSubmit({prompt, model})
		const editor = editorRef.current
		if (editor) {
			editor.update(() => {
				const root = $getRoot()
				root.clear()
				root.selectStart()
			})
		}
		setPrompt('')
		setTextTrigger(null)
		setManualTrigger(null)
	}

	function handleActionSelect(action: ChatAction) {
		const editor = editorRef.current
		if (!editor) return
		editor.update(() => {
			const selection = $getSelection()
			if (!$isRangeSelection(selection)) return
			const anchorNode = selection.anchor.getNode()
			const queryLength = activeTrigger ? activeTrigger.query.length : 0
			const triggerLength = activeTrigger ? 1 : 0
			const startOffset = selection.anchor.offset - queryLength - triggerLength
			if ($isTextNode(anchorNode) && startOffset >= 0) {
				selection.setTextNodeRange(anchorNode, startOffset, anchorNode, selection.anchor.offset)
			}
			selection.insertText(action.insert)
		})
		props.onActionSelect?.(action)
		setManualTrigger(null)
		setTextTrigger(null)
	}

	function handleEditorChange(editorState: EditorState, editor: LexicalEditor) {
		editorRef.current = editor
		editorState.read(() => {
			const root = $getRoot()
			setPrompt(root.getTextContent())
			const selection = $getSelection()
			const trigger = readTrigger(selection)
			if (trigger === null) {
				setTextTrigger(null)
				return
			}
			const hasActions = actions.some(action => action.trigger === trigger.type)
			setTextTrigger(hasActions ? trigger : null)
		})
	}

	return (
		<div className="border-border/60 border-t bg-background">
			<div className="px-3 py-3">
				<InputGroup className="h-auto">
					<div className="relative flex min-h-24 flex-1 flex-col">
						<LexicalComposer initialConfig={lexicalConfig}>
							<div className="relative flex flex-1 flex-col">
								<PlainTextPlugin
									contentEditable={
										<ContentEditable
											data-slot="input-group-control"
											className={cn(
												'w-full whitespace-pre-wrap break-words px-3 py-2 text-[13px] leading-relaxed outline-none ring-0'
											)}
										/>
									}
									placeholder={
										<div className="pointer-events-none absolute inset-x-3 top-2 select-none text-[13px] text-muted-foreground">
											{props.placeholder ?? 'Send a message...'}
										</div>
									}
									ErrorBoundary={LexicalErrorBoundary}
								/>
								<OnChangePlugin onChange={handleEditorChange} />
								<HistoryPlugin />
								<AutoFocusPlugin />
								<HotkeyPlugin
									onSubmit={handleSubmit}
									onOpenInsertMenu={() => {
										if (!hasInsertActions) return
										if (manualTrigger) {
											setManualTrigger(null)
											return
										}
										setManualTrigger({type: 'insert', query: ''})
									}}
									onCloseMenu={() => {
										setManualTrigger(null)
										setTextTrigger(null)
									}}
									isMenuOpen={activeTrigger !== null}
									hasInsertActions={hasInsertActions}
								/>
							</div>
						</LexicalComposer>

						{activeTrigger !== null && filteredActions.length > 0 && (
							<div className="absolute right-2 bottom-2 left-2 z-10">
								<Command className="border-border/70 bg-background text-foreground shadow-sm">
									<CommandList>
										{filteredActions.map(action => (
											<CommandItem
												key={action.id}
												value={action.id}
												onSelect={() => handleActionSelect(action)}
												className="flex items-start gap-2 px-3 py-2 text-left"
											>
												<div className="flex min-w-0 flex-col">
													<span className="font-medium leading-tight">{action.title}</span>
													<span className="text-[12px] text-muted-foreground leading-tight">{action.description}</span>
												</div>
											</CommandItem>
										))}
									</CommandList>
								</Command>
							</div>
						)}
					</div>

					<InputGroupAddon align="block-end" className="flex items-center justify-between border-border/40 border-t">
						<div className="flex items-center gap-1">
							<Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
								<PopoverTrigger className="flex h-7 w-56 items-center justify-between border border-border/60 bg-background/60 px-2 font-mono text-[11px] text-muted-foreground shadow-none hover:bg-muted/40">
									<span className="truncate">
										{model.provider} / {model.model}
									</span>
									<ChevronsUpDownIcon className="size-3 shrink-0 opacity-50" />
								</PopoverTrigger>
								<PopoverContent className="w-56 gap-0 p-0" side="top" align="start">
									<Command>
										<CommandList>
											{pipe(
												Array.map(ProviderId.literals, provider => ({provider, models: ModelId.literals})),
												Array.map(group => (
													<CommandGroup key={group.provider} heading={group.provider}>
														{group.models.map(id => {
															const key = `${group.provider}:${id}`
															return (
																<CommandItem
																	key={key}
																	value={key}
																	onSelect={() => {
																		setModel({provider: group.provider, model: id})
																		setComboboxOpen(false)
																	}}
																>
																	<CheckIcon
																		className={cn(
																			'opacity-0',
																			model.provider === group.provider && model.model === id && 'opacity-100'
																		)}
																	/>
																	{id}
																</CommandItem>
															)
														})}
													</CommandGroup>
												))
											)}
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
						</div>

						<InputGroupButton onClick={handleSubmit} variant="default" size="icon-xs">
							<ArrowUpIcon className="size-3.5" />
						</InputGroupButton>
					</InputGroupAddon>
				</InputGroup>
			</div>
		</div>
	)
}

function readTrigger(selection: unknown): TriggerState | null {
	if (!$isRangeSelection(selection)) return null
	const anchorNode = selection.anchor.getNode()
	if (!$isTextNode(anchorNode)) return null
	const text = anchorNode.getTextContent()
	const offset = selection.anchor.offset
	const leading = text.slice(0, offset)
	const match = /([@/#])([A-Za-z0-9_-]{0,32})$/.exec(leading)
	if (match === null) return null
	const symbol = match[1]
	const query = match[2]
	if (symbol === undefined || query === undefined) return null
	if (symbol === '@') return {type: 'mention', query}
	if (symbol === '/') return {type: 'command', query}
	return {type: 'tag', query}
}

function AutoFocusPlugin() {
	const [editor] = useLexicalComposerContext()
	useEffect(() => {
		editor.focus()
	}, [editor])
	return null
}

type HotkeyPluginProps = {
	onSubmit: () => void
	onOpenInsertMenu: () => void
	onCloseMenu: () => void
	isMenuOpen: boolean
	hasInsertActions: boolean
}

function HotkeyPlugin(props: HotkeyPluginProps) {
	const [editor] = useLexicalComposerContext()
	useEffect(() => {
		return mergeRegister(
			editor.registerCommand(
				KEY_ENTER_COMMAND,
				event => {
					if (event?.shiftKey) return false
					if (props.isMenuOpen) return false
					if (event) event.preventDefault()
					props.onSubmit()
					return true
				},
				COMMAND_PRIORITY_LOW
			),
			editor.registerCommand(
				KEY_DOWN_COMMAND,
				event => {
					if (!event) return false
					if (event.key === 'Escape') {
						props.onCloseMenu()
						return false
					}
					if (props.hasInsertActions && event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
						event.preventDefault()
						props.onOpenInsertMenu()
						return true
					}
					return false
				},
				COMMAND_PRIORITY_LOW
			)
		)
	}, [
		editor,
		props.hasInsertActions,
		props.isMenuOpen,
		props.onCloseMenu,
		props.onOpenInsertMenu,
		props.onSubmit,
		props
	])
	return null
}
