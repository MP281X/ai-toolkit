import {Array} from 'effect'

import {type ModelId, models, type ProviderId, providers} from '@ai-toolkit/ai/catalog'
import {CheckIcon, ChevronsUpDownIcon} from '@ai-toolkit/components/icons'
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut
} from '@ai-toolkit/components/ui/command'
import {Popover, PopoverContent, PopoverTrigger} from '@ai-toolkit/components/ui/popover'
import {useState} from 'react'

import {cn, formatPrice} from '#lib/utils.ts'

export namespace ModelSelector {
	export type Props = {
		model: {model: ModelId; provider: ProviderId}
		onModelChange: (model: {model: ModelId; provider: ProviderId}) => void
	}
}

export function ModelSelector(props: ModelSelector.Props) {
	const [open, setOpen] = useState(false)

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger className="flex h-7 w-fit max-w-72 items-center gap-2 border border-border/60 bg-background/60 px-2 font-mono text-[11px] text-muted-foreground shadow-none hover:bg-muted/40">
				<span className="flex min-w-0 items-center gap-1.5">
					<span className="shrink-0 text-muted-foreground/60">{props.model.provider}</span>
					<span className="shrink-0 text-muted-foreground/30">/</span>
					<span className="truncate text-foreground">
						{(props.model.model.includes('/')
							? props.model.model.slice(props.model.model.indexOf('/') + 1)
							: props.model.model
						)
							.replace(/:free$/, '')
							.replace(/-free$/, '')}
					</span>
				</span>
				<ChevronsUpDownIcon className="size-3 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent className="w-80 gap-0 p-0" side="top" align="start">
				<Command>
					<CommandInput placeholder="Search models..." />
					<CommandList>
						{providers.map(provider => (
							<CommandGroup key={provider.id} heading={provider.id}>
								{Array.filter(models, model => model.provider === provider.id).map(model => {
									const key = `${provider.id}:${model.model}`
									const isSelected = props.model.provider === provider.id && props.model.model === model.model
									const name = (
										model.model.includes('/') ? model.model.slice(model.model.indexOf('/') + 1) : model.model
									)
										.replace(/:free$/, '')
										.replace(/-free$/, '')

									return (
										<CommandItem
											key={key}
											value={key}
											keywords={[model.model, model.agent, provider.id, name]}
											onSelect={() => {
												props.onModelChange({model: model.model, provider: provider.id})
												setOpen(false)
											}}
										>
											<CheckIcon
												className={cn(
													'size-2.5 shrink-0 text-muted-foreground/50',
													isSelected ? 'opacity-100' : 'opacity-0'
												)}
											/>
											<div className="min-w-0 flex-1">
												<div className="truncate text-[12px] text-foreground">{name}</div>
												<div className="truncate font-mono text-[9px] text-muted-foreground/60">
													{model.agent} · {model.contextWindow.toLocaleString()} ctx
												</div>
											</div>
											<CommandShortcut className="text-[9px] text-muted-foreground/40 tracking-normal">
												{model.pricing.input === 0 && model.pricing.output === 0
													? 'free'
													: `${formatPrice(model.pricing.input)} in · ${formatPrice(model.pricing.output)} out`}
											</CommandShortcut>
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
