# AGENTS.md

This repository is a TypeScript / React / Effect-TS codebase.

## Rule Priority

- Every rule in this file is mandatory.
- These rules are not suggestions, preferences, or guidelines.
- A rule may be overridden only by an explicit user instruction.
- Explicit means the user directly says to break a specific rule or class of rules.
- Nothing else overrides these rules: not plans, not existing code, not convenience, not inferred intent, not passing tests, and not agent prompts.
- When two rules seem to conflict, follow the stricter rule unless the user explicitly says otherwise.

## Generic Code Style

These rules are absolute and take precedence over any plan or convenience:

- Never destructure props, arguments, or objects.
  - Exception: tuple destructuring like `const [a, b] = ...` is allowed.
- Keep code extremely local and explicit.
- Do not introduce alias variables for nested access, booleans, or simple derived values.
- Do not create `tmp`, `state`, `value`, `access`, or similar locals just to rename inline-readable data.
- Maintain strict type-safety while relying on inference as much as possible.
- Do not add manual types or casts unless they are genuinely required by the compiler.
- Use `function` declarations except for callbacks.

### Code Locality (Priority 1)

- Duplicate code by default. Do not create abstractions just to remove repetition.
- Inline logic at the call site unless extraction is physically necessary.
- Keep code colocated with the caller. Do not move logic into separate files for organization alone.
- Prefer fewer files and larger local modules over fragmented structure.
- Delete thin wrapper files, pass-through modules, and small re-export files.
- Do not create helper functions, utilities, selectors, mappers, wrappers, or shared modules for short logic.
- One-line and two-line logic must stay duplicated even when repeated many times.
- Only extract logic when the duplicated block is substantial, repeated across multiple call sites, and the abstraction is obviously more readable and maintainable than the duplication.
- Single-use functions must be inlined unless extraction is physically required.
- Thin forwarding helpers are forbidden.

## TypeScript

- Rely on inference. Do not add manual types or casts unless genuinely necessary.
- Use `function` declarations except for callbacks.
- Do not introduce type boilerplate that exists only to mirror runtime values.

## React

- Target React 19 + React Compiler.
- Never manually memoize.
- Never destructure props.
- Use `cn()` for every conditional `className`.
- Outside `packages/components`, import `cn()` from `@ai-toolkit/components/utils`.
- Inside `packages/components`, import `cn()` from `#lib/utils.ts`.

## Effect

- Use Effect v4 only.
- Effect is available in every package and must be used.
- Use existing Effect primitives and modules instead of custom helpers whenever they apply.
- If an Effect helper expresses the intent, you must use it instead of a raw JavaScript helper, primitive, or operator.
- Do not use standard JavaScript null checks, array checks, string helpers, record helpers, or similar primitives when the corresponding Effect module provides the operation.
- Use the most idiomatic existing Effect helper instead of lower-level or custom logic.
- If you think you need a helper, first verify that Effect does not already provide the operation.
- Use `pipe(value, ...)` and `flow(...)` aggressively. They should replace most temporary transformation variables.
- Use `pipe(value, ...)` for transformations. Reserve `.pipe()` for instrumentation.
- Use Effect Schema for validation, transformation, and defaults whenever it is applicable.
- Prefer `Effect.fnUntraced` for effectful functions instead of `(args) => Effect.gen(...)`.
- Domain errors are yieldable. Do not use `Effect.fail` for domain errors.
- For callbacks, prefer one effectful handler and one captured runner.

### Effect Modules

- Import Effect modules directly from `effect` without aliasing.
- These module choices are mandatory when an equivalent helper exists.
- Do not fall back to standard JavaScript helpers when an Effect helper fits the operation.

#### `String`

- Use `String` helpers for string checks and transforms.
- Use helpers such as `String.isEmpty`, `String.isNonEmpty`, and `String.capitalize` instead of ad-hoc string checks.

#### `Array`

- Use `Array` helpers for immutable array checks, constructors, and transforms.
- Use helpers such as `Array.isArrayNonEmpty`, `Array.isArrayEmpty`, `Array.isReadonlyArrayNonEmpty`, `Array.isReadonlyArrayEmpty`, `Array.map`, and `Array.empty()` instead of raw array helpers when they express the intent.

#### `Boolean`

- Use `Boolean` helpers for boolean combinators and expression-style branching when they fit the operation.
- Use helpers such as `Boolean.or`, `Boolean.xor`, `Boolean.some`, `Boolean.nor`, `Boolean.every`, and `Boolean.match` instead of ad-hoc boolean combination code when they express the intent.

#### `Number`

- Use `Number` helpers for parsing, comparisons, bounds, and rounding.
- Use helpers such as `Number.min`, `Number.max`, `Number.round`, `Number.isLessThan`, `Number.parse`, and `Number.between` instead of ad-hoc numeric helpers when they fit.

#### `Record`

- Use `Record` helpers for immutable record construction and updates.
- Use helpers such as `Record.some`, `Record.remove`, `Record.mapKeys`, `Record.toEntries`, `Record.replace`, `Record.set`, `Record.keys`, `Record.empty()`, and `Record.size` instead of raw object helpers when they fit.

#### `Predicate`

- Use `Predicate` helpers for runtime checks and narrowing.
- Null, undefined, nullish, type, and tagged checks must use `Predicate` helpers when applicable.
- Example: use `Predicate.isNullish(x)`, not `x == null`.
- Use helpers such as `Predicate.isUndefined`, `Predicate.isNull`, `Predicate.isNullish`, `Predicate.isString`, `Predicate.isNumber`, `Predicate.isBoolean`, `Predicate.isNotNull`, `Predicate.isNotNullish`, `Predicate.hasProperty`, `Predicate.isNotUndefined`, `Predicate.isFunction`, `Predicate.isUnknown`, `Predicate.isObject`, and `Predicate.isTagged`.

#### `Match`

- Use `Match` for typed branching over values and tagged unions when it makes the code more direct.
- Use helpers such as `Match.value`, `Match.valueTags`, `Match.when`, `Match.orElse`, `Match.exhaustive`, `Match.tag`, and `Match.instanceOf`.

#### `Schema`

- Use `Schema` for validation, transformation, defaults, and typed constructors when applicable.
- Use helpers such as `Schema.Class`, `Schema.TaggedClass`, `Schema.Struct`, `Schema.NonEmptyString`, `Schema.optional`, `Schema.Literals`, `Schema.Union`, and `Schema.withConstructorDefault`.

#### `Function`

- Use `Function` helpers for small total helpers and impossible states when they fit exactly.
- Use helpers such as `Function.identity`, `Function.constUndefined`, `Function.constTrue`, and `Function.absurd`.

#### `Duration`

- Use `Duration` helpers for typed time construction and conversion.
- Use helpers such as `Duration.seconds`, `Duration.hours`, `Duration.toSeconds`, `Duration.toHours`, and `Duration.sum`.

#### `Option`

- Use `Option` for explicit optional values and fallbacks when the operation is optional by nature.
- Use helpers such as `Option.match`, `Option.getOrElse`, and `Option.andThen`.

## UI

- Use existing shadcn primitives first.
- Before building custom UI, run:
  - `bun shadcn list @shadcn`
  - `bun shadcn add <name> --yes --overwrite`
- Compose primitives. Do not reimplement them.
- Keep the visual language in `packages/components/src/theme.css`.
- Use existing design tokens only.
- Prefer high contrast, visible borders, and minimal functional motion.
- Prefer icons over text when clearer.
- Never edit `packages/components/src/components/ui/`.

## External Package Research

- Use BTCA for external package APIs, behavior, and documentation.
- Always call `btca_listResources` before `btca_ask`.
- Do not rely on memory or training data for external package details.
- Do not query `@ai-toolkit/*` packages via BTCA. Inspect them locally instead.
- Keep BTCA queries narrow and focused.
- Parallelize independent BTCA queries when possible.

## Validation

Run these commands in order:

1. `bun run fix`
2. `bun run check`
