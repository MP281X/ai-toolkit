import {Array, Cause, DateTime, Match, Predicate, Schema, String, pipe} from 'effect'

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
	Match.when(Predicate.isString, value => String.String(value)),
	Match.when(Predicate.isNullish, () => 'Error' as const),
	Match.when(Predicate.isObjectOrArray, error => Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(error)),
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
	const minutes = Math.round(millis / 60_000)
	if (minutes < 60) return `${minutes}m`
	const hours = Math.round(minutes / 60)
	if (hours < 24) return `${hours}h`
	return `${Math.round(hours / 24)}d`
}
export function formatBytes(bytes: number) {
	if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
	const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
	const value = bytes / 1024 ** exponent
	if (value >= 100 || exponent === 0) return `${value.toFixed(0)} ${units[exponent]}`
	if (value >= 10) return `${value.toFixed(1)} ${units[exponent]}`
	return `${value.toFixed(2)} ${units[exponent]}`
}
export function formatNumber(value: number) {
	const absolute = Math.abs(value)
	if (absolute >= 1_000_000_000_000) return formatNumberUnit({divisor: 1_000_000_000_000, suffix: 'T', value})
	if (absolute >= 1_000_000_000) return formatNumberUnit({divisor: 1_000_000_000, suffix: 'B', value})
	if (absolute >= 1_000_000) return formatNumberUnit({divisor: 1_000_000, suffix: 'M', value})
	if (absolute >= 1_000) return formatNumberUnit({divisor: 1_000, suffix: 'K', value})
	return Intl.NumberFormat(undefined, {maximumFractionDigits: 1}).format(value)
}
function formatNumberUnit(input: {readonly value: number; readonly divisor: number; readonly suffix: string}) {
	return `${Intl.NumberFormat(undefined, {maximumFractionDigits: 1}).format(
		input.value / input.divisor
	)}${input.suffix}`
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
