import {Array, pipe} from 'effect'

import {type AiInput, type Model, ModelId, ProviderId} from '@ai-toolkit/ai'
import {ArrowUpIcon, CheckIcon, ChevronsUpDownIcon} from '@ai-toolkit/components/icons'
import {Command, CommandGroup, CommandInput, CommandItem, CommandList} from '@ai-toolkit/components/ui/command'
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea} from '@ai-toolkit/components/ui/input-group'
import {Popover, PopoverContent, PopoverTrigger} from '@ai-toolkit/components/ui/popover'
import {useState} from 'react'

type ChatInputProps = {
	onSubmit: (input: AiInput) => void
	placeholder?: string
}

export function ChatInput(props: ChatInputProps) {
	const [prompt, setPrompt] = useState('')
	const [model, setModel] = useState<Model>({provider: 'opencode_zen', model: 'kimi-k2.5-free'})
	const [comboboxOpen, setComboboxOpen] = useState(false)

	function handleSubmit() {
		if (!prompt.trim()) return
		props.onSubmit({prompt, model})
		setPrompt('')
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault()
			handleSubmit()
		}
	}

	return (
		<div className="border-border/60 border-t bg-background">
			<div className="px-3 py-3">
				<InputGroup className="h-auto">
					<InputGroupTextarea
						placeholder={props.placeholder ?? 'Send a message...'}
						rows={3}
						value={prompt}
						onChange={event => setPrompt(event.target.value)}
						onKeyDown={handleKeyDown}
					/>

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
										<CommandInput placeholder="Search models..." />
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
																		className={`${model.provider}:${model.model}` === key ? 'opacity-100' : 'opacity-0'}
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
