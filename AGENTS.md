# AGENTS.md

## META RULES

ALWAYS FOLLOW these directives. ZERO exceptions.

- MUST analyze step-by-step BEFORE implementation
- MUST sacrifice grammar for concision
- MUST remain autonomous—continue to completion without polling
- MUST use the `question` tool for blocking questions (NEVER ask inline)
- NEVER rely on training data; ALWAYS use `btca` MCP for ANY library/API work
- MUST implement happy-path ONLY; do NOT add speculative edge-case handling unless explicitly requested
- MUST use the `explore` sub-agent for codebase discovery (early and often)
- MUST spawn multiple sub-agents in parallel for independent exploration work ONLY
- MUST run `bun run fix && bun run check` ONLY in the specific package(s) you changed (NOT at repo root) BEFORE yielding control back to user

## SUB-AGENT USAGE

- Use the `explore` sub-agent for codebase discovery
- Spawn multiple `explore` sub-agents in parallel for independent exploration tasks
- All editing, planning, and implementation work is done by the main agent

## CODE STYLE

### PRINCIPLES

- MUST write functional code: flat, pipeable, side-effect free
- MUST prefer duplication over premature abstractions
- MUST follow existing codebase patterns
- MUST maximize shadcn usage over custom components

### SHADCN / GENERATED UI

- MUST install shadcn components via the CLI: `bun shadcn ...`
- MUST NEVER hand-write shadcn components
- MUST NEVER edit files in `packages/components/src/components/ui/` (treat as generated)
- MUST compose or wrap components in application code for customization
- MUST create new components OUTSIDE `packages/components/src/components/ui/` when needed

### TYPESCRIPT

- MUST NOT use `interface`; use `type` declarations
- MUST rely on type inference; NEVER DEFINE RETURN TYPES unless strictly necessary
- MUST NOT use type casts
- MUST NOT use `any`
- MUST declare the type BEFORE the const with matching name/casing
- MUST use `function` declarations over arrow functions (except callbacks and inline arguments)
- MUST avoid `{}` blocks for one-liners
- MUST use `{}` when the formatter forces unreadable single-line control flow
- MUST avoid single-use temporary variables; inline the full property path or value where it is used
- MUST use single-expression `return ...` over assigning then returning
- MUST use `async`/`await` over `.then(...)` chains
- MUST use `Predicate` helpers for nullable checks instead of ad-hoc `== null` or `!value` checks

### REACT

- React Compiler is enabled—MUST NOT manually memoize
- MUST use the `cn()` utility from `@packages/components/src/lib/utils.ts` for className composition
- MUST NOT use template literals for className

### NAMING & STRUCTURE

- MUST NOT abbreviate variable or argument names
- MUST NOT add comments—code must be self-documenting
- MUST NOT destructure props; use dot notation
- MUST use early returns
- MUST inline 1-2 line functions
- MUST use duplication over helper functions

### EFFECT / COMPOSITION

- MUST use `pipe(value, ...)` over method-chaining `value.pipe(...)`
- MUST use `.pipe(...)` ONLY for Effect instrumentation (timeouts, retries, logging)
- MUST avoid noisy section-divider comments; keep modules focused and minimal
- MUST NOT create redundant layer aliases or exports for Effect services
- MUST use `Service.Default` directly unless a shared layer export is clearly needed

## UI STYLE: MINIMAL BRUTALIST

### VIBE

Minimal brutalist / neobrutalist—raw, content-first, intentionally "unpolished" while remaining usable. High contrast. Blocky layout. Thick borders and dividers. Bold typography. Minimal decoration.

### LAYOUT

Strong structure with simple columns and sections. Visible separators. Big whitespace. Strict spacing rhythm. Scroll-first pages. AVOID soft cards, gradients, or glass effects.

### TYPOGRAPHY

Typography does the heavy lifting. Oversized headings. Clear hierarchy via size, weight, and spacing. Readable body text. Tight copy.

### COMPONENTS

Keep the shadcn theme. Win via composition—alignment, spacing, dividers—not custom visuals. Keep UI primitives obvious.

### MOTION

Minimal and functional ONLY. NO "smooth for the sake of smooth".

## SHADCN COMMANDS

```bash
# List all available components
bun shadcn list @shadcn

# View component source
bun shadcn view button

# Add single component
bun shadcn add button --yes --overwrite

# Add multiple components
bun shadcn add button card dialog --yes --overwrite
```

## EFFECT PATTERNS

### EFFECT.GEN & EFFECT.FNUNTRACED

MUST use `Effect.gen` for sequencing operations:

```typescript
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const data = yield* fetchData
  yield* Effect.logInfo(`Processing: ${data}`)
  return yield* processData(data)
})
```

MUST use `Effect.fnUntraced` for named effects:

```typescript
const processUser = Effect.fnUntraced(function* (userId: string) {
  const user = yield* getUser(userId)
  return yield* processData(user)
})
```

Add cross-cutting concerns via the second argument:

```typescript
const fetchWithRetry = Effect.fnUntraced(
  function* (requestUrl: string) {
    return yield* fetchData(requestUrl)
  },
  flow(
    Effect.retry(Schedule.recurs(3)),
    Effect.timeout('5 seconds')
  )
)
```

### PIPE FOR INSTRUMENTATION

MUST use `.pipe()` for timeouts, retries, and logging:

```typescript
import { pipe } from 'effect'

const resilient = apiCall.pipe(
  Effect.timeout('2 seconds'),
  Effect.retry(
    pipe(
      Schedule.exponential('100 millis'),
      Schedule.compose(Schedule.recurs(3))
    )
  ),
  Effect.tap((data) => Effect.logInfo(`Fetched: ${data}`))
)
```

### SERVICES & LAYERS

MUST define services using `Effect.Service`:

```typescript
import { Effect } from 'effect'

class Database extends Effect.Service<Database>()('@app/Database', {
  effect: Effect.gen(function* () {
    const connection = yield* createConnection
    
    const query = Effect.fnUntraced(function* (statement: string) {
      return yield* executeQuery(connection, statement)
    })
    
    return { query }
  })
}) {}
```

Service identifiers MUST be unique. Use the `@path/ServiceName` pattern. Service methods MUST have no dependencies (`R = never`).

Use `accessors: true` to enable direct access:

```typescript
class Users extends Effect.Service<Users>()('@app/Users', {
  accessors: true,
  effect: Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient

    const findById = Effect.fnUntraced(function* (userId: UserId) {
      const response = yield* httpClient.get(`/users/${userId}`)
      return yield* HttpClientResponse.schemaBodyJson(User)(response)
    })

    return { findById }
  })
}) {}

// With accessors: true, can use yield* Users.findById(userId)
const program = Effect.gen(function* () {
  const user = yield* Users.findById(userId)
  return user
})
```

**LAYER NAMING CONVENTION:** Use camelCase with the Layer suffix: `layer`, `testLayer`, `postgresLayer`.

**PROVIDE ONCE AT THE TOP:**

```typescript
import { pipe } from 'effect'

const appLayer = Layer.mergeAll(
  Users.layer,
  Database.layer,
  Logger.layer
)

const main = pipe(program, Effect.provide(appLayer))
```

### DATA MODELING WITH SCHEMA

#### RECORDS (AND TYPES)

```typescript
import { pipe } from 'effect'

export type UserId = typeof UserId.Type
export const UserId = pipe(Schema.String, Schema.brand('UserId'))

export class User extends Schema.Class<User>('User')({
  id: UserId,
  name: Schema.String,
  email: Schema.String,
}) {
  get displayName() { return `${this.name} (${this.email})` }
}
```

#### VARIANTS (OR TYPES)

```typescript
export class Success extends Schema.TaggedClass<Success>()('Success', {
  value: Schema.Number,
}) {}

export class Failure extends Schema.TaggedClass<Failure>()('Failure', {
  error: Schema.String,
}) {}

export type Result = typeof Result.Type
export const Result = Schema.Union(Success, Failure)

function render(result: Result) {
  return Match.valueTags(result, {
    Success: (success) => `Got: ${success.value}`,
    Failure: (failure) => `Error: ${failure.error}`
  })
}
```

#### BRANDED TYPES

Branded types prevent mixing semantically different values:

```typescript
import { pipe } from 'effect'

export type UserId = typeof UserId.Type
export const UserId = pipe(Schema.String, Schema.brand('UserId'))

export type Email = typeof Email.Type
export const Email = pipe(Schema.String, Schema.brand('Email'))

export type Port = typeof Port.Type
export const Port = pipe(Schema.Int, Schema.between(1, 65535), Schema.brand('Port'))
```

In well-designed domains, nearly ALL primitives should be branded.

### ERROR HANDLING

MUST define domain errors with `Schema.TaggedError`:

```typescript
class ValidationError extends Schema.TaggedError<ValidationError>()(
  'ValidationError',
  { field: Schema.String, message: Schema.String }
) {}

class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  'NotFoundError',
  { resource: Schema.String, id: Schema.String }
) {}
```

Tagged errors are yieldable—NO `Effect.fail` needed:

```typescript
const rollDie = Effect.gen(function* () {
  const roll = yield* Random.nextIntBetween(1, 6)
  if (roll === 1) return yield* BadLuck.make({ roll })
  return { roll }
})
```

#### RECOVERY

```typescript
Effect.catchTags({
  HttpError: () => recoverHttp,
  ValidationError: () => recoverValidation
})

Effect.catchTag('HttpError', () => fallback)

Effect.catchAll(() => fallback)
```

#### EXPECTED ERRORS VS DEFECTS

- **TYPED ERRORS** for recoverable domain failures: validation errors, not found, permission denied
- **DEFECTS** for unrecoverable bugs and invariants: use `Effect.orDie` at application entry

Wrap unknown errors with `Schema.Defect`:

```typescript
class ApiError extends Schema.TaggedError<ApiError>()(
  'ApiError',
  { endpoint: Schema.String, statusCode: Schema.Number, error: Schema.Defect }
) {}

function fetchUser(userId: string) {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(`/api/users/${userId}`)
      return response.json()
    },
    catch: (cause) =>
      ApiError.make({ endpoint: `/api/users/${userId}`, statusCode: 500, error: cause })
  })
}
```
