import * as SeparatorPrimitive from '@base-ui/react/separator'
import * as EffectRecord from 'effect/Record'

import {cn} from '#lib/utils.ts'
function Separator(input: SeparatorPrimitive.Separator.Props) {
	const props = EffectRecord.remove('orientation')(EffectRecord.remove('className')(input))
	return (
		<SeparatorPrimitive.Separator
			data-slot="separator"
			orientation={input.orientation ?? 'horizontal'}
			className={cn(
				'bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch',
				input.className
			)}
			{...props}
		/>
	)
}
export {Separator}
