import * as MenuPrimitive from '@base-ui/react/menu'
import * as EffectRecord from 'effect/Record'
import {CheckIcon, ChevronRightIcon} from 'lucide-react'
import * as React from 'react'

import {cn} from '#lib/utils.ts'
function DropdownMenu(input: MenuPrimitive.Menu.Root.Props) {
	const props = input
	return <MenuPrimitive.Menu.Root data-slot="dropdown-menu" {...props} />
}
function DropdownMenuPortal(input: MenuPrimitive.Menu.Portal.Props) {
	const props = input
	return <MenuPrimitive.Menu.Portal data-slot="dropdown-menu-portal" {...props} />
}
function DropdownMenuTrigger(input: MenuPrimitive.Menu.Trigger.Props) {
	const props = input
	return <MenuPrimitive.Menu.Trigger data-slot="dropdown-menu-trigger" {...props} />
}
function DropdownMenuContent(
	input: MenuPrimitive.Menu.Popup.Props &
		Pick<MenuPrimitive.Menu.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>
) {
	const props = EffectRecord.remove('className')(
		EffectRecord.remove('sideOffset')(
			EffectRecord.remove('side')(EffectRecord.remove('alignOffset')(EffectRecord.remove('align')(input)))
		)
	)
	return (
		<MenuPrimitive.Menu.Portal>
			<MenuPrimitive.Menu.Positioner
				className="isolate z-50 outline-none"
				align={input.align ?? 'start'}
				alignOffset={input.alignOffset ?? 0}
				side={input.side ?? 'bottom'}
				sideOffset={input.sideOffset ?? 4}
			>
				<MenuPrimitive.Menu.Popup
					data-slot="dropdown-menu-content"
					className={cn(
						'bg-popover text-popover-foreground ring-foreground/10 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-none shadow-md ring-1 duration-100 outline-none data-closed:overflow-hidden',
						input.className
					)}
					{...props}
				/>
			</MenuPrimitive.Menu.Positioner>
		</MenuPrimitive.Menu.Portal>
	)
}
function DropdownMenuGroup(input: MenuPrimitive.Menu.Group.Props) {
	const props = input
	return <MenuPrimitive.Menu.Group data-slot="dropdown-menu-group" {...props} />
}
function DropdownMenuLabel(input: MenuPrimitive.Menu.GroupLabel.Props & {inset?: boolean}) {
	const props = EffectRecord.remove('inset')(EffectRecord.remove('className')(input))
	return (
		<MenuPrimitive.Menu.GroupLabel
			data-slot="dropdown-menu-label"
			data-inset={input.inset}
			className={cn('text-muted-foreground px-2 py-2 text-xs data-inset:pl-7', input.className)}
			{...props}
		/>
	)
}
function DropdownMenuItem(
	input: MenuPrimitive.Menu.Item.Props & {inset?: boolean; variant?: 'default' | 'destructive'}
) {
	const props = EffectRecord.remove('variant')(EffectRecord.remove('inset')(EffectRecord.remove('className')(input)))
	return (
		<MenuPrimitive.Menu.Item
			data-slot="dropdown-menu-item"
			data-inset={input.inset}
			data-variant={input.variant ?? 'default'}
			className={cn(
				"group/dropdown-menu-item focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:*:[svg]:text-destructive relative flex cursor-default items-center gap-2 rounded-none px-2 py-2 text-xs outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				input.className
			)}
			{...props}
		/>
	)
}
function DropdownMenuSub(input: MenuPrimitive.Menu.SubmenuRoot.Props) {
	const props = input
	return <MenuPrimitive.Menu.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}
function DropdownMenuSubTrigger(input: MenuPrimitive.Menu.SubmenuTrigger.Props & {inset?: boolean}) {
	const props = EffectRecord.remove('children')(EffectRecord.remove('inset')(EffectRecord.remove('className')(input)))
	return (
		<MenuPrimitive.Menu.SubmenuTrigger
			data-slot="dropdown-menu-sub-trigger"
			data-inset={input.inset}
			className={cn(
				"focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground flex cursor-default items-center gap-2 rounded-none px-2 py-2 text-xs outline-hidden select-none data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				input.className
			)}
			{...props}
		>
			{input.children}
			<ChevronRightIcon className="ml-auto" />
		</MenuPrimitive.Menu.SubmenuTrigger>
	)
}
function DropdownMenuSubContent(input: React.ComponentProps<typeof DropdownMenuContent>) {
	const props = EffectRecord.remove('className')(
		EffectRecord.remove('sideOffset')(
			EffectRecord.remove('side')(EffectRecord.remove('alignOffset')(EffectRecord.remove('align')(input)))
		)
	)
	return (
		<DropdownMenuContent
			data-slot="dropdown-menu-sub-content"
			className={cn(
				'bg-popover text-popover-foreground ring-foreground/10 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 w-auto min-w-[96px] rounded-none shadow-lg ring-1 duration-100',
				input.className
			)}
			align={input.align ?? 'start'}
			alignOffset={input.alignOffset ?? -3}
			side={input.side ?? 'right'}
			sideOffset={input.sideOffset ?? 0}
			{...props}
		/>
	)
}
function DropdownMenuCheckboxItem(input: MenuPrimitive.Menu.CheckboxItem.Props & {inset?: boolean}) {
	const props = EffectRecord.remove('inset')(
		EffectRecord.remove('checked')(EffectRecord.remove('children')(EffectRecord.remove('className')(input)))
	)
	return (
		<MenuPrimitive.Menu.CheckboxItem
			data-slot="dropdown-menu-checkbox-item"
			data-inset={input.inset}
			className={cn(
				"focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-none py-2 pr-8 pl-2 text-xs outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				input.className
			)}
			checked={input.checked}
			{...props}
		>
			<span
				className="pointer-events-none absolute right-2 flex items-center justify-center"
				data-slot="dropdown-menu-checkbox-item-indicator"
			>
				<MenuPrimitive.Menu.CheckboxItemIndicator>
					<CheckIcon />
				</MenuPrimitive.Menu.CheckboxItemIndicator>
			</span>
			{input.children}
		</MenuPrimitive.Menu.CheckboxItem>
	)
}
function DropdownMenuRadioGroup(input: MenuPrimitive.Menu.RadioGroup.Props) {
	const props = input
	return <MenuPrimitive.Menu.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}
function DropdownMenuRadioItem(input: MenuPrimitive.Menu.RadioItem.Props & {inset?: boolean}) {
	const props = EffectRecord.remove('inset')(EffectRecord.remove('children')(EffectRecord.remove('className')(input)))
	return (
		<MenuPrimitive.Menu.RadioItem
			data-slot="dropdown-menu-radio-item"
			data-inset={input.inset}
			className={cn(
				"focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-none py-2 pr-8 pl-2 text-xs outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-7 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				input.className
			)}
			{...props}
		>
			<span
				className="pointer-events-none absolute right-2 flex items-center justify-center"
				data-slot="dropdown-menu-radio-item-indicator"
			>
				<MenuPrimitive.Menu.RadioItemIndicator>
					<CheckIcon />
				</MenuPrimitive.Menu.RadioItemIndicator>
			</span>
			{input.children}
		</MenuPrimitive.Menu.RadioItem>
	)
}
function DropdownMenuSeparator(input: MenuPrimitive.Menu.Separator.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<MenuPrimitive.Menu.Separator
			data-slot="dropdown-menu-separator"
			className={cn('bg-border -mx-1 h-px', input.className)}
			{...props}
		/>
	)
}
function DropdownMenuShortcut(input: React.ComponentProps<'span'>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<span
			data-slot="dropdown-menu-shortcut"
			className={cn(
				'text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground ml-auto text-xs tracking-widest',
				input.className
			)}
			{...props}
		/>
	)
}
export {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger
}
