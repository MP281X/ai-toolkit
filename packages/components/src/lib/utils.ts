import {Array, Cause, DateTime, Match, Predicate, pipe, String} from 'effect'

import type {ClassValue} from 'clsx'
import {clsx} from 'clsx'
import {twMerge} from 'tailwind-merge'

export function cn(...inputs: readonly ClassValue[]) {
	return twMerge(clsx(inputs))
}

export const formatError = pipe(
	Match.type(),
	Match.when(Predicate.isError, error => {
		if (String.isEmpty(error.message) || error.message === 'Error') return error.name
		return error.message
	}),
	Match.when(Cause.isCause, cause => {
		return pipe(
			cause,
			Cause.prettyErrors,
			Array.map(error => error.message || error.name),
			Array.join('\n')
		)
	}),
	Match.when(Predicate.hasProperty('message'), error => String.String(error.message)),
	Match.when(Predicate.isString, string => string),
	Match.when(Predicate.isNullish, () => 'Error' as const),
	Match.when(Predicate.isObjectOrArray, error => JSON.stringify(error, undefined, 2)),
	Match.orElse(() => 'Unknown Error' as const)
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
	return new Intl.NumberFormat(undefined, {notation: 'compact', maximumFractionDigits: 1}).format(number)
}

export function toSentenceCase(value: string) {
	return pipe(
		value,
		String.replace(RegExp('[-_]+', 'g'), ' '),
		String.replace(RegExp('([a-z0-9])([A-Z])', 'g'), '$1 $2'),
		String.trim,
		String.toLowerCase,
		String.capitalize
	)
}
