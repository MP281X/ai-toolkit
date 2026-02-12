# AGENTS.md

## META RULES

Zero exceptions. Always follow.

- Analyze step-by-step BEFORE implementation
- Sacrifice grammar for concision
- Remain autonomous—continue without returning to user
- Use `question` tool for blocking questions (never inline)
- Happy-path ONLY; no speculative edge-cases

## TOOLS

### External Libraries (MCP)

- NEVER rely on training data; ALWAYS use `btca` MCP for external libraries
- Run TARGETED queries with NARROW scope (broad queries timeout)
- Run MULTIPLE `btca` calls IN PARALLEL for bigger scopes

Available: `btca_listResources`, `btca_ask`

### Codebase Discovery

- Use `explore` sub-agent early and often
- Spawn MULTIPLE `explore` agents in parallel
- Main agent does all editing/planning

### Validation

- Run `bun run fix && bun run check` in changed packages ONLY (not root) before yielding

## CODE STYLE

### Principles

- Functional: flat, pipeable, side-effect free
- Prefer duplication over premature abstractions
- Follow existing codebase patterns
- Maximize shadcn usage over custom components

### TypeScript

- Use `type` not `interface`
- Rely on type inference; never define return types
- No type casts, no `any`
- Declare type BEFORE const with matching name
- Use `function` declarations (not arrows, except callbacks)
- Avoid `{}` for one-liners; use `{}` when formatter makes unreadable single-lines
- Inline values; no single-use temp variables
- Single-expression `return ...`

### React

- React Compiler enabled—DON'T manually memoize
- Use `cn()` from `@packages/components/src/lib/utils.ts` for className
- NO template literals in className

### Naming & Structure

- NO abbreviations
- NO comments—self-documenting code
- NO destructuring props; use dot notation
- Early returns
- Inline 1-2 line functions
- Duplication over helper functions

### Effect

- Use `pipe(value, ...)` for composition
- Use `.pipe()` ONLY for instrumentation (timeouts, retries, logging)
- Define services with `Effect.Service` using `@packageName/ServiceName` identifiers
- Use `accessors: true` for direct access
- Layer naming: camelCase with Layer suffix (`layer`, `testLayer`)
- NO redundant layer aliases
- NO noisy section-divider comments

### Data Modeling

```typescript
// Records
export type UserId = typeof UserId.Type
export const UserId = pipe(Schema.String, Schema.brand('UserId'))

export class User extends Schema.Class<User>('User')({
  id: UserId,
  name: Schema.String,
}) {}

// Variants
export class Success extends Schema.TaggedClass<Success>()('Success', {
  value: Schema.Number,
}) {}

export class Failure extends Schema.TaggedClass<Failure>()('Failure', {
  error: Schema.String,
}) {}

export type Result = typeof Result.Type
export const Result = Schema.Union(Success, Failure)
```

Brand ALL primitives. Branded types prevent mixing semantically different values.

### Error Handling

- Define domain errors with `Schema.TaggedError`
- Tagged errors are yieldable—no `Effect.fail` needed
- **Typed errors**: recoverable failures (validation, not found, permission)
- **Defects**: unrecoverable bugs—invariants, use `Effect.orDie` at entry
- Wrap unknown errors with `Schema.Defect`

```typescript
// Recovery
Effect.catchTags({ HttpError: () => fallback })
Effect.catchTag('HttpError', () => fallback)
Effect.catchAll(() => fallback)
```

## UI STYLE: MINIMAL BRUTALIST

**Vibe**: Raw, content-first, intentionally "unpolished" but usable. High contrast, blocky layout, thick borders, bold typography, minimal decoration.

**Layout**: Strong structure, simple columns, visible separators, big whitespace, strict spacing rhythm, scroll-first. NO soft cards, gradients, glass effects.

**Typography**: Oversized headings, clear hierarchy via size/weight/spacing, readable body, tight copy.

**Components**: Keep shadcn theme. Win via composition—alignment, spacing, dividers. Keep primitives obvious.

**Motion**: Minimal and functional ONLY. NO "smooth for the sake of smooth".

## SHADCN COMMANDS

```bash
bun shadcn list @shadcn                              # List components
bun shadcn view button                               # View source
bun shadcn add button --yes --overwrite              # Add one
bun shadcn add button card dialog --yes --overwrite  # Add multiple
```

## SHADCN RULES

- Install via CLI: `bun shadcn ...`
- NEVER hand-write shadcn components
- NEVER edit `packages/components/src/components/ui/` (treat as generated)
- Compose/wrap in application code for customization
- Create new components OUTSIDE that directory
