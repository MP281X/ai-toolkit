import {Array, Cause, DateTime, Match, Number, Predicate, Schema, String, pipe} from 'effect'

import type {ClassValue} from 'clsx'
import {clsx} from 'clsx'
import {twMerge} from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
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
	Match.when(Predicate.isString, value => String.String(value)),
	Match.when(Predicate.isNullish, () => 'Error' as const),
	Match.when(Predicate.isObjectOrArray, error =>
		Schema.encodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(error)
	),
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

export function formatTimeUntil(date: DateTime.DateTime) {
	const millis = DateTime.toEpochMillis(date) - DateTime.toEpochMillis(DateTime.nowUnsafe())
	if (millis <= 0) return 'now'
	const minutes = Number.round(millis / 60_000, 0)
	if (minutes < 60) return `${minutes}m`
	const hours = Number.round(minutes / 60, 0)
	if (hours < 24) return `${hours}h`
	return `${Number.round(hours / 24, 0)}d`
}

export function formatNumber(value: number) {
	const absolute = Math.abs(value)
	if (absolute >= 1_000_000_000_000) return formatNumberUnit(value, 1_000_000_000_000, 'T')
	if (absolute >= 1_000_000_000) return formatNumberUnit(value, 1_000_000_000, 'B')
	if (absolute >= 1_000_000) return formatNumberUnit(value, 1_000_000, 'M')
	if (absolute >= 1_000) return formatNumberUnit(value, 1_000, 'K')
	return Intl.NumberFormat(undefined, {maximumFractionDigits: 1}).format(value)
}

function formatNumberUnit(value: number, divisor: number, suffix: string) {
	return `${Intl.NumberFormat(undefined, {maximumFractionDigits: 1}).format(value / divisor)}${suffix}`
}

export function toSentenceCase(value: string) {
	return pipe(
		value,
		String.replaceAll(/[-_]+/gu, ' '),
		String.replaceAll(/([a-z0-9])([A-Z])/gu, '$1 $2'),
		String.trim,
		String.toLowerCase,
		String.capitalize
	)
}
