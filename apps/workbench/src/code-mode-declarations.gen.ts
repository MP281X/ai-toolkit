import {Array, Context, Effect, Predicate, Schema, pipe} from 'effect'

import {AgentRpcContracts} from './rpcs/contracts.ts'

type Capability = 'implementation' | 'planning' | 'subagent'
type Skill = 'engineering' | 'git-operations' | 'implementation' | 'planning' | 'review' | 'skill-writing' | 'testing'
type AgentRpcTag = (typeof AgentRpcContracts.requests extends ReadonlyMap<infer Tag, unknown> ? Tag : never) & string

class CodeModeBindingError extends Schema.TaggedErrorClass<CodeModeBindingError>()('CodeModeBindingError', {
	cause: Schema.optional(Schema.Defect()),
	message: Schema.String
}) {}

const readonlyTags = [
	'agent.implementation.handoff',
	'agent.issue.history',
	'agent.source.add',
	'agent.source.synchronize'
] as const
const engineeringTags = [
	...readonlyTags,
	'agent.assets.upload',
	'agent.preview.expose',
	'agent.preview.revoke',
	'agent.process.start',
	'agent.process.stop'
] as const
const gitOperationsTags = [
	...readonlyTags,
	'agent.issue.close',
	'agent.publication.publish',
	'agent.repository.alignDefault'
] as const
const planningTags = [
	...readonlyTags,
	'agent.assets.upload',
	'agent.issue.close',
	'agent.implementation.start',
	'agent.issue.savePlan'
] as const
const implementationTags = [
	...engineeringTags,
	'agent.issue.close',
	'agent.implementation.start',
	'agent.publication.publish',
	'agent.repository.alignDefault'
] as const

function tagsFor(capability: Capability, skill?: Skill): readonly AgentRpcTag[] {
	if (capability === 'implementation') return implementationTags
	if (capability === 'planning') return planningTags
	if (skill === 'implementation') return implementationTags
	if (skill === 'git-operations') return gitOperationsTags
	return skill === 'engineering' || skill === 'testing' ? engineeringTags : readonlyTags
}

export function codeModeClientFor<T extends Readonly<Record<AgentRpcTag, unknown>>>(
	client: T,
	capability: Capability,
	skill?: Skill
): Readonly<Record<string, unknown>> {
	return Object.fromEntries(
		tagsFor(capability, skill).map(tag => [
			tag,
			(payload: unknown) =>
				Effect.gen(function* () {
					const rpc = AgentRpcContracts.requests.get(tag)
					if (Predicate.isUndefined(rpc)) {
						return yield* CodeModeBindingError.make({message: `Unknown agent RPC ${tag}`})
					}
					const decoded = yield* Schema.decodeUnknownEffect(rpc.payloadSchema)(payload)
					const handler = client[tag]
					if (!Predicate.isFunction(handler)) {
						return yield* CodeModeBindingError.make({message: `Missing code-mode handler for ${tag}`})
					}
					const candidate = yield* Effect.try({
						catch: cause => CodeModeBindingError.make({cause, message: `Code-mode handler ${tag} failed`}),
						try: () => handler(decoded)
					})
					if (!Effect.isEffect(candidate)) {
						return yield* CodeModeBindingError.make({message: `Code-mode handler ${tag} did not return an Effect`})
					}
					const value = yield* pipe(
						// @effect-diagnostics-next-line anyUnknownInErrorContext:off
						candidate,
						Effect.provideContext(Context.makeUnsafe<unknown>(new Map<string, never>())),
						Effect.mapError(cause =>
							CodeModeBindingError.make({cause, message: `Code-mode handler ${tag} failed`})
						)
					)
					return yield* Schema.encodeUnknownEffect(rpc.successSchema)(value)
				})
		])
	)
}

function field(value: unknown, key: string): unknown {
	return Predicate.hasProperty(value, key) ? value[key] : undefined
}

function schemaType(schema: unknown, root: unknown): string {
	const reference = field(schema, '$ref')
	if (Predicate.isString(reference) && reference.startsWith('#/definitions/')) {
		return schemaType(field(field(root, 'definitions'), reference.slice('#/definitions/'.length)), root)
	}
	const anyOf = field(schema, 'anyOf')
	if (Array.isArray(anyOf)) return anyOf.map(item => schemaType(item, root)).join(' | ')
	const oneOf = field(schema, 'oneOf')
	if (Array.isArray(oneOf)) return oneOf.map(item => schemaType(item, root)).join(' | ')
	const allOf = field(schema, 'allOf')
	if (Array.isArray(allOf)) return allOf.map(item => schemaType(item, root)).join(' & ')
	const values = field(schema, 'enum')
	if (Array.isArray(values)) return values.map(value => JSON.stringify(value)).join(' | ')
	const constant = field(schema, 'const')
	if (!Predicate.isUndefined(constant)) return JSON.stringify(constant)
	const type = field(schema, 'type')
	if (type === 'array') return `readonly ${schemaType(field(schema, 'items'), root)}[]`
	if (type === 'object') {
		const properties = field(schema, 'properties')
		if (!Predicate.isObject(properties)) return 'Readonly<Record<string, unknown>>'
		const requiredValue = field(schema, 'required')
		const required = new Set(Array.isArray(requiredValue) ? requiredValue.filter(Predicate.isString) : [])
		const members = Object.entries(properties).map(
			([key, value]) => `readonly ${JSON.stringify(key)}${required.has(key) ? '' : '?'}: ${schemaType(value, root)}`
		)
		return `{ ${members.join('; ')} }`
	}
	if (type === 'string') return field(schema, 'format') === 'byte' ? 'Uint8Array' : 'string'
	if (type === 'integer' || type === 'number') return 'number'
	if (type === 'boolean') return 'boolean'
	if (type === 'null') return 'null'
	return 'unknown'
}

function standardSchema(schema: Schema.Top, direction: 'input' | 'output') {
	const converter = Schema.toStandardJSONSchemaV1(schema)['~standard'].jsonSchema
	return converter[direction]({target: 'draft-07'})
}

function declarations(tags: readonly AgentRpcTag[]) {
	const methods = tags.map(tag => {
		const rpc = AgentRpcContracts.requests.get(tag)
		if (Predicate.isUndefined(rpc)) throw new Error(`Unknown agent RPC ${tag}`)
		const payload = standardSchema(rpc.payloadSchema, 'input')
		const success = standardSchema(rpc.successSchema, 'output')
		const error = standardSchema(rpc.errorSchema, 'output')
		return `  readonly ${JSON.stringify(tag)}: (input: ${schemaType(payload, payload)}) => effect.Effect.Effect<${schemaType(success, success)}, ${schemaType(error, error)}>`
	})
	return `declare const effect: typeof import("effect")

declare const context: {
  readonly agent: string
  readonly issue?: string
  readonly repository: string
  readonly worktree?: string
}

declare const client: {
${methods.join('\n')}
}

// Return one final value. Example:
effect.Effect.gen(function* () {
  return yield* client["agent.issue.history"]({ repository: context.repository })
})`
}

export function codeModeDeclarationsFor(capability: Capability, skill?: Skill) {
	return declarations(tagsFor(capability, skill))
}
