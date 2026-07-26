import {cva} from 'class-variance-authority'
import type {VariantProps} from 'class-variance-authority'
import * as EffectRecord from 'effect/Record'
import type * as React from 'react'

import {cn} from '#lib/utils.ts'
const alertVariants = cva(
	"grid gap-0.5 rounded-none border px-2.5 py-2 text-left text-xs has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4 w-full relative group/alert",
	{
		defaultVariants: {variant: 'default'},
		variants: {
			variant: {
				default: 'bg-card text-card-foreground',
				destructive: 'text-destructive bg-card *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current'
			}
		}
	}
)
function Alert(input: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
	const props = EffectRecord.remove('variant')(EffectRecord.remove('className')(input))
	return (
		<div
			data-slot="alert"
			role="alert"
			className={cn(alertVariants({variant: input.variant}), input.className)}
			{...props}
		/>
	)
}
function AlertTitle(input: React.ComponentProps<'div'>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<div
			data-slot="alert-title"
			className={cn(
				'[&_a]:hover:text-foreground font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3',
				input.className
			)}
			{...props}
		/>
	)
}
function AlertDescription(input: React.ComponentProps<'div'>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<div
			data-slot="alert-description"
			className={cn(
				'text-muted-foreground [&_a]:hover:text-foreground text-xs/relaxed text-balance md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_p:not(:last-child)]:mb-2',
				input.className
			)}
			{...props}
		/>
	)
}
function AlertAction(input: React.ComponentProps<'div'>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<div
			data-slot="alert-action"
			className={cn('absolute top-[calc(--spacing(1.25))] right-[calc(--spacing(1.25))]', input.className)}
			{...props}
		/>
	)
}
export {Alert, AlertAction, AlertDescription, AlertTitle}
