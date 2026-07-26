'use client'

import * as BaseUi from '@base-ui/react'
import * as EffectRecord from 'effect/Record'
import {CheckIcon, ChevronDownIcon, XIcon} from 'lucide-react'
import * as React from 'react'

import {Button} from '#components/ui/button.tsx'
import {InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput} from '#components/ui/input-group.tsx'
import {cn} from '#lib/utils.ts'
function Combobox(props: BaseUi.Combobox.Root.Props) {
	return <BaseUi.Combobox.Root {...props} />
}
function ComboboxValue(input: BaseUi.Combobox.Value.Props) {
	const props = input
	return <BaseUi.Combobox.Value data-slot="combobox-value" {...props} />
}
function ComboboxTrigger(input: BaseUi.Combobox.Trigger.Props) {
	const props = EffectRecord.remove('children')(EffectRecord.remove('className')(input))
	return (
		<BaseUi.Combobox.Trigger
			data-slot="combobox-trigger"
			className={cn("[&_svg:not([class*='size-'])]:size-4", input.className)}
			{...props}
		>
			{input.children}
			<ChevronDownIcon className="text-muted-foreground pointer-events-none size-4" />
		</BaseUi.Combobox.Trigger>
	)
}
function ComboboxClear(input: BaseUi.Combobox.Clear.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<BaseUi.Combobox.Clear
			data-slot="combobox-clear"
			render={<InputGroupButton variant="ghost" size="icon-xs" />}
			className={cn(input.className)}
			{...props}
		>
			<XIcon className="pointer-events-none" />
		</BaseUi.Combobox.Clear>
	)
}
function ComboboxInput(input: BaseUi.Combobox.Input.Props & {showTrigger?: boolean; showClear?: boolean}) {
	const props = EffectRecord.remove('showClear')(
		EffectRecord.remove('showTrigger')(
			EffectRecord.remove('disabled')(EffectRecord.remove('children')(EffectRecord.remove('className')(input)))
		)
	)
	return (
		<InputGroup className={cn('w-auto', input.className)}>
			<BaseUi.Combobox.Input render={<InputGroupInput disabled={input.disabled ?? false} />} {...props} />
			<InputGroupAddon align="inline-end">
				{(input.showTrigger ?? true) && (
					<InputGroupButton
						size="icon-xs"
						variant="ghost"
						render={<ComboboxTrigger />}
						data-slot="input-group-button"
						className="group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent"
						disabled={input.disabled ?? false}
					/>
				)}
				{(input.showClear ?? false) && <ComboboxClear disabled={input.disabled ?? false} />}
			</InputGroupAddon>
			{input.children}
		</InputGroup>
	)
}
function ComboboxContent(
	input: BaseUi.Combobox.Popup.Props &
		Pick<BaseUi.Combobox.Positioner.Props, 'side' | 'align' | 'sideOffset' | 'alignOffset' | 'anchor'>
) {
	const props = EffectRecord.remove('anchor')(
		EffectRecord.remove('alignOffset')(
			EffectRecord.remove('align')(
				EffectRecord.remove('sideOffset')(EffectRecord.remove('side')(EffectRecord.remove('className')(input)))
			)
		)
	)
	return (
		<BaseUi.Combobox.Portal>
			<BaseUi.Combobox.Positioner
				side={input.side ?? 'bottom'}
				sideOffset={input.sideOffset ?? 6}
				align={input.align ?? 'start'}
				alignOffset={input.alignOffset ?? 0}
				anchor={input.anchor}
				className="isolate z-50"
			>
				<BaseUi.Combobox.Popup
					data-slot="combobox-content"
					data-chips={input.anchor !== undefined}
					className={cn(
						'group/combobox-content bg-popover text-popover-foreground ring-foreground/10 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 *:data-[slot=input-group]:border-input/30 *:data-[slot=input-group]:bg-input/30 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-[calc(var(--anchor-width)+--spacing(7))] origin-(--transform-origin) overflow-hidden rounded-none shadow-md ring-1 duration-100 data-[chips=true]:min-w-(--anchor-width) *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:shadow-none',
						input.className
					)}
					{...props}
				/>
			</BaseUi.Combobox.Positioner>
		</BaseUi.Combobox.Portal>
	)
}
function ComboboxList(input: BaseUi.Combobox.List.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<BaseUi.Combobox.List
			data-slot="combobox-list"
			className={cn(
				'no-scrollbar max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] scroll-py-1 overflow-y-auto overscroll-contain data-empty:p-0',
				input.className
			)}
			{...props}
		/>
	)
}
function ComboboxItem(input: BaseUi.Combobox.Item.Props) {
	const props = EffectRecord.remove('children')(EffectRecord.remove('className')(input))
	return (
		<BaseUi.Combobox.Item
			data-slot="combobox-item"
			className={cn(
				"data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-none py-2 pr-8 pl-2 text-xs outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				input.className
			)}
			{...props}
		>
			{input.children}
			<BaseUi.Combobox.ItemIndicator
				render={<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />}
			>
				<CheckIcon className="pointer-events-none" />
			</BaseUi.Combobox.ItemIndicator>
		</BaseUi.Combobox.Item>
	)
}
function ComboboxGroup(input: BaseUi.Combobox.Group.Props) {
	const props = EffectRecord.remove('className')(input)
	return <BaseUi.Combobox.Group data-slot="combobox-group" className={cn(input.className)} {...props} />
}
function ComboboxLabel(input: BaseUi.Combobox.GroupLabel.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<BaseUi.Combobox.GroupLabel
			data-slot="combobox-label"
			className={cn('text-muted-foreground px-2 py-2 text-xs', input.className)}
			{...props}
		/>
	)
}
function ComboboxCollection(input: BaseUi.Combobox.Collection.Props) {
	const props = input
	return <BaseUi.Combobox.Collection data-slot="combobox-collection" {...props} />
}
function ComboboxEmpty(input: BaseUi.Combobox.Empty.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<BaseUi.Combobox.Empty
			data-slot="combobox-empty"
			className={cn(
				'text-muted-foreground hidden w-full justify-center py-2 text-center text-xs group-data-empty/combobox-content:flex',
				input.className
			)}
			{...props}
		/>
	)
}
function ComboboxSeparator(input: BaseUi.Combobox.Separator.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<BaseUi.Combobox.Separator
			data-slot="combobox-separator"
			className={cn('bg-border -mx-1 h-px', input.className)}
			{...props}
		/>
	)
}
function ComboboxChips(input: React.ComponentPropsWithRef<typeof BaseUi.Combobox.Chips> & BaseUi.Combobox.Chips.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<BaseUi.Combobox.Chips
			data-slot="combobox-chips"
			className={cn(
				'border-input focus-within:border-ring focus-within:ring-ring/50 has-aria-invalid:border-destructive has-aria-invalid:ring-destructive/20 dark:bg-input/30 dark:has-aria-invalid:border-destructive/50 dark:has-aria-invalid:ring-destructive/40 flex min-h-8 flex-wrap items-center gap-1 rounded-none border bg-transparent bg-clip-padding px-2.5 py-1 text-xs transition-colors focus-within:ring-1 has-aria-invalid:ring-1 has-data-[slot=combobox-chip]:px-1',
				input.className
			)}
			{...props}
		/>
	)
}
function ComboboxChip(input: BaseUi.Combobox.Chip.Props & {showRemove?: boolean}) {
	const props = EffectRecord.remove('showRemove')(
		EffectRecord.remove('children')(EffectRecord.remove('className')(input))
	)
	return (
		<BaseUi.Combobox.Chip
			data-slot="combobox-chip"
			className={cn(
				'bg-muted text-foreground flex h-[calc(--spacing(5.25))] w-fit items-center justify-center gap-1 rounded-none px-1.5 text-xs font-medium whitespace-nowrap has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50 has-data-[slot=combobox-chip-remove]:pr-0',
				input.className
			)}
			{...props}
		>
			{input.children}
			{(input.showRemove ?? true) && (
				<BaseUi.Combobox.ChipRemove
					render={<Button variant="ghost" size="icon-xs" />}
					className="-ml-1 opacity-50 hover:opacity-100"
					data-slot="combobox-chip-remove"
				>
					<XIcon className="pointer-events-none" />
				</BaseUi.Combobox.ChipRemove>
			)}
		</BaseUi.Combobox.Chip>
	)
}
function ComboboxChipsInput(input: BaseUi.Combobox.Input.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<BaseUi.Combobox.Input
			data-slot="combobox-chip-input"
			className={cn('min-w-16 flex-1 outline-none', input.className)}
			{...props}
		/>
	)
}
function useComboboxAnchor() {
	return React.useRef<HTMLDivElement | null>(null)
}
export {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxCollection,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxGroup,
	ComboboxInput,
	ComboboxItem,
	ComboboxLabel,
	ComboboxList,
	ComboboxSeparator,
	ComboboxTrigger,
	ComboboxValue,
	useComboboxAnchor
}
