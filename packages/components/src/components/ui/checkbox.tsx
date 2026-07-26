import * as CheckboxPrimitive from '@base-ui/react/checkbox'
import * as EffectRecord from 'effect/Record'
import {CheckIcon} from 'lucide-react'

import {cn} from '#lib/utils.ts'
function Checkbox(input: CheckboxPrimitive.Checkbox.Root.Props) {
	const props = EffectRecord.remove('className')(input)
	return (
		<CheckboxPrimitive.Checkbox.Root
			data-slot="checkbox"
			className={cn(
				'peer border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:bg-input/30 dark:data-checked:bg-primary dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 relative flex size-4 shrink-0 items-center justify-center rounded-none border transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-1',
				input.className
			)}
			{...props}
		>
			<CheckboxPrimitive.Checkbox.Indicator
				data-slot="checkbox-indicator"
				className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
			>
				<CheckIcon />
			</CheckboxPrimitive.Checkbox.Indicator>
		</CheckboxPrimitive.Checkbox.Root>
	)
}
export {Checkbox}
