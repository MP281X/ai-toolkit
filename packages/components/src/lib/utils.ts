import {Array, Cause, Match, Predicate, pipe, String} from 'effect'

import {type ClassValue, clsx} from 'clsx'
import {twMerge} from 'tailwind-merge'

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
		Match.when(Predicate.hasProperty('message'), error => globalThis.String(error.message)),
		Match.when(Predicate.isString, string => string),
		Match.when(Predicate.isNullish, () => 'Error'),
		Match.when(Predicate.isObjectOrArray, error => JSON.stringify(error, null, 2)),
		Match.orElse(() => 'Unknown Error')
	)
}

export function formatTokens(n: number) {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
	return globalThis.String(n)
}

export function formatRelativeTime(timestamp: number) {
	const diffMs = Date.now() - timestamp
	if (diffMs < 0) return 'in the future'
	if (diffMs < 60_000) return 'just now'
	if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`
	if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`
	if (diffMs < 604_800_000) return `${Math.floor(diffMs / 86_400_000)}d ago`
	return `${Math.floor(diffMs / 604_800_000)}w ago`
}

export function formatDuration(ms: number) {
	if (ms < 1000) return `${Math.round(ms)}ms`

	const sec = ms / 1000
	if (sec < 60) return `${sec.toFixed(1)}s`

	const parts: string[] = []
	const d = Math.floor(sec / 86400)
	const h = Math.floor(sec / 3600) % 24
	const m = Math.floor(sec / 60) % 60
	const s = Math.floor(sec) % 60

	if (d > 0) parts.push(`${d}d`)
	if (h > 0) parts.push(`${h}h`)
	if (m > 0) parts.push(`${m}m`)
	if (s > 0) parts.push(`${s}s`)

	return parts.join(' ')
}

export function formatPrice(value: number) {
	if (value === 0) return 'free'
	return `$${value % 1 === 0 ? value.toString() : value.toFixed(2).replace(/\.00$/, '')}`
}
