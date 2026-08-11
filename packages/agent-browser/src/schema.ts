import {Array, HashMap, HashSet, Option, Schema, String, pipe} from 'effect'

export class AgentBrowserError extends Schema.TaggedError<AgentBrowserError>()('AgentBrowserError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}

export type AgentBrowserOpenTabs = typeof AgentBrowserOpenTabs.Type
export const AgentBrowserOpenTabs = Schema.Struct({origins: Schema.Array(Schema.String), session: Schema.String})

export type AgentBrowserTabSwitch = typeof AgentBrowserTabSwitch.Type
export const AgentBrowserTabSwitch = Schema.Struct({origin: Schema.String, session: Schema.String})

function portlessLabelHost(origin: string) {
	return pipe(new URL(origin).hostname, String.replace(/\.localhost$/u, ''))
}

function sanitizePortlessLabel(value: string) {
	const label = pipe(
		value,
		String.toLowerCase,
		String.replaceAll(/[^a-z0-9_-]+/gu, '-'),
		String.replace(/-+/gu, '-'),
		String.replace(/^-+|-+$/gu, ''),
		String.slice(0, 96)
	)
	const named = label === '' ? 'tab' : label
	return /^[a-z]/u.test(named) ? named : `tab-${named}`
}

function portlessSegments(origin: string) {
	const segments = pipe(portlessLabelHost(origin), String.split('.'))
	return segments.length > 1 ? Array.dropRight(segments, 1) : segments
}

function commonPrefixLength(values: string[][], length = 0): number {
	const first = values[0] ?? []
	return length < first.length && Array.every(values, value => value[length] === first[length])
		? commonPrefixLength(values, length + 1)
		: length
}

function commonSuffixLength(values: string[][], prefixLength: number, length = 0): number {
	const first = values[0] ?? []
	return length < first.length - prefixLength &&
		Array.every(values, value => value[value.length - length - 1] === first[first.length - length - 1])
		? commonSuffixLength(values, prefixLength, length + 1)
		: length
}

function labelTokens(values: string[][]) {
	if (values.length <= 1) return values

	const prefixLength = commonPrefixLength(values)
	const suffixLength = commonSuffixLength(values, prefixLength)
	if (prefixLength === 0 && suffixLength === 0) return values

	const trimmed = Array.map(values, value =>
		pipe(value, Array.drop(prefixLength), Array.take(value.length - prefixLength - suffixLength))
	)
	return Array.every(trimmed, value => value.length > 0) ? trimmed : values
}

function segmentLabel(tokens: string[]) {
	return sanitizePortlessLabel(Array.join('-')(tokens))
}

function labelFor(labels: HashMap.HashMap<string, string>, origin: string) {
	return pipe(
		HashMap.get(labels, origin),
		Option.getOrElse(() => 'tab')
	)
}

function collisionLabel(input: {
	collision: {origin: string; original: string[]; tokens: string[]}
	collisions: {origin: string}[]
	label: string
	labels: HashMap.HashMap<string, string>
}) {
	const extras = Array.filter(input.collision.original, token => !Array.contains(input.collision.tokens, token))
	return pipe(
		extras,
		Array.findFirst(extra => {
			const next = segmentLabel([...input.collision.tokens, extra])
			return Array.every(
				input.collisions,
				other => other.origin === input.collision.origin || labelFor(input.labels, other.origin) !== next
			)
		}),
		Option.map(extra => segmentLabel([...input.collision.tokens, extra])),
		Option.getOrElse(() => input.label)
	)
}

function resolveCompactCollisions(
	entries: {origin: string; original: string[]; tokens: string[]}[],
	labels: HashMap.HashMap<string, string>
) {
	return Array.reduce(entries, labels, (current, entry) => {
		const label = labelFor(current, entry.origin)
		const collisions = Array.filter(entries, candidate => labelFor(current, candidate.origin) === label)
		if (collisions.length <= 1) return current

		return Array.reduce(collisions, current, (next, collision) =>
			HashMap.set(next, collision.origin, collisionLabel({collision, collisions, label, labels: current}))
		)
	})
}

function uniqueLabel(base: string, used: HashSet.HashSet<string>, index = 0): string {
	const candidate = index === 0 ? base : sanitizePortlessLabel(`${base}-${index + 1}`)
	return HashSet.has(used, candidate) ? uniqueLabel(base, used, index + 1) : candidate
}

export function agentBrowserOwnedTabLabels(origins: string[]) {
	const uniqueOrigins = Array.dedupe(origins)
	const originalTokens = Array.map(uniqueOrigins, origin => portlessSegments(origin))
	const compactTokens = labelTokens(originalTokens)
	const entries = Array.map(uniqueOrigins, (origin, index) => ({
		origin,
		original: originalTokens[index] ?? [],
		tokens: compactTokens[index] ?? []
	}))
	const labels = Array.reduce(entries, HashMap.empty<string, string>(), (current, entry) =>
		HashMap.set(current, entry.origin, segmentLabel(entry.tokens))
	)

	return Array.reduce(
		entries,
		{labels: resolveCompactCollisions(entries, labels), used: HashSet.empty<string>()},
		(current, entry) => {
			const label = uniqueLabel(labelFor(current.labels, entry.origin), current.used)
			return {labels: HashMap.set(current.labels, entry.origin, label), used: HashSet.add(current.used, label)}
		}
	).labels
}

export function agentBrowserOwnedTabLabel(origin: string) {
	return labelFor(agentBrowserOwnedTabLabels([origin]), origin)
}
