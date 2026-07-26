'use client'

import {Array} from 'effect'

import {cva} from 'class-variance-authority'
import type {VariantProps} from 'class-variance-authority'
import * as EffectRecord from 'effect/Record'
import type * as React from 'react'

import {Label} from '#components/ui/label.tsx'
import {Separator} from '#components/ui/separator.tsx'
import {cn, formatError} from '#lib/utils.ts'
function FieldSet(input: React.ComponentProps<'fieldset'>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<fieldset
			data-slot="field-set"
			className={cn(
				'flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3',
				input.className
			)}
			{...props}
		/>
	)
}
function FieldLegend(input: React.ComponentProps<'legend'> & {variant?: 'legend' | 'label'}) {
	const props = EffectRecord.remove('variant')(EffectRecord.remove('className')(input))
	return (
		<legend
			data-slot="field-legend"
			data-variant={input.variant ?? 'legend'}
			className={cn('mb-2.5 font-medium data-[variant=label]:text-xs data-[variant=legend]:text-sm', input.className)}
			{...props}
		/>
	)
}
function FieldGroup(input: React.ComponentProps<'div'>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<div
			data-slot="field-group"
			className={cn(
				'group/field-group @container/field-group flex w-full flex-col gap-5 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4',
				input.className
			)}
			{...props}
		/>
	)
}
const fieldVariants = cva('group/field flex w-full gap-2 data-[invalid=true]:text-destructive', {
	defaultVariants: {orientation: 'vertical'},
	variants: {
		orientation: {
			horizontal:
				'flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
			responsive:
				'flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
			vertical: 'flex-col *:w-full [&>.sr-only]:w-auto'
		}
	}
})
function Field(input: React.ComponentProps<'div'> & VariantProps<typeof fieldVariants>) {
	const props = EffectRecord.remove('orientation')(EffectRecord.remove('className')(input))
	return (
		<div
			role="group"
			data-slot="field"
			data-orientation={input.orientation === undefined ? 'vertical' : input.orientation}
			className={cn(
				fieldVariants({orientation: input.orientation === undefined ? 'vertical' : input.orientation}),
				input.className
			)}
			{...props}
		/>
	)
}
function FieldContent(input: React.ComponentProps<'div'>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<div
			data-slot="field-content"
			className={cn('group/field-content flex flex-1 flex-col gap-0.5 leading-snug', input.className)}
			{...props}
		/>
	)
}
function FieldLabel(input: React.ComponentProps<typeof Label>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<Label
			data-slot="field-label"
			className={cn(
				'group/field-label peer/field-label has-data-checked:border-primary/30 has-data-checked:bg-primary/5 dark:has-data-checked:border-primary/20 dark:has-data-checked:bg-primary/10 flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50 has-[>[data-slot=field]]:rounded-none has-[>[data-slot=field]]:border *:data-[slot=field]:p-2',
				'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col',
				input.className
			)}
			{...props}
		/>
	)
}
function FieldTitle(input: React.ComponentProps<'div'>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<div
			data-slot="field-label"
			className={cn(
				'flex w-fit items-center gap-2 text-xs/relaxed leading-snug group-data-[disabled=true]/field:opacity-50',
				input.className
			)}
			{...props}
		/>
	)
}
function FieldDescription(input: React.ComponentProps<'p'>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<p
			data-slot="field-description"
			className={cn(
				'text-muted-foreground text-left text-xs/relaxed leading-normal font-normal group-has-data-horizontal/field:text-balance [[data-variant=legend]+&]:-mt-1.5',
				'last:mt-0 nth-last-2:-mt-1',
				'[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4',
				input.className
			)}
			{...props}
		/>
	)
}
function FieldSeparator(input: React.ComponentProps<'div'> & {children?: React.ReactNode}) {
	const props = EffectRecord.remove('className')(EffectRecord.remove('children')(input))
	return (
		<div
			data-slot="field-separator"
			data-content={input.children !== undefined && input.children !== null}
			className={cn('relative -my-2 h-5 text-xs group-data-[variant=outline]/field-group:-mb-2', input.className)}
			{...props}
		>
			<Separator className="absolute inset-0 top-1/2" />
			{input.children !== undefined && input.children !== null && (
				<span
					className="bg-background text-muted-foreground relative mx-auto block w-fit px-2"
					data-slot="field-separator-content"
				>
					{input.children}
				</span>
			)}
		</div>
	)
}
function FieldError(input: React.ComponentProps<'div'> & {errors?: ({message?: string} | undefined)[]}) {
	const props = EffectRecord.remove('errors')(EffectRecord.remove('children')(EffectRecord.remove('className')(input)))
	if (Array.isArrayEmpty(input.errors ?? [])) return null
	return (
		<div
			role="alert"
			data-slot="field-error"
			className={cn('text-destructive text-xs font-normal', input.className)}
			{...props}
		>
			<ul className="ml-4 flex list-disc flex-col gap-1">
				{input.errors?.map(error => (
					<li key={error?.message}>{formatError(error)}</li>
				))}
			</ul>
		</div>
	)
}
export {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSeparator,
	FieldSet,
	FieldTitle
}
