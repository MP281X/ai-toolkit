import {type ModelId, offerings, type ProviderId, providers} from '@ai-toolkit/ai/catalog'
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

import {formatPrice} from '#lib/utils.ts'

function formatModelName(modelId: ModelId) {
	const hasOrg = modelId.includes('/')
	const rest = hasOrg ? modelId.slice(modelId.indexOf('/') + 1) : modelId
	return rest.replace(/:free$/, '').replace(/-free$/, '')
}

function formatPricing(pricing: {input: number; output: number}) {
	if (pricing.input === 0 && pricing.output === 0) return 'free'
	return `${formatPrice(pricing.input)} in · ${formatPrice(pricing.output)} out`
}

export namespace ModelSelector {
	export type Props = {
		model: {model: ModelId; provider: ProviderId}
		onModelChange: (model: {model: ModelId; provider: ProviderId}) => void
	}
}

export function ModelSelector(props: ModelSelector.Props) {
	const [open, setOpen] = useState(false)
	const groups = providers.map(provider => ({
		provider: provider.id,
		models: offerings.filter(o => o.provider === provider.id)
	}))

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger className="flex h-7 w-fit max-w-72 items-center gap-2 border border-border/60 bg-background/60 px-2 font-mono text-[11px] text-muted-foreground shadow-none hover:bg-muted/40">
				<span className="flex min-w-0 items-center gap-1.5">
					<span className="shrink-0 text-muted-foreground/60">{props.model.provider}</span>
					<span className="shrink-0 text-muted-foreground/30">/</span>
					<span className="truncate text-foreground">{formatModelName(props.model.model)}</span>
				</span>
				<ChevronsUpDownIcon className="size-3 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent className="w-72 gap-0 p-0" side="top" align="start">
				<Command>
					<CommandInput placeholder="Search models..." />
					<CommandList>
						{groups.map(group => (
							<CommandGroup key={group.provider} heading={group.provider}>
								{group.models.map(pm => {
									const key = `${group.provider}:${pm.model}`
									const isSelected = props.model.provider === group.provider && props.model.model === pm.model
									const name = formatModelName(pm.model)
									return (
										<CommandItem
											key={key}
											value={key}
											keywords={[pm.model, group.provider, name]}
											onSelect={() => {
												props.onModelChange({provider: group.provider, model: pm.model})
												setOpen(false)
											}}
										>
											<CheckIcon
												className={`size-2.5 shrink-0 text-muted-foreground/50 ${isSelected ? 'opacity-100' : 'opacity-0'}`}
											/>
											<span className="min-w-0 flex-1 truncate">{name}</span>
											<CommandShortcut className="text-[9px] text-muted-foreground/40 tracking-normal">
												{formatPricing(pm.pricing)}
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
