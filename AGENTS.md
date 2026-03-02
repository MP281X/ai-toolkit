# AGENTS.md

## MANDATE

- Execute EXACTLY what is requested. NO additional changes.
- Complete every task end-to-end. Ask using the `question` tool ONLY when a request is genuinely ambiguous and cannot be inferred.
- BREAKING CHANGES ARE ACCEPTABLE. NO backward compatibility.
- NO migration layers, deprecations, aliases, compatibility props, or adapter wrappers.
- HAPPY PATH ONLY. NO defensive coding, NO edge-case handling unless explicitly requested.

## EXECUTION

### Before coding

Write a short internal checklist: required behavior, forbidden behavior, what must be deleted.

1. Remove complexity before and after the changes. Add ONLY what the request strictly requires.
2. Confirm from source/tests which branches are real. NEVER add speculative checks for cases guaranteed by schema/runtime/contracts.
3. Remove unnecessary helpers/checks BEFORE adding new code. NEVER introduce helpers you plan to remove later.

### Shipping code

- First pass MUST be production-usable, not a placeholder. Front-load design decisions.
- Scope changes to the request. Expand scope ONLY when a dependency forces it.
- Remove dead code in all touched files.

### Refactoring

Iterate until no meaningful simplification remains:

1. Re-read files in scope. Fix regressions from previous iterations first.
2. Target in priority order: **duplicates → prop surface → over-complexity → schema drift**.
3. Apply the simplest design even if structural. Update ALL call sites. Delete replaced code in the same pass.
4. Run `bun run fix && bun run check`. Repeat from step 1.

**Duplicates**: keep ONE canonical implementation — merge, then delete. NEVER deduplicate via helpers.
**Component props**: collapse to minimum surface. Remove redundant, inferable, or duplicate-control props.
**Schema drift**: align with actual runtime boundaries. Remove unused variants and legacy fields.

## VALIDATION

Run after EVERY code change:

```bash
bun run fix && bun run check
```

## OUTPUT STYLE

- Concise. Default: 1–2 sentences or ≤3 bullets. Complex: 1 short paragraph + ≤5 bullets.
- State outcomes only. Include reasoning ONLY when it changes a decision.
- NO explanations unless requested. NEVER end with a question.

## EXTERNAL KNOWLEDGE

NEVER rely on training data for: `better-auth`, `effect`, `tanstack-router`, `ai-sdk`, `pierre-diffs`, `copilot-sdk`, `codex`, `opencode`.

Source of truth is `.opencode/resources/<library>/` (cloned repos). Search these FIRST for APIs, behaviors, and examples.

## CODE STYLE

### General

- Simple and explicit. Follow existing patterns unless refactoring.
- Early returns ALWAYS.
- NO comments. Restructure until code is self-explanatory.
- Delete unused code immediately. NO "just in case" code.
- NEVER abstract prematurely. Duplicate freely.
- NO helper functions for logic used once. Prefer local, direct implementation.
- NO cryptic abbreviations. Allowed: `id`, `url`, `api`, `err`, `ctx`.

### TypeScript

- Rely on inference. NEVER manually define types or cast (except `as const`).
- When a type and constant share a name, declare the type first.
- `function` declarations for all functions except callbacks.
- `pipe(value, ...)` for all transformations.

### React

- React 19 + React Compiler. NEVER manually memoize.
- NEVER destructure props. Use dot notation.
- `cn()` for ALL conditional `className` values.
  - Outside `packages/components`: import from `@ai-toolkit/components/utils`.
  - Inside `packages/components`: import from `#lib/utils.ts`.

### Effect

- Effect v4 — APIs have changed. ALWAYS check `.opencode/resources/effect/`. NEVER rely on training data.
- `.pipe()` method ONLY for instrumentation: timeouts, retries, logging.
- `Effect.fnUntraced` for ALL effectful functions.
- Prefer Effect modules (`Array`, `String`, `Predicate`, `Match`, `Config`, `Schema`, `Stream`) over custom utilities. Delete custom helpers when equivalent exists.
- Services: `ServiceMap.Service<...>()('@ai-toolkit/<package>/<ServiceName>', { make: ... })`.
- Domain errors are yieldable. NEVER use `Effect.fail` for domain errors.
- Callbacks: ONE effectful handler + ONE captured runner. NO repeated inline forks.

## UI

- Theme: `packages/components/src/theme.css` (brutalist shadcn).
- High contrast, visible borders. NO gradients, glass, decorative blur, or marketing cards.
- Existing design tokens ONLY. NEVER invent colors, tokens, or animations.
- Compose shadcn primitives. NEVER reimplement them. Minimal, functional motion.
- Icons over text. Use the most recognizable icon from `lucide-react` or `@icons-pack/react-simple-icons`.
- NEVER edit `packages/components/src/components/ui/`.

```bash
bun shadcn list @shadcn
bun shadcn view button
bun shadcn add button --yes --overwrite
```
