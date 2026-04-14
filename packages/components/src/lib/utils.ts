import {Array, Cause, DateTime, Match, Predicate, pipe, String} from 'effect'

import type {ClassValue} from 'clsx'
import {clsx} from 'clsx'
import {twMerge} from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export const formatError = pipe(
	Match.type<unknown>(),
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

export const formatTimestamp = pipe(
	Match.type<DateTime.DateTime>(),
	Match.when(
		DateTime.isDateTime,
		DateTime.format({minute: '2-digit', hour: '2-digit', day: '2-digit', month: 'short'})
	),
	Match.exhaustive
)

export function formatNumber(number: number) {
	const formatter = new Intl.NumberFormat(undefined, {notation: 'compact', maximumFractionDigits: 1})
	return formatter.format(number)
}

export function toSentenceCase(value: string) {
	return pipe(
		value,
		String.replace(/[-_]+/g, ' '),
		String.replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
		String.trim,
		String.toLowerCase,
		String.capitalize
	)
}
