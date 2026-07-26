'use client'

import * as CommandPrimitive from 'cmdk'
import * as EffectRecord from 'effect/Record'
import {CheckIcon, SearchIcon} from 'lucide-react'
import type * as React from 'react'

import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '#components/ui/dialog.tsx'
import {InputGroup, InputGroupAddon} from '#components/ui/input-group.tsx'
import {cn} from '#lib/utils.ts'
function Command(input: React.ComponentProps<typeof CommandPrimitive.Command>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<CommandPrimitive.Command
			data-slot="command"
			className={cn(
				'bg-popover text-popover-foreground flex size-full flex-col overflow-hidden rounded-none',
				input.className
			)}
			{...props}
		/>
	)
}
function CommandDialog(
	input: Omit<React.ComponentProps<typeof Dialog>, 'children'> & {
		title?: string
		description?: string
		className?: string
		showCloseButton?: boolean
		children: React.ReactNode
	}
) {
	const props = EffectRecord.remove('showCloseButton')(
		EffectRecord.remove('className')(
			EffectRecord.remove('children')(EffectRecord.remove('description')(EffectRecord.remove('title')(input)))
		)
	)
	return (
		<Dialog {...props}>
			<DialogContent
				className={cn('top-1/3 translate-y-0 overflow-hidden rounded-none p-0', input.className)}
				showCloseButton={input.showCloseButton ?? false}
			>
				<DialogHeader className="sr-only">
					<DialogTitle>{input.title ?? 'Command Palette'}</DialogTitle>
					<DialogDescription>{input.description ?? 'Search for a command to run...'}</DialogDescription>
				</DialogHeader>
				{input.children}
			</DialogContent>
		</Dialog>
	)
}
function CommandInput(input: React.ComponentProps<typeof CommandPrimitive.Command.Input>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<div data-slot="command-input-wrapper" className="border-b pb-0">
			<InputGroup className="border-input/30 bg-input/30 h-8 border-none shadow-none! *:data-[slot=input-group-addon]:pl-2!">
				<CommandPrimitive.Command.Input
					data-slot="command-input"
					className={cn(
						'w-full font-normal outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
						input.className
					)}
					{...props}
				/>
				<InputGroupAddon>
					<SearchIcon className="size-3 shrink-0 opacity-50" />
				</InputGroupAddon>
			</InputGroup>
		</div>
	)
}
function CommandList(input: React.ComponentProps<typeof CommandPrimitive.Command.List>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<CommandPrimitive.Command.List
			data-slot="command-list"
			className={cn(
				'no-scrollbar max-h-72 scroll-py-0 overflow-x-hidden overflow-y-auto outline-none',
				input.className
			)}
			{...props}
		/>
	)
}
function CommandEmpty(input: React.ComponentProps<typeof CommandPrimitive.Command.Empty>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<CommandPrimitive.Command.Empty
			data-slot="command-empty"
			className={cn('py-6 text-center font-normal', input.className)}
			{...props}
		/>
	)
}
function CommandGroup(input: React.ComponentProps<typeof CommandPrimitive.Command.Group>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<CommandPrimitive.Command.Group
			data-slot="command-group"
			className={cn(
				'text-foreground **:[[cmdk-group-heading]]:text-muted-foreground overflow-hidden font-normal **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:font-normal',
				input.className
			)}
			{...props}
		/>
	)
}
function CommandSeparator(input: React.ComponentProps<typeof CommandPrimitive.Command.Separator>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<CommandPrimitive.Command.Separator
			data-slot="command-separator"
			className={cn('bg-border -mx-1 h-px', input.className)}
			{...props}
		/>
	)
}
function CommandItem(input: React.ComponentProps<typeof CommandPrimitive.Command.Item>) {
	const props = EffectRecord.remove('children')(EffectRecord.remove('className')(input))
	return (
		<CommandPrimitive.Command.Item
			data-slot="command-item"
			className={cn(
				"group/command-item data-selected:bg-muted data-selected:text-foreground data-selected:*:[svg]:text-foreground relative flex cursor-default items-center gap-2 rounded-none px-2 py-2 font-normal outline-hidden select-none in-data-[slot=dialog-content]:rounded-none! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3",
				input.className
			)}
			{...props}
		>
			{input.children}
			<CheckIcon className="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
		</CommandPrimitive.Command.Item>
	)
}
function CommandShortcut(input: React.ComponentProps<'span'>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<span
			data-slot="command-shortcut"
			className={cn(
				'text-muted-foreground group-data-selected/command-item:text-foreground ml-auto font-normal tracking-widest',
				input.className
			)}
			{...props}
		/>
	)
}
export {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
	CommandShortcut
}
