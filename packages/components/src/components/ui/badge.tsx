import {mergeProps} from '@base-ui/react/merge-props'
import {useRender} from '@base-ui/react/use-render'
import {cva} from 'class-variance-authority'
import type {VariantProps} from 'class-variance-authority'
import * as EffectRecord from 'effect/Record'

import {cn} from '#lib/utils.ts'
const badgeVariants = cva(
	'h-5 gap-1 rounded-none border border-transparent px-2 py-0.5 text-xs font-medium transition-all has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:size-3! inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive overflow-hidden group/badge',
	{
		defaultVariants: {variant: 'default'},
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
				destructive:
					'bg-destructive/10 [a]:hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 text-destructive dark:bg-destructive/20',
				ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
				link: 'text-primary underline-offset-4 hover:underline',
				outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
				secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80'
			}
		}
	}
)
function Badge(input: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
	const props = EffectRecord.remove('render')(EffectRecord.remove('variant')(EffectRecord.remove('className')(input)))
	return useRender({
		defaultTagName: 'span',
		props: mergeProps<'span'>(
			{
				className: cn(
					badgeVariants({className: input.className, variant: input.variant === undefined ? 'default' : input.variant})
				)
			},
			props
		),
		render: input.render,
		state: {slot: 'badge', variant: input.variant === undefined ? 'default' : input.variant}
	})
}
export {Badge, badgeVariants}
