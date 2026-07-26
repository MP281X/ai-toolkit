import * as EffectRecord from 'effect/Record'
import type * as React from 'react'

import {cn} from '#lib/utils.ts'
function Spinner(input: React.ComponentProps<'div'>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<div
			role="status"
			aria-label="Loading"
			className={cn(
				'animation-duration-[2.5s] size-4 animate-spin border-2 border-current opacity-50',
				input.className
			)}
			{...props}
		/>
	)
}
export {Spinner}
