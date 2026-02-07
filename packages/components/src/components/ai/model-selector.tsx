import {Array as EffectArray} from 'effect'

import {type Model, ModelId, ProviderId} from '@ai-toolkit/ai'
import {CheckIcon, ChevronsUpDownIcon} from '@ai-toolkit/components/icons'
import {Command, CommandGroup, CommandInput, CommandItem, CommandList} from '@ai-toolkit/components/ui/command'
import {Popover, PopoverContent, PopoverTrigger} from '@ai-toolkit/components/ui/popover'
import {useState} from 'react'

import {cn} from '#lib/utils.ts'

export namespace ModelSelector {
	export type Props = {
		model: Model
		onModelChange: (model: Model) => void
	}
}

export function ModelSelector(props: ModelSelector.Props) {
	const [open, setOpen] = useState(false)
	const groups = EffectArray.map(ProviderId.literals, provider => ({provider, models: ModelId.literals}))

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger className="flex h-7 w-56 items-center justify-between border border-border/60 bg-background/60 px-2 font-mono text-[11px] text-muted-foreground shadow-none hover:bg-muted/40">
				<span className="truncate">
					{props.model.provider} / {props.model.model}
				</span>
				<ChevronsUpDownIcon className="size-3 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent className="w-56 gap-0 p-0" side="top" align="start">
				<Command>
					<CommandInput placeholder="Search models..." />
					<CommandList>
						{groups.map(group => (
							<CommandGroup key={group.provider} heading={group.provider}>
								{group.models.map(modelId => {
									const key = `${group.provider}:${modelId}`
									const isSelected = props.model.provider === group.provider && props.model.model === modelId
									return (
										<CommandItem
											key={key}
											value={key}
											onSelect={() => {
												props.onModelChange({provider: group.provider, model: modelId})
												setOpen(false)
											}}
										>
											<CheckIcon className={cn('opacity-0', isSelected && 'opacity-100')} />
											{modelId}
										</CommandItem>
									)
								})}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}
