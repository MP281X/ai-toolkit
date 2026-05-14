import {Array, Cause, DateTime, Match, Predicate, String, pipe} from 'effect'

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
	Match.when(Predicate.isNullish, () => 'Error' as const),
	Match.when(Predicate.isObjectOrArray, error => JSON.stringify(error, undefined, 2)),
	Match.orElse(() => 'Unknown Error' as const)
)

export const formatTimestamp = pipe(
	Match.type<DateTime.DateTime>(),
	Match.when(
		DateTime.isDateTime,
		DateTime.format({day: '2-digit', hour: '2-digit', minute: '2-digit', month: 'short'})
	),
	Match.exhaustive
)

export function formatNumber(number: number) {
	return new Intl.NumberFormat(undefined, {maximumFractionDigits: 1, notation: 'compact'}).format(number)
}

export function toSentenceCase(value: string) {
	return pipe(
		value,
		String.replaceAll(/[-_]+/g, ' '),
		String.replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2'),
		String.trim,
		String.toLowerCase,
		String.capitalize
	)
}
