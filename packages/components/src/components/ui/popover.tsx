import * as PopoverPrimitive from '@base-ui/react/popover'
import * as EffectRecord from 'effect/Record'
import type * as React from 'react'

import {cn} from '#lib/utils.ts'
function Popover(input: PopoverPrimitive.Popover.Root.Props) {
	const props = input
	return <PopoverPrimitive.Popover.Root data-slot="popover" {...props} />
}
function PopoverTrigger(input: PopoverPrimitive.Popover.Trigger.Props) {
	const props = input
	return <PopoverPrimitive.Popover.Trigger data-slot="popover-trigger" {...props} />
}
function PopoverContent(
	input: PopoverPrimitive.Popover.Popup.Props &
		Pick<PopoverPrimitive.Popover.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>
) {
	const props = EffectRecord.remove('sideOffset')(
		EffectRecord.remove('side')(
			EffectRecord.remove('alignOffset')(EffectRecord.remove('align')(EffectRecord.remove('className')(input)))
		)
	)
	return (
		<PopoverPrimitive.Popover.Portal>
			<PopoverPrimitive.Popover.Positioner
				align={input.align ?? 'center'}
				alignOffset={input.alignOffset ?? 0}
				side={input.side ?? 'bottom'}
				sideOffset={input.sideOffset ?? 4}
				className="isolate z-50"
			>
				<PopoverPrimitive.Popover.Popup
					data-slot="popover-content"
					className={cn(
						'data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=inline-end]:slide-in-from-left-2 bg-popover text-popover-foreground ring-foreground/10 data-closed:animate-out data-open:animate-in z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-none p-2.5 text-xs shadow-md ring-1 outline-hidden duration-100',
						input.className
					)}
					{...props}
				/>
			</PopoverPrimitive.Popover.Positioner>
		</PopoverPrimitive.Popover.Portal>
	)
}
function PopoverHeader(input: React.ComponentProps<'div'>) {
	const props = EffectRecord.remove('className')(input)
	return <div data-slot="popover-header" className={cn('flex flex-col gap-1 text-xs', input.className)} {...props} />
}
function PopoverTitle(input: PopoverPrimitive.Popover.Title.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<PopoverPrimitive.Popover.Title
			data-slot="popover-title"
			className={cn('text-sm font-medium', input.className)}
			{...props}
		/>
	)
}
function PopoverDescription(input: PopoverPrimitive.Popover.Description.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<PopoverPrimitive.Popover.Description
			data-slot="popover-description"
			className={cn('text-muted-foreground text-xs/relaxed', input.className)}
			{...props}
		/>
	)
}
export {Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger}
