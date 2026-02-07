## Meta Rules

- Analyze step-by-step before implementation
- Sacrifice grammar for concision
- Be autonomous—continue to completion
- Use `question` tool for blocking questions (never ask in response)
- Never rely on training data, ALWAYS up-to-date docs via context7
- Always run `bun run fix && bun run check` only in the package(s) you changed (not repo root) before yielding back to user

## Code Style

### Principles
- Functional: flat, pipeable, side-effect free
- Prefer duplication over premature abstractions
- Follow existing codebase patterns
- Maximize shadcn usage over custom components

### TypeScript
- Never use interfaces, always prefer types
- Rely on type inference
- No type casts
- `any` banned
- Declare type BEFORE const with same name/casing:

### React
- React Compiler enabled—never manually memoize
- Use `cn()` utility from `@packages/components/src/lib/utils.ts` for className composition—never template literals

### Naming & Structure
- No abbreviated variable/argument names
- No comments—code must be self-documenting
- No prop destructuring—use dot notation
- Use early returns
- Inline 1-2 line functions—no named functions for short snippets

## Ui Style (Minimal Brutalist)

- Vibe: minimal brutalist / neobrutalist—raw + content-first, "unpolished" on purpose, still usable; high contrast, blocky layout, thick borders/dividers, bold type, minimal decoration.
- Layout: strong structure (simple columns/sections), visible separators, big whitespace + strict spacing rhythm, scroll-first pages, avoid soft cards/gradients/glass.
- Typography: typography does the heavy lifting—oversized headings, clear hierarchy via size/weight/spacing, readable body, tight copy.
- Components: shadcn theme stays; win via composition (alignment, spacing, dividers), not custom visuals; keep UI primitives obvious.
- Motion: minimal/functional only; no "smooth for the sake of smooth".

## shadcn/ui Commands

```bash
# List all available components
bun shadcn list @shadcn

# View component source
bun shadcn view button

# Add single component
bun shadcn add button

# Add multiple components
bun shadcn add button card dialog
```

# Convex

### Imports

All Convex imports use the `#convex/*` alias:
- `import { query, mutation, action, internalQuery, internalMutation, internalAction, httpAction } from '#convex/server.js'`
- `import { api, internal } from '#convex/api.js'`
- `import { Id, Doc } from '#convex/dataModel.js'`
- `import { v } from 'convex/values'`

### Functions

Always use the new function syntax with validators:

```typescript
import { query } from '#convex/server.js'
import { v } from 'convex/values'

export const f = query({
  args: { name: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    return 'Hello ' + args.name
  },
})
```

- **Public**: `query`, `mutation`, `action` — exposed to the internet
- **Internal**: `internalQuery`, `internalMutation`, `internalAction` — private, only callable by other Convex functions
- ALWAYS include argument and return validators
- Use `returns: v.null()` if function returns nothing
- You CANNOT register functions through `api` or `internal` objects

### Calling Functions

- `ctx.runQuery(api.module.function, args)` — call query from query/mutation/action
- `ctx.runMutation(api.module.function, args)` — call mutation from mutation/action
- `ctx.runAction(api.module.function, args)` — call action from action
- ONLY call action from action if crossing runtimes (V8 to Node)
- Pass FunctionReference, NOT the function directly
- For same-file calls, add return type annotation:

```typescript
const result: string = await ctx.runQuery(api.example.f, { name: 'Bob' })
```

### File-Based Routing

- `convex/example.ts` function `f` → `api.example.f`
- `convex/example.ts` internal function `g` → `internal.example.g`
- `convex/messages/access.ts` function `h` → `api.messages.access.h`

### Validators

Use `v` from `convex/values`:
- `v.id(tableName)` — Id type, use `Id<'tableName'>` from `#convex/dataModel.js`
- `v.null()` — `undefined` is NOT valid in Convex
- `v.int64()` — signed 64-bit integer (`v.bigint()` is deprecated)
- `v.number()` — float64
- `v.boolean()`
- `v.string()`
- `v.bytes()` — ArrayBuffer, max 1MB
- `v.array(values)` — max 8192 values
- `v.object({})` — plain objects only, max 1024 entries
- `v.record(keys, values)` — dynamic keys, use type `Record<Id<'table'>, string>`
- `v.union(v.string(), v.number())`
- `v.literal("value")` — use `as const` for discriminated unions

### Schema

Define in `convex/schema.ts`:

```typescript
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    name: v.string(),
  }).index('by_name', ['name']),
})
```

- System fields: `_id` (Id), `_creationTime` (number)
- Index names must include all fields: `by_field1_and_field2`
- Query index fields in definition order

### Queries

- Use indexes with `withIndex()`, NOT `filter()`
- No `.delete()` on queries — `.collect()` then `ctx.db.delete(row._id)`
- Use `.unique()` for single documents (throws if multiple)
- Use `for await (const row of query)` for async iteration
- Default order: ascending `_creationTime`
- Use `.order('asc')` or `.order('desc')` explicitly

### Pagination

```typescript
import { paginationOptsValidator } from 'convex/server'

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db.query('messages').paginate(args.paginationOpts)
  },
})
```

Returns: `{ page: Doc[], isDone: boolean, continueCursor: string }`

### Full Text Search

```typescript
const messages = await ctx.db
  .query('messages')
  .withSearchIndex('search_body', (q) =>
    q.search('body', 'hello hi').eq('channel', '#general'),
  )
  .take(10)
```

### Mutations

- `ctx.db.insert(table, data)` — insert new document
- `ctx.db.patch(table, id, partial)` — shallow merge
- `ctx.db.replace(table, id, data)` — full replace (throws if missing)
- `ctx.db.delete(table, id)` — delete by id

### Actions

- Add `"use node";` at top if using Node.js built-ins
- NEVER use `ctx.db` inside actions — no database access
- Use `ctx.runQuery`/`ctx.runMutation` to access data

Paths register exactly as specified.

### Scheduling

Use `crons.interval` or `crons.cron` (NOT hourly/daily/weekly helpers):

```typescript
import { cronJobs } from 'convex/server'
import { internal } from '#convex/api.js'

const crons = cronJobs()
crons.interval('task', { hours: 2 }, internal.module.function, {})
export default crons
```

Always import `internal` from `#convex/api.js` even for same-file functions.

### File Storage

- `ctx.storage.getUrl(fileId)` — signed URL (null if missing)
- Query `_storage` table for metadata (NOT `ctx.storage.getMetadata`):

```typescript
const metadata = await ctx.db.system.get('_storage', fileId)
// { _id, _creationTime, contentType?, sha256, size }
```

- Store as Blob, convert to/from Blob when using

# Effect

### Effect.gen & Effect.fnUntraced

Use `Effect.gen` for sequencing operations:

```typescript
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const data = yield* fetchData
  yield* Effect.logInfo(`Processing: ${data}`)
  return yield* processData(data)
})
```

Use `Effect.fnUntraced` for named effects:

```typescript
const processUser = Effect.fnUntraced(function* (userId: string) {
  const user = yield* getUser(userId)
  return yield* processData(user)
})
```

Add cross-cutting concerns via second argument:

```typescript
const fetchWithRetry = Effect.fnUntraced(
  function* (url: string) {
    return yield* fetchData(url)
  },
  flow(
    Effect.retry(Schedule.recurs(3)),
    Effect.timeout('5 seconds')
  )
)
```

### Pipe for Instrumentation

Use `.pipe()` for timeouts, retries, logging:

```typescript
const resilient = apiCall.pipe(
  Effect.timeout('2 seconds'),
  Effect.retry(Schedule.exponential('100 millis').pipe(Schedule.compose(Schedule.recurs(3)))),
  Effect.tap((data) => Effect.logInfo(`Fetched: ${data}`))
)
```

### Services & Layers

Define services as `Context.Tag` classes:

```typescript
import { Context, Effect } from 'effect'

class Database extends Context.Tag('@app/Database')<
  Database,
  {
    readonly query: (sql: string) => Effect.Effect<unknown[]>
  }
>() {}
```

Tag identifiers must be unique (use `@path/ServiceName` pattern). Service methods should have no dependencies (`R = never`).

Implement with Layer:

```typescript
class Users extends Context.Tag('@app/Users')<
  Users,
  { readonly findById: (id: UserId) => Effect.Effect<User, UsersError> }
>() {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      
      const findById = Effect.fnUntraced(function* (id: UserId) {
        const response = yield* http.get(`/users/${id}`)
        return yield* HttpClientResponse.schemaBodyJson(User)(response)
      })
      
      return Users.of({ findById })
    })
  )
}
```

**Layer naming:** camelCase with Layer suffix: `layer`, `testLayer`, `postgresLayer`.

**Provide once at the top:**

```typescript
const appLayer = Layer.mergeAll(
  Users.layer,
  Database.layer,
  Logger.layer
)

const main = program.pipe(Effect.provide(appLayer))
```

### Data Modeling with Schema

**Records (AND types):**

```typescript
export type UserId = typeof UserId.Type
export const UserId = Schema.String.pipe(Schema.brand('UserId'))

export class User extends Schema.Class<User>('User')({
  id: UserId,
  name: Schema.String,
  email: Schema.String,
}) {
  get displayName() { return `${this.name} (${this.email})` }
}
```

**Variants (OR types):**

```typescript
export class Success extends Schema.TaggedClass<Success>()('Success', {
  value: Schema.Number,
}) {}

export class Failure extends Schema.TaggedClass<Failure>()('Failure', {
  error: Schema.String,
}) {}

export type Result = typeof Result.Type
export const Result = Schema.Union(Success, Failure)

// Pattern matching
const render = (result: Result) =>
  Match.valueTags(result, {
    Success: ({ value }) => `Got: ${value}`,
    Failure: ({ error }) => `Error: ${error}`,
  })
```

**Branded types** prevent mixing semantically different values:

```typescript
export type UserId = typeof UserId.Type
export const UserId = Schema.String.pipe(Schema.brand('UserId'))

export type Email = typeof Email.Type
export const Email = Schema.String.pipe(Schema.brand('Email'))

export type Port = typeof Port.Type
export const Port = Schema.Int.pipe(Schema.between(1, 65535), Schema.brand('Port'))
```

In well-designed domains, nearly all primitives should be branded.

### Error Handling

Define domain errors with `Schema.TaggedError`:

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

Tagged errors are yieldable—no `Effect.fail` needed:

```typescript
const rollDie = Effect.gen(function* () {
  const roll = yield* Random.nextIntBetween(1, 6)
  if (roll === 1) {
    yield* BadLuck.make({ roll }) // Direct yield
  }
  return { roll }
})
```

**Recovery:**

```typescript
// Handle specific error
Effect.catchTag('HttpError', (error) => fallback)

// Handle multiple errors
Effect.catchTags({
  HttpError: () => recoverHttp,
  ValidationError: () => recoverValidation
})

// Handle all errors
Effect.catchAll((error) => fallback)
```

**Expected errors vs Defects:**

- **Typed errors** for recoverable domain failures: validation, not found, permissions
- **Defects** for unrecoverable bugs/invariants: use `Effect.orDie` at app entry

Wrap unknown errors with `Schema.Defect`:

```typescript
class ApiError extends Schema.TaggedError<ApiError>()(
  'ApiError',
  { endpoint: Schema.String, statusCode: Schema.Number, error: Schema.Defect }
) {}

const fetchUser = (id: string) =>
  Effect.tryPromise({
    try: () => fetch(`/api/users/${id}`).then(r => r.json()),
    catch: (error) => ApiError.make({ endpoint: `/api/users/${id}`, statusCode: 500, error })
  })
