---
name: package-contract
description: Use when defining or changing package public APIs, service contracts, schemas, exported utils, public layers, package exports, or package black-box tests before implementation.
---

# Package Contract

## Grounding

- Read current package exports, service/schema/utils files, consumers, and tests first.
- Use read-only subagents for current consumers, existing usage, and independent interface review when uncertainty is not trivial.
- Keep the contract pass brief; show only facts that affect public API or tests.

## Checkpoint

- Present one compact checkpoint before implementation.
- Include: evidence, public exports, `service.ts`, `schema.ts`, `utils.ts`, layers, tests.
- Omit sections that do not apply.
- Do not include implementation details.
- Every public export needs evidence from a current requirement, current consumer, external protocol/API, or required public test.
- If evidence is missing or a public choice is unclear, stop and ask.

````md
## Public Contract Checkpoint

### Evidence

- `sessions`: current UI reads terminal sessions.
- `createSession`: current UI starts terminal sessions.
- `isSessionRunning`: current UI formats active session state.

### service.ts

```ts
export interface TerminalContract {
	readonly sessions: SubscriptionRef.SubscriptionRef<ReadonlyMap<TerminalSessionId, TerminalSession>>

	readonly createSession: (input: TerminalCreateSessionInput) => Effect.Effect<TerminalSessionId, TerminalError>
}
```

### schema.ts

```ts
export class TerminalError extends Schema.TaggedErrorClass<TerminalError>()('TerminalError', {
	message: Schema.String,
	cause: Schema.optional(Schema.Defect()),
	reason: Schema.Struct({_tag: Schema.Literals(['SpawnFailed', 'UnknownSession'])})
}) {}
```

### utils.ts

```ts
export const isSessionRunning: (session: TerminalSession) => boolean
```

### Tests

- `createSession` derives the public session label from the command and cwd.
- `createSession` records the session as active until the process exits.
- `write` forwards input only to the targeted session.
- unknown session writes fail with `TerminalError` reason `UnknownSession`.
````

## Public API

- Expose one public way to perform or observe a behavior.
- Public signatures satisfy current requirements only; no speculative options, aliases, overloads, or convenience surfaces.
- Refactor consumers to the approved canonical API instead of keeping compatibility paths.
- Shared/service-instance values belong in layer/config; one-operation values belong in method input.
- Public methods expose `R = never` unless the method creates a caller-owned scoped resource.

## Services

- `service.ts` contains the service tag/contract and public layer constructors.
- Implementations live under named `internal/*` modules.
- Mutable current values use one `SubscriptionRef` read path.
- Event/incremental output with no meaningful current value may use `Stream`.
- Cleanup uses `Scope` and finalizers; do not expose cleanup methods unless stopping is current domain behavior.
- Multiple implementations use suffixed constructors, such as `makeCodex`, `makeClaude`, or `makeGitCli`.

## Schemas

- `schema.ts` contains minimal public data contracts crossing the package boundary.
- No raw external API schemas unless the raw shape is public.
- No behavior helpers in `schema.ts`.
- No optional or nullable fields without a current absence case.
- Service errors use one exported `Schema.TaggedErrorClass` with required `message`, optional `cause`, and inline `reason._tag`.
- Do not add reason metadata by default; diagnostic detail belongs in `message` and `cause`.

## Utils

- `utils.ts` contains public, side-effect-free, composable helpers.
- Helpers may be used internally and externally.
- Internal-only helpers live in named `internal/*` modules.
- Do not create grab-bag utils or public helper aliases.

## Tests

- Test useful package behavior through public exports only.
- Test domain decisions, state transitions, externally observable side effects, and public invariants not enforced by types or schemas.
- Do not test TypeScript shapes, schema field presence/types, Effect/Layer/Stream/SubscriptionRef/Scope behavior, method existence, or historical removals.
- A test scenario needs current public behavior evidence; do not add tests just because a method exists.
