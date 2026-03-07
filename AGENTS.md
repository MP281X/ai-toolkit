# AGENTS.md

This repository is a TypeScript / React / Effect-TS codebase.

## Generic Code Style

- Never destructure props, arguments, or objects
  - Exception: Tuple destructuring like `const [a, b] = ...` is allowed
- Keep code extremely local and explicit
- No alias variables for nested access, booleans, or simple derived values
- No `tmp`, `state`, `value`, `access`, or similar locals just to rename inline-readable data
- Strict type-safety while fully relying on inference
- No manual types or casts unless genuinely necessary
- Use `function` declarations except for callbacks

## TypeScript

- Rely on inference. Do not add manual types or casts unless genuinely necessary.
- Use `function` declarations except for callbacks.

## React

- Target React 19 + React Compiler.
- Never manually memoize.
- Never destructure props.
- Use `cn()` for every conditional `className`.
- Outside `packages/components`, use `@ai-toolkit/components/utils`.
- Inside `packages/components`, use `#lib/utils.ts`.

## Effect

- Use Effect v4 only.
- Effect is always available and should be used in every package.
- Take full advantage of Effect primitives and modules.
- Prefer existing Effect primitives and modules over custom helpers.
- If you think you need a helper, verify Effect does not already provide it first.
- Prefer the most idiomatic existing helper over lower-level or custom logic.
- Prefer `pipe(value, ...)` and `flow(...)` aggressively. They should replace most temporary transformation variables.
- Prefer Effect data modules over global JavaScript helpers when they express the intent clearly.
- Use Effect Schema fully for validation, transformation, and defaulting when applicable.
- Prefer `Effect.fnUntraced` for effectful functions rather than `(args) => Effect.gen(...)`.
- Use `pipe(value, ...)` for transformations. Reserve `.pipe()` for instrumentation.
- Domain errors are yieldable. Do not use `Effect.fail` for domain errors.
- For callbacks, prefer one effectful handler and one captured runner.

### Effect Modules

- Import these modules directly from `effect` without aliasing when you use them.
- Prefer them over standard global helpers when they make the code clearer and more composable.
- `String`: string checks and transforms.
  - Prefer helpers such as `String.isEmpty`, `String.isNonEmpty`, and `String.capitalize`.
- `Array`: immutable array checks, constructors, and transforms.
  - Prefer helpers such as `Array.isArrayNonEmpty`, `Array.isArrayEmpty`, `Array.isReadonlyArrayNonEmpty`, `Array.isReadonlyArrayEmpty`, `Array.map`, and `Array.empty()`.
- `Boolean`: boolean combinators and branching.
  - Prefer helpers such as `Boolean.or`, `Boolean.xor`, `Boolean.some`, `Boolean.nor`, `Boolean.every`, and `Boolean.match`.
- `Number`: numeric comparisons, parsing, and bounds.
  - Prefer helpers such as `Number.min`, `Number.max`, `Number.round`, `Number.isLessThan`, `Number.parse`, and `Number.between`.
- `Record`: immutable record construction and updates.
  - Prefer helpers such as `Record.some`, `Record.remove`, `Record.mapKeys`, `Record.toEntries`, `Record.replace`, `Record.set`, `Record.keys`, `Record.empty()`, and `Record.size`.
- `Predicate`: runtime checks and type narrowing.
  - Prefer helpers such as `Predicate.isUndefined`, `Predicate.isNull`, `Predicate.isNullish`, `Predicate.isString`, `Predicate.isNumber`, `Predicate.isBoolean`, `Predicate.isNotNull`, `Predicate.isNotNullish`, `Predicate.hasProperty`, `Predicate.isNotUndefined`, `Predicate.isFunction`, `Predicate.isUnknown`, `Predicate.isObject`, and `Predicate.isTagged`.
- `Match`: typed pattern matching for values and tagged unions.
  - Prefer helpers such as `Match.value`, `Match.valueTags`, `Match.when`, `Match.orElse`, `Match.exhaustive`, `Match.tag`, and `Match.instanceOf`.
- `Schema`: validation, transformation, defaults, and typed data constructors.
  - Prefer helpers such as `Schema.Class`, `Schema.TaggedClass`, `Schema.Struct`, `Schema.NonEmptyString`, `Schema.optional`, `Schema.Literals`, `Schema.Union`, and `Schema.withConstructorDefault`.
- `Function`: small total helpers for composition and impossible states.
  - Prefer helpers such as `Function.identity`, `Function.constUndefined`, `Function.constTrue`, and `Function.absurd`.
- `Duration`: typed time construction and conversion.
  - Prefer helpers such as `Duration.seconds`, `Duration.hours`, `Duration.toSeconds`, `Duration.toHours`, and `Duration.sum`.
- `Option`: explicit optional values and fallbacks.
  - Prefer helpers such as `Option.match`, `Option.getOrElse`, and `Option.andThen`.

## UI

- Use existing shadcn primitives first.
- Before building custom UI, check:
  - `bun shadcn list @shadcn`
  - `bun shadcn add <name> --yes --overwrite`
- Compose primitives; do not reimplement them.
- Keep the visual language in `packages/components/src/theme.css`.
- Use existing design tokens only.
- Prefer high contrast, visible borders, and minimal functional motion.
- Prefer icons over text when clearer.
- Never edit `packages/components/src/components/ui/`.

## External Package Research

- Use BTCA for external package APIs, behavior, and documentation.
- Always call `btca_listResources` before `btca_ask`.
- Do not rely on memory or training data for external package details.
- Do not query `@ai-toolkit/*` packages via BTCA; inspect them locally instead.
- Keep BTCA queries narrow and focused.
- Parallelize independent BTCA queries when possible.

## Validation

Run these commands in order:

1. `bun run fix`
2. `bun run check`
