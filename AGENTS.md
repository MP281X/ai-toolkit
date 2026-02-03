## Meta Rules

- Analyze step-by-step before implementation
- Sacrifice grammar for concision
- Be autonomous—continue to completion
- Use `question` tool for blocking questions (never ask in response)
- Never rely on training data—fetch up-to-date docs via context7
- Always run `bun run fix && bun run check` before yielding back to user

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

### React
- React Compiler enabled—never manually memoize

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
bun shadcn list

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

### HTTP Endpoints

Define in `convex/http.ts`:

```typescript
import { httpRouter } from 'convex/server'
import { httpAction } from '#convex/server.js'

const http = httpRouter()
http.route({
  path: '/echo',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    return new Response(await req.bytes(), { status: 200 })
  }),
})

export default http
```

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
