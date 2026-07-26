'use client'

import * as AccordionPrimitive from '@base-ui/react/accordion'
import * as EffectRecord from 'effect/Record'
import {ChevronDownIcon, ChevronUpIcon} from 'lucide-react'

import {cn} from '#lib/utils.ts'
function Accordion(input: AccordionPrimitive.Accordion.Root.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<AccordionPrimitive.Accordion.Root
			data-slot="accordion"
			className={cn('flex w-full flex-col', input.className)}
			{...props}
		/>
	)
}
function AccordionItem(input: AccordionPrimitive.Accordion.Item.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<AccordionPrimitive.Accordion.Item
			data-slot="accordion-item"
			className={cn('not-last:border-b', input.className)}
			{...props}
		/>
	)
}
function AccordionTrigger(input: AccordionPrimitive.Accordion.Trigger.Props) {
	const props = EffectRecord.remove('children')(EffectRecord.remove('className')(input))
	return (
		<AccordionPrimitive.Accordion.Header className="flex">
			<AccordionPrimitive.Accordion.Trigger
				data-slot="accordion-trigger"
				className={cn(
					'group/accordion-trigger focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:after:border-ring **:data-[slot=accordion-trigger-icon]:text-muted-foreground relative flex flex-1 items-start justify-between rounded-none border border-transparent py-2.5 text-left text-xs font-medium transition-all outline-none hover:underline focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4',
					input.className
				)}
				{...props}
			>
				{input.children}
				<ChevronDownIcon
					data-slot="accordion-trigger-icon"
					className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden"
				/>
				<ChevronUpIcon
					data-slot="accordion-trigger-icon"
					className="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline"
				/>
			</AccordionPrimitive.Accordion.Trigger>
		</AccordionPrimitive.Accordion.Header>
	)
}
function AccordionContent(input: AccordionPrimitive.Accordion.Panel.Props) {
	const props = EffectRecord.remove('children')(EffectRecord.remove('className')(input))
	return (
		<AccordionPrimitive.Accordion.Panel
			data-slot="accordion-content"
			className="data-closed:animate-accordion-up data-open:animate-accordion-down overflow-hidden text-xs"
			{...props}
		>
			<div
				className={cn(
					'[&_a]:hover:text-foreground h-(--accordion-panel-height) pt-0 pb-2.5 data-ending-style:h-0 data-starting-style:h-0 [&_a]:underline [&_a]:underline-offset-3 [&_p:not(:last-child)]:mb-4',
					input.className
				)}
			>
				{input.children}
			</div>
		</AccordionPrimitive.Accordion.Panel>
	)
}
export {Accordion, AccordionContent, AccordionItem, AccordionTrigger}
