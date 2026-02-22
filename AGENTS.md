# AGENTS.md

---

## SECTION 0: EXECUTION

Zero exceptions.

These rules are intentionally strict because the agent frequently gets these wrong. Assume the rules apply unless the user explicitly says to break them.

- **MUST** complete the task end-to-end; never stop early.
- **MUST NOT** ask permission questions.
- If blocked with no safe default, use the `question` tool (never inline).

Blocked workflow:
1. Do all non-blocking work first.
2. Ask exactly ONE targeted question via `question`.
3. Include a recommended default.

---

## SECTION 1: VALIDATION

**AFTER EVERY CODE CHANGE (not docs):**

```bash
bun run fix && bun run check
```

- Run in each modified package.
- **MUST NOT** run at repository root.
- Fix all failures; rerun until passing.

---

## SECTION 2: COMMUNICATION

- Default: 1-2 sentences OR max 3 bullets.
- Complex: 1 short paragraph, then max 5 bullets (What, Where, Risks, Next, Verify).
- State outcomes; include the "why" only when it changes decisions.
- **NEVER** end responses with questions.

---

## SECTION 3: WORKFLOW

- **NEVER rely on training data** — your knowledge is always outdated.
- Primary source of truth: `.opencode/resources/{reponame}` (cloned repos).
- Available repos: `better-auth`, `effect`, `tanstack-router`, `ai-sdk`.
- **MUST** search these repos first for behaviors, APIs, and examples.
- Use `explore` agents for open-ended research; parallelize independent calls.
- Use `glob`/`grep`/`read` for targeted lookups in this workspace only after checking resources.

---

## SECTION 4: CODE

### 4.1 General

- Prefer simple, explicit code; follow local patterns unless refactoring.
- Prefer duplication over premature abstraction.
- **MUST** use early returns.
- Avoid comments; refactor for clarity.
- **NEVER** use comments to patch unreadable code; refactor (rename, extract, restructure) until it is self-explaining.
- Delete unused code; **NEVER** keep "just in case".
- Remove old patterns; **NEVER** add compatibility layers.

### 4.2 TypeScript

- **MUST** use `type` (not `interface`).
- **NEVER** declare return types (prefer inference).
- **NEVER** use `any`, non-null assertions (`!`), or type casts (except `as const`).
- **MUST** declare types before constants with matching names.
- **MUST** use `function` declarations (except callbacks).
- **MUST** use `pipe(value, ...)` for transformations.

### 4.3 React

- React 19 + React Compiler: **NEVER** manually memoize.
- **NEVER** use `useEffect`.
- **NEVER** destructure props; use dot notation.
- `className`: always use `cn()`.
- `cn()` import: `@ai-toolkit/components/utils` (inside `packages/components`, use `#lib/utils.ts`).

### 4.4 Naming

- **NEVER** use unclear abbreviations.
- **NEVER** use single-letter variables (except `id`, `url`, `api`, `err`, `ctx`).

### 4.5 Effect

- **MUST** use `pipe(value, ...)` for composition.
- Use `.pipe()` **ONLY** for instrumentation (timeouts, retries, logging).
- **MUST** define services with `Effect.Service` using `@ai-toolkit/<package>/<ServiceName>` and `accessors: true`.
- **MUST** name layers `camelCase` + `Layer` suffix (e.g., `dbLayer`, `testLayer`).
- **NEVER** create redundant layer aliases.

### 4.6 Data Modeling

- **MUST** brand boundary primitives (ids, money, urls, etc.).

```typescript
export type UserId = typeof UserId.Type
export const UserId = pipe(Schema.String, Schema.brand('UserId'))

export class User extends Schema.Class<User>('User')({
  id: UserId,
  name: Schema.String,
}) {}
```

### 4.7 Errors

- **MUST** define domain errors with `Schema.TaggedError`.
- Domain errors are yieldable; **NEVER** use `Effect.fail` for domain errors.
- Use typed errors for recoverable failures; use defects for invariants.

Recovery:
```typescript
Effect.catchTags({ HttpError: () => fallback })
Effect.catchTag('HttpError', () => fallback)
Effect.catchAll(() => fallback)
```

---

## SECTION 5: REFACTORING

- Refactor architecture, not just local functions.
- Change signatures freely if it simplifies.
- Update all call sites.

---

## SECTION 6: UI

- Use the brutalist shadcn theme from `packages/components/src/theme.css`.
- Vibe: raw, content-first, intentionally "unpolished" but usable; high contrast; visible borders/separators.
- Layout: strong structure, simple columns, strict spacing rhythm, scroll-first; avoid soft cards.
- Typography: clear hierarchy via size/weight/spacing; readable body; tight copy.
- **MUST** use existing tokens; **NEVER** invent colors/tokens/animations.
- **NEVER** use gradients, glass, decorative blur, or "marketing" cards.
- Compose shadcn primitives; **NEVER** reimplement primitives; keep motion minimal and functional.
- Install via CLI only; **MUST NOT** edit `packages/components/src/components/ui/`.

Shadcn commands (use these to discover newly added components):

```bash
bun shadcn list @shadcn
bun shadcn view button
bun shadcn add button --yes --overwrite
```

---

## SECTION 7: SCOPE

- **MUST** implement exactly what the user requests.
- When ambiguous: pick the simplest valid interpretation and proceed.
- **NEVER** add speculative edge-case handling beyond requirements or failing tests.
- **NEVER** implement extra features.
