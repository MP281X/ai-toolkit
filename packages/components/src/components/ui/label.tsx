'use client'

import * as EffectRecord from 'effect/Record'
import * as React from 'react'

import {cn} from '#lib/utils.ts'
function Label(input: React.ComponentProps<'label'>) {
	const props = EffectRecord.remove('className')(input)
	return (
		<label
			data-slot="label"
			className={cn(
				'flex items-center gap-2 text-xs leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
				input.className
			)}
			{...props}
		/>
	)
}
export {Label}
