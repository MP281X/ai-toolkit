import {Array, Cause, Match, Predicate, pipe, String} from 'effect'

import type {ClassValue} from 'clsx'
import {clsx} from 'clsx'
import {twMerge} from 'tailwind-merge'

// biome-ignore lint/plugin: exported API
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export function formatError(error: unknown) {
	return pipe(
		Match.value(error),
		Match.when(Predicate.isError, error => {
			if (String.isEmpty(error.message) || error.message === 'Error') return error.name
			return error.message
		}),
		Match.when(Cause.isCause, cause =>
			pipe(
				cause,
				Cause.prettyErrors,
				Array.map(error => error.message || error.name),
				Array.join('\n')
			)
		),
		Match.when(Predicate.hasProperty('message'), error => String.String(error.message)),
		Match.when(Predicate.isString, string => string),
		Match.when(Predicate.isNullish, () => 'Error'),
		Match.when(Predicate.isObjectOrArray, error => JSON.stringify(error, null, 2)),
		Match.orElse(() => 'Unknown Error')
	)
}
