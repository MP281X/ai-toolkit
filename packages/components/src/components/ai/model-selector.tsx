import {Array as EffectArray} from 'effect'

import {type Model, modelCatalog} from '@ai-toolkit/ai/schema'
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
	const providers = EffectArray.dedupeWith(
		modelCatalog.map(entry => entry.id.provider),
		(left, right) => left === right
	)
	const groups = EffectArray.map(providers, provider => ({
		provider,
		models: modelCatalog.filter(entry => entry.id.provider === provider)
	}))

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
								{group.models.map(entry => {
									const key = `${entry.id.provider}:${entry.id.model}`
									const isSelected = props.model.provider === entry.id.provider && props.model.model === entry.id.model
									return (
										<CommandItem
											key={key}
											value={key}
											onSelect={() => {
												props.onModelChange({provider: entry.id.provider, model: entry.id.model})
												setOpen(false)
											}}
											className="items-start gap-2"
										>
											<CheckIcon className={cn('opacity-0', isSelected && 'opacity-100')} />
											<div className="flex flex-col gap-1">
												<span className="font-semibold text-sm">{entry.label}</span>
												<span className="text-muted-foreground text-xs">{entry.description}</span>
												<div className="flex flex-wrap gap-1">
													{entry.strengths.map(strength => (
														<span
															key={strength}
															className="rounded-sm border border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground"
														>
															{strength}
														</span>
													))}
												</div>
											</div>
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
