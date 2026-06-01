---
description: Aggressive post-implementation deslop pass for changed files.
---

<changed_files>
!`git diff --name-only HEAD | rg -v "bun.lock|pnpm-lock.yaml|components/ui|.opencode/plans|.opencode/package.json"`
</changed_files>

You are the deslop pass for code that already works.

Working code is unfinished when it preserves incidental complexity or misses an idiomatic Effect/TypeScript implementation. Search for code-judo moves: behavior-preserving rewrites that delete whole categories of complexity instead of reorganizing them.

## Operating Standard

- Make the implementation smaller, more direct, more inferred, more functional, more composable, more pipeable, and more Effect-native.
- Prefer rewrites that make branches, props, helpers, config objects, floating types, casts, assertions, nullability, duplicated state, wrappers, and compatibility paths disappear.
- Do not stop at a cleaner version of the same messy idea. A refactor succeeds only when it reduces the number of concepts the reader must hold in their head.
- Keep simplifying until the remaining structure is forced by the domain, Effect, React, or an external boundary.

## Scope

- Work on changed source files from `<changed_files>`.
- Change additional source files only to update signatures, remove bridge props, collapse redundant APIs, or complete a behavior-preserving simplification started in a changed file.
- Ignore generated files, lockfiles, plans, package manager metadata, and shadcn/ui output.
- Preserve required behavior, visual output, and external API semantics.
- Do not add tests, lint rules, migration code, adapters, compatibility layers, backward-compatibility paths, or unrelated feature work.
- Do not preserve backward compatibility by default; this is a greenfield codebase.

## Simplification Targets

- Inline aliases for properties, comparisons, casts, assertions, fallbacks, nullable checks, literals, config values, class names, access paths, state constants, and nearby expressions.
- Inline object and array config containers unless they are domain data, external API input, or real shared policy.
- Remove pass-through helpers, wrappers, facades, signature-changing helpers, one-use functions, duplicate implementations, compatibility branches, bridge props, and old signatures.
- Remove props that can be inferred from another prop, unused props, derived props, parallel props, and nullability that is not required by the current dataflow.
- Change local and internal signatures when that deletes slop.
- Keep helpers only when they encode real policy, real reuse, a domain concept, or an external boundary.

## Effect And Functional Idioms

- Treat Effect as the primary programming model, not a wrapper around TypeScript control flow.
- Use Effect modules aggressively when they make dataflow more direct: `Array`, `Boolean`, `Match`, `Predicate`, `Record`, `String`, `Struct`, `Tuple`, `Either`, `Effect`, `Layer`, `Context`, `Ref`, `Deferred`, `Queue`, `Stream`, `Schedule`, `Cause`, and `Schema`.
- Prefer `pipe(...)`, `flow(...)`, module combinators, and data-last transformations over imperative loops, mutation, custom helpers, and one-off control flow.
- Replace `async`/`await`, raw `Promise` composition, and `try`/`catch` with Effect programs when the surrounding code can accept Effect.
- Use `Effect.fnUntraced` for parameterized functions that return Effects and top-level Effect values for parameterless programs.
- Remove `Effect.gen` wrappers that only yield, map, flatMap, or return one Effect.
- Use Effect primitives for concurrency, scheduling, retries, errors, resources, services, state, streams, and dependency wiring instead of hand-rolled versions.
- Use `Option` only when an existing Effect API requires it or when absence is already modeled as an Effect value.

## Branching

- Prefer `Match` from Effect for meaningful branching.
- Replace nested ternaries, hard-to-scan ternaries, `if`/`else if` chains, and `switch` statements with `Match` when matching a value, discriminant, status, variant, tag, or predicate set.
- Keep a ternary only when it is a tiny single-line binary expression that is easier to read than `Match`.
- Never replace `Match` with plain TypeScript control flow unless the branch is truly trivial and clearer.

## Types And Boundaries

- Fully rely on TypeScript inference inside the program.
- Remove explicit return types, parameter types, variable types, property types, generic annotations, local type aliases, interfaces, and exported floating types when inference can carry the contract.
- Keep exported type/value pairs only for Effect Schemas or required external API boundaries.
- Inline unavoidable types at the narrowest site and preserve as much inference as possible.
- Do not cast, assert, assign types, weaken types, or re-validate typed values inside the program.
- Use `as const` aggressively for literal preservation.
- Use Effect Schema at external boundaries such as RPC, storage, network payloads, and user input.

## React

- Keep components presentational when logic can live in atoms, Effect programs, schemas, or pipeable data transformations.
- Move logic to the canonical owner only when that deletes complexity.
- Move React logic into Effect atoms when the repo uses Effect atoms.
- Remove wrapper components that only rename props or change signatures.
- Compute derived display values from the source value at the use site.
- Keep Tailwind class strings visible at the JSX site unless there is real shared styling policy.
- Do not add memoization for object identity; React Compiler handles stable references.

## Destructuring

- Do not destructure objects.
- Replace object destructuring with direct property access.
- Keep tuple destructuring when it is the natural API shape, such as React state tuples or Effect result tuples.

## Round Loop

1. Inspect every changed source file.
2. Apply the deepest behavior-preserving simplification available, including signature changes in related files when needed.
3. Run `vp run check` and treat diagnostics as design feedback.
4. Repeat until a full round finds no further simplification.

## Done

- Every changed file has gone through repeated deslop rounds.
- The result is idiomatic Effect/TypeScript: inferred, functional, composable, pipeable, direct, and smaller.
- `vp run check` passes.
- Blockers are reported with the file, syntax, attempted rewrites, and exact reason each rewrite changes behavior or breaks an external boundary.
