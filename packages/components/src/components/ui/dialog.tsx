'use client'

import * as DialogPrimitive from '@base-ui/react/dialog'
import * as EffectRecord from 'effect/Record'
import {XIcon} from 'lucide-react'
import type * as React from 'react'

import {Button} from '#components/ui/button.tsx'
import {cn} from '#lib/utils.ts'
function Dialog(input: DialogPrimitive.Dialog.Root.Props) {
	const props = input
	return <DialogPrimitive.Dialog.Root data-slot="dialog" {...props} />
}
function DialogTrigger(input: DialogPrimitive.Dialog.Trigger.Props) {
	const props = input
	return <DialogPrimitive.Dialog.Trigger data-slot="dialog-trigger" {...props} />
}
function DialogPortal(input: DialogPrimitive.Dialog.Portal.Props) {
	const props = input
	return <DialogPrimitive.Dialog.Portal data-slot="dialog-portal" {...props} />
}
function DialogClose(input: DialogPrimitive.Dialog.Close.Props) {
	const props = input
	return <DialogPrimitive.Dialog.Close data-slot="dialog-close" {...props} />
}
function DialogOverlay(input: DialogPrimitive.Dialog.Backdrop.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<DialogPrimitive.Dialog.Backdrop
			data-slot="dialog-overlay"
			className={cn(
				'data-closed:fade-out-0 data-open:fade-in-0 data-closed:animate-out data-open:animate-in fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs',
				input.className
			)}
			{...props}
		/>
	)
}
function DialogContent(input: DialogPrimitive.Dialog.Popup.Props & {showCloseButton?: boolean}) {
	const props = EffectRecord.remove('showCloseButton')(
		EffectRecord.remove('children')(EffectRecord.remove('className')(input))
	)
	return (
		<DialogPortal>
			<DialogOverlay />
			<DialogPrimitive.Dialog.Popup
				data-slot="dialog-content"
				className={cn(
					'data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 bg-background ring-foreground/10 data-closed:animate-out data-open:animate-in fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-none p-4 leading-relaxed font-normal ring-1 duration-100 outline-none sm:max-w-sm',
					input.className
				)}
				{...props}
			>
				{input.children}
				{(input.showCloseButton ?? true) && (
					<DialogPrimitive.Dialog.Close
						data-slot="dialog-close"
						render={<Button variant="ghost" className="absolute top-2 right-2" size="icon-sm" />}
					>
						<XIcon />
						<span className="sr-only">Close</span>
					</DialogPrimitive.Dialog.Close>
				)}
			</DialogPrimitive.Dialog.Popup>
		</DialogPortal>
	)
}
function DialogHeader(input: React.ComponentProps<'div'>) {
	const props = EffectRecord.remove('className')(input)
	return <div data-slot="dialog-header" className={cn('flex flex-col gap-1 text-left', input.className)} {...props} />
}
function DialogFooter(input: React.ComponentProps<'div'> & {showCloseButton?: boolean}) {
	const props = EffectRecord.remove('children')(
		EffectRecord.remove('showCloseButton')(EffectRecord.remove('className')(input))
	)
	return (
		<div
			data-slot="dialog-footer"
			className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', input.className)}
			{...props}
		>
			{input.children}
			{(input.showCloseButton ?? false) && (
				<DialogPrimitive.Dialog.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Dialog.Close>
			)}
		</div>
	)
}
function DialogTitle(input: DialogPrimitive.Dialog.Title.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<DialogPrimitive.Dialog.Title data-slot="dialog-title" className={cn('font-normal', input.className)} {...props} />
	)
}
function DialogDescription(input: DialogPrimitive.Dialog.Description.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<DialogPrimitive.Dialog.Description
			data-slot="dialog-description"
			className={cn(
				'text-muted-foreground *:[a]:hover:text-foreground leading-relaxed font-normal *:[a]:underline *:[a]:underline-offset-3',
				input.className
			)}
			{...props}
		/>
	)
}
export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger
}
