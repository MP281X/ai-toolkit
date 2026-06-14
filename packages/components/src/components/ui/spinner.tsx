import type * as React from 'react'

import {cn} from '#lib/utils.ts'

function Spinner({className, ...props}: React.ComponentProps<'div'>) {
	return (
		<div
			role="status"
			aria-label="Loading"
			className={cn('animation-duration-[2.5s] size-4 animate-spin border-2 border-current opacity-50', className)}
			{...props}
		/>
	)
}

export {Spinner}
