import { type ClassValue, clsx } from 'clsx'
import { Array, Cause, Match, ParseResult, Predicate, pipe } from 'effect'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export function formatError(error: unknown) {
	return pipe(
		Match.value(error),
		Match.when(Match.instanceOf(ParseResult.ParseError), ParseResult.TreeFormatter.formatErrorSync),
		Match.when(Predicate.isError, error => {
			if (Predicate.isNullable(error.message) || error.message === 'Error') return error.name
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
		Match.when(Predicate.isString, string => string),
		Match.when(Predicate.hasProperty('message'), error => globalThis.String(error.message)),
		Match.orElse(() => 'Unknown Error')
	)
}
