'use client'

import * as SelectPrimitive from '@base-ui/react/select'
import * as EffectRecord from 'effect/Record'
import {CheckIcon, ChevronDownIcon, ChevronUpIcon} from 'lucide-react'
import type * as React from 'react'

import {cn} from '#lib/utils.ts'
function Select(props: SelectPrimitive.Select.Root.Props) {
	return <SelectPrimitive.Select.Root {...props} />
}
function SelectGroup(input: SelectPrimitive.Select.Group.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<SelectPrimitive.Select.Group data-slot="select-group" className={cn('scroll-my-1', input.className)} {...props} />
	)
}
function SelectValue(input: SelectPrimitive.Select.Value.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<SelectPrimitive.Select.Value
			data-slot="select-value"
			className={cn('flex flex-1 text-left', input.className)}
			{...props}
		/>
	)
}
function SelectTrigger(input: SelectPrimitive.Select.Trigger.Props & {size?: 'sm' | 'default'}) {
	const props = EffectRecord.remove('children')(EffectRecord.remove('size')(EffectRecord.remove('className')(input)))
	return (
		<SelectPrimitive.Select.Trigger
			data-slot="select-trigger"
			data-size={input.size ?? 'default'}
			className={cn(
				"border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-1.5 rounded-none border bg-transparent py-2 pr-2 pl-2.5 text-xs whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-1 data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-none *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				input.className
			)}
			{...props}
		>
			{input.children}
			<SelectPrimitive.Select.Icon
				render={<ChevronDownIcon className="text-muted-foreground pointer-events-none size-4" />}
			/>
		</SelectPrimitive.Select.Trigger>
	)
}
function SelectContent(
	input: SelectPrimitive.Select.Popup.Props &
		Pick<
			SelectPrimitive.Select.Positioner.Props,
			'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
		>
) {
	const props = EffectRecord.remove('alignItemWithTrigger')(
		EffectRecord.remove('alignOffset')(
			EffectRecord.remove('align')(
				EffectRecord.remove('sideOffset')(
					EffectRecord.remove('side')(EffectRecord.remove('children')(EffectRecord.remove('className')(input)))
				)
			)
		)
	)
	return (
		<SelectPrimitive.Select.Portal>
			<SelectPrimitive.Select.Positioner
				side={input.side ?? 'bottom'}
				sideOffset={input.sideOffset ?? 4}
				align={input.align ?? 'center'}
				alignOffset={input.alignOffset ?? 0}
				alignItemWithTrigger={input.alignItemWithTrigger ?? true}
				className="isolate z-50"
			>
				<SelectPrimitive.Select.Popup
					data-slot="select-content"
					data-align-trigger={input.alignItemWithTrigger ?? true}
					className={cn(
						'data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=inline-end]:slide-in-from-left-2 bg-popover text-popover-foreground ring-foreground/10 data-closed:animate-out data-open:animate-in relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-none shadow-md ring-1 duration-100 data-[align-trigger=true]:animate-none',
						input.className
					)}
					{...props}
				>
					<SelectScrollUpButton />
					<SelectPrimitive.Select.List>{input.children}</SelectPrimitive.Select.List>
					<SelectScrollDownButton />
				</SelectPrimitive.Select.Popup>
			</SelectPrimitive.Select.Positioner>
		</SelectPrimitive.Select.Portal>
	)
}
function SelectLabel(input: SelectPrimitive.Select.GroupLabel.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<SelectPrimitive.Select.GroupLabel
			data-slot="select-label"
			className={cn('text-muted-foreground px-2 py-2 text-xs', input.className)}
			{...props}
		/>
	)
}
function SelectItem(input: SelectPrimitive.Select.Item.Props) {
	const props = EffectRecord.remove('children')(EffectRecord.remove('className')(input))
	return (
		<SelectPrimitive.Select.Item
			data-slot="select-item"
			className={cn(
				"focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-none py-2 pr-8 pl-2 text-xs outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
				input.className
			)}
			{...props}
		>
			<SelectPrimitive.Select.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
				{input.children}
			</SelectPrimitive.Select.ItemText>
			<SelectPrimitive.Select.ItemIndicator
				render={<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />}
			>
				<CheckIcon className="pointer-events-none" />
			</SelectPrimitive.Select.ItemIndicator>
		</SelectPrimitive.Select.Item>
	)
}
function SelectSeparator(input: SelectPrimitive.Select.Separator.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<SelectPrimitive.Select.Separator
			data-slot="select-separator"
			className={cn('bg-border pointer-events-none -mx-1 h-px', input.className)}
			{...props}
		/>
	)
}
function SelectScrollUpButton(input: React.ComponentProps<typeof SelectPrimitive.Select.ScrollUpArrow>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<SelectPrimitive.Select.ScrollUpArrow
			data-slot="select-scroll-up-button"
			className={cn(
				"bg-popover top-0 z-10 flex w-full cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4",
				input.className
			)}
			{...props}
		>
			<ChevronUpIcon />
		</SelectPrimitive.Select.ScrollUpArrow>
	)
}
function SelectScrollDownButton(input: React.ComponentProps<typeof SelectPrimitive.Select.ScrollDownArrow>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<SelectPrimitive.Select.ScrollDownArrow
			data-slot="select-scroll-down-button"
			className={cn(
				"bg-popover bottom-0 z-10 flex w-full cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4",
				input.className
			)}
			{...props}
		>
			<ChevronDownIcon />
		</SelectPrimitive.Select.ScrollDownArrow>
	)
}
export {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectScrollDownButton,
	SelectScrollUpButton,
	SelectSeparator,
	SelectTrigger,
	SelectValue
}
