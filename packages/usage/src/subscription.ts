import {Array, Option, Predicate, Record, Schema, String, pipe} from 'effect'

const UnknownArray = Schema.Array(Schema.Unknown)
const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown)
const absent = undefined

function titleToken(token: string) {
	const lower = String.toLowerCase(token)
	if (/^\d+x$/u.test(lower)) return lower
	return String.capitalize(lower)
}

function subscriptionLabel(value: string | null | undefined) {
	if (!Predicate.isString(value)) return absent

	const tokens = pipe(
		value,
		String.trim,
		String.split(/[\s_-]+/u),
		Array.filter(token => {
			const lower = String.toLowerCase(token)
			return String.isNonEmpty(token) && lower !== 'default' && lower !== 'claude'
		})
	)

	if (Array.isReadonlyArrayEmpty(tokens)) return absent
	return pipe(tokens, Array.map(titleToken), Array.join(' '))
}

export function codexSubscriptionLabel(planType: string | null | undefined) {
	const label = subscriptionLabel(planType)
	return Predicate.isUndefined(label) ? undefined : {label}
}

function findStringField(input: unknown, field: string): string | undefined {
	return pipe(
		Schema.decodeUnknownOption(UnknownArray)(input),
		Option.match({
			onNone: () =>
				pipe(
					Schema.decodeUnknownOption(UnknownRecord)(input),
					Option.match({
						onNone: () => absent,
						onSome: record => {
							const value = record[field]
							if (Predicate.isString(value)) return value

							for (const nested of Record.values(record)) {
								const result = findStringField(nested, field)
								if (Predicate.isNotUndefined(result)) return result
							}
							return absent
						}
					})
				),
			onSome: items => {
				for (const item of items) {
					const result = findStringField(item, field)
					if (Predicate.isNotUndefined(result)) return result
				}
				return absent
			}
		})
	)
}

export function claudeSubscriptionFromUnknown(input: unknown) {
	const value =
		findStringField(input, 'organizationRateLimitTier') ??
		findStringField(input, 'organizationType') ??
		findStringField(input, 'billingType')
	const label = subscriptionLabel(value)
	return Predicate.isUndefined(label) ? undefined : {label}
}

export function claudeSubscriptionFromCacheJson(input: string) {
	try {
		return claudeSubscriptionFromUnknown(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(input))
	} catch {
		return absent
	}
}
