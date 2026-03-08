---
description: Aggressive simplification that removes defensive code and uses Effect idioms
agent: build
---

Run an aggressive simplification pass on the current implementation.

## Goal

- Simplify code by removing unnecessary defensive checks and validations.
- Use Effect idioms: try operations and catch/ignore errors instead of checking preconditions.
- Leverage Effect and shadcn modules aggressively via BTCA to find helpers that simplify code.
- Take the simplest, most direct path to solve problems.
- Delete dead code, unused branches, compatibility code, and legacy leftovers.
- Inline small helpers and delete pass-through layers.

## Rules

- Keep `AGENTS.md` mandatory.
- Do not invent shared abstractions.
- Do not introduce reusable infrastructure.
- Do not standardize patterns across the app just because multiple files look similar.
- Do not split code into more files for organization alone.
- Prefer delete over preserve when code is obsolete.
- Prefer inline over helper extraction.
- Prefer local duplication over shared cleanup layers.
- Remove legacy leftovers aggressively.
- Remove defensive preflight checks that guard against unrealistic states.
- Prefer "try and handle errors" over "check then do" patterns.
- When an operation might fail harmlessly, attempt the operation and catch/ignore the specific error instead of checking first.
- Use the most idiomatic Effect pattern available.

## BTCA Usage (Mandatory)

You MUST use BTCA aggressively to find Effect helpers before refactoring.

- Always call `btca_listResources` first.
- Query BTCA for every Effect pattern you encounter: error handling, streaming, state management, scheduling, caching, etc.
- Look for helpers in modules like: Effect, Stream, SubscriptionRef, Schedule, Fiber, Deferred, Ref, etc.
- Parallelize independent BTCA queries when possible.
- If you think "there should be a helper for this", query BTCA to find it.
- Common patterns to query for:
  - Error catching and ignoring (Effect.catchAll, Effect.catchTag, Effect.ignore)
  - Stream operators (debounce, throttle, sample)
  - State management (SubscriptionRef patterns, Ref patterns)
  - Scheduling and retry logic
  - Parallel execution helpers
  - Resource management

## Simplification Patterns

### Pattern 1: Remove Defensive Checks

Bad: Check precondition before acting.

```ts
if (!(yield* fs.exists(path))) {
  yield* fs.makeDirectory(path, {recursive: true})
}
```

Good: Try the operation and handle the error if needed.

```ts
yield* pipe(
  fs.makeDirectory(path, {recursive: true}),
  Effect.catchAll(() => Effect.void)
)
```

### Pattern 2: Remove Validation Branches

Bad: Validate state that the user controls before proceeding.

```ts
const value = yield* getSomeValue()
if (value !== expected) {
  yield* new Error({message: 'value mismatch'})
}
```

Good: Let the actual operation fail naturally if there's a real problem.

```ts
// Remove the validation entirely
// Real errors will surface during the actual operation
```

### Pattern 3: Simplify Deep Nesting

Bad: Deeply nested pipe chains or generators.

```ts
const result = yield* pipe(
  pipe(
    pipe(operation, Effect.map(...)),
    Effect.flatMap(...)
  ),
  Effect.map(...)
)
```

Good: Flatten using appropriate Effect composition or simplify the flow.

```ts
const result = yield* pipe(
  operation,
  Effect.map(...),
  Effect.flatMap(...),
  Effect.map(...)
)
```

## Process

1. Call `btca_listResources` to see available resources.
2. Inspect the current code to identify:
   - Defensive checks (existence checks before operations)
   - Validation branches for user-controlled state
   - Deep nesting that can be flattened
   - Unused branches or dead code
3. Query BTCA for Effect helpers that can simplify each pattern you find.
4. Remove defensive preflight checks and convert to "try and catch" patterns.
5. Delete validation branches for unrealistic failure scenarios.
6. Simplify nested code using Effect helpers found via BTCA.
7. Delete dead code, unused branches, compatibility code, and legacy leftovers.
8. Inline tiny helpers and delete pass-through layers.
9. Run the validation commands from `AGENTS.md` in order.
10. Report what was simplified and the validation result.
