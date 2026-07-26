import {Array, HashMap, HashSet, Option, Schema, String, pipe} from 'effect'
export class AgentBrowserError extends Schema.TaggedErrorClass<AgentBrowserError>()('AgentBrowserError', {
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
function commonPrefixLength(input: {
	readonly values: readonly (readonly string[])[]
	readonly length?: number
}): number {
	return (input.length ?? 0) < (input.values[0] ?? []).length &&
		input.values.every(value => value[input.length ?? 0] === (input.values[0] ?? [])[input.length ?? 0])
		? commonPrefixLength({length: (input.length ?? 0) + 1, values: input.values})
		: (input.length ?? 0)
}
function commonSuffixLength(input: {
	readonly values: readonly (readonly string[])[]
	readonly prefixLength: number
	readonly length?: number
}): number {
	return (input.length ?? 0) < (input.values[0] ?? []).length - input.prefixLength &&
		input.values.every(
			value =>
				value[value.length - (input.length ?? 0) - 1] ===
				(input.values[0] ?? [])[(input.values[0] ?? []).length - (input.length ?? 0) - 1]
		)
		? commonSuffixLength({length: (input.length ?? 0) + 1, prefixLength: input.prefixLength, values: input.values})
		: (input.length ?? 0)
}
function labelTokens(values: readonly (readonly string[])[]) {
	if (values.length <= 1) return values
	const prefixLength = commonPrefixLength({values})
	const suffixLength = commonSuffixLength({prefixLength, values})
	if (prefixLength === 0 && suffixLength === 0) return values
	const trimmed = Array.map(values, value => value.slice(prefixLength, value.length - suffixLength))
	return trimmed.every(value => value.length > 0) ? trimmed : values
}
function segmentLabel(tokens: readonly string[]) {
	return sanitizePortlessLabel(Array.join('-')(tokens))
}
function labelFor(input: {readonly labels: HashMap.HashMap<string, string>; readonly origin: string}) {
	return pipe(
		HashMap.get(input.labels, input.origin),
		Option.getOrElse(() => 'tab')
	)
}
function collisionLabel(input: {
	readonly collision: {
		readonly origin: string
		readonly original: readonly string[]
		readonly tokens: readonly string[]
	}
	readonly collisions: readonly {readonly origin: string}[]
	readonly label: string
	readonly labels: HashMap.HashMap<string, string>
}) {
	const extras = Array.filter(input.collision.original, token => !Array.contains(input.collision.tokens, token))
	return pipe(
		extras,
		Array.findFirst(extra => {
			const next = segmentLabel([...input.collision.tokens, extra])
			return Array.every(
				input.collisions,
				other =>
					other.origin === input.collision.origin || labelFor({labels: input.labels, origin: other.origin}) !== next
			)
		}),
		Option.map(extra => segmentLabel([...input.collision.tokens, extra])),
		Option.getOrElse(() => input.label)
	)
}
function resolveCompactCollisions(input: {
	readonly entries: readonly {
		readonly origin: string
		readonly original: readonly string[]
		readonly tokens: readonly string[]
	}[]
	readonly labels: HashMap.HashMap<string, string>
}) {
	return Array.reduce(input.entries, input.labels, (current, entry) => {
		const label = labelFor({labels: current, origin: entry.origin})
		const collisions = Array.filter(
			input.entries,
			candidate => labelFor({labels: current, origin: candidate.origin}) === label
		)
		if (collisions.length <= 1) return current
		return Array.reduce(collisions, current, (next, collision) =>
			HashMap.set(next, collision.origin, collisionLabel({collision, collisions, label, labels: current}))
		)
	})
}
function uniqueLabel(input: {
	readonly base: string
	readonly used: HashSet.HashSet<string>
	readonly index?: number
}): string {
	if (
		HashSet.has(
			input.used,
			(input.index ?? 0) === 0 ? input.base : sanitizePortlessLabel(`${input.base}-${(input.index ?? 0) + 1}`)
		)
	) {
		return uniqueLabel({base: input.base, index: (input.index ?? 0) + 1, used: input.used})
	}
	return (input.index ?? 0) === 0 ? input.base : sanitizePortlessLabel(`${input.base}-${(input.index ?? 0) + 1}`)
}
export function agentBrowserOwnedTabLabels(origins: readonly string[]) {
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
		{labels: resolveCompactCollisions({entries, labels}), used: HashSet.empty<string>()},
		(current, entry) => {
			const label = uniqueLabel({base: labelFor({labels: current.labels, origin: entry.origin}), used: current.used})
			return {labels: HashMap.set(current.labels, entry.origin, label), used: HashSet.add(current.used, label)}
		}
	).labels
}
export function agentBrowserOwnedTabLabel(origin: string) {
	return labelFor({labels: agentBrowserOwnedTabLabels([origin]), origin})
}
