# Refactor Agent Configuration

## Goal

Refactor AGENTS.md, agents, skills, and biome rules into a self-improving, self-cleaning system. Eliminate duplication. Make the functional/Effect-first intent impossible to miss. Restore useful examples. Tighten grit messages. Add mandatory post-task self-improvement loop.

## Architecture

4 layers work as one system, like TDD:

| Layer | Role | Analogy | Loaded |
|---|---|---|---|
| **Biome rules** | Static enforcement. Catch violations, regressions, loopholes across full codebase. | Tests | On lint |
| **.md files** (AGENTS.md, skills) | Guidance. Explain WHY. Evolve constantly — improved, simplified, minimized. | Implementation | Always / on demand |
| **Agents** | Workflow per mode. Include validation + self-improve steps. | Test runner | Per agent |

**No content in more than one layer.** Each layer has one job.

**Not append-only.** Every self-improve step should leave the system the same size or smaller. Consolidate, merge, strengthen, remove. Never accumulate edge cases.

**Coexistence:** Biome rules and .md guidance coexist for high-frequency patterns. Biome without guidance = agent hits wall without understanding why. Guidance without biome = no enforcement, no regression detection.

### Layer boundaries

- **AGENTS.md** — generic coding philosophy that always applies. The WHY. No specific API patterns.
- **Skills** — specific to a tool/library/aspect. Source file indexes, patterns, examples. Lazy loaded.
- **Biome rules** — syntactic patterns. First line of defense. Cheapest fix.
- **Agents** — workflow instructions. Include validation and self-improve as mandatory steps.

### Priority escalation (self-improve)

When the agent identifies an issue, fix at the cheapest/most targeted level first:

1. **Biome rule** — syntactically expressible pattern → add/update rule
2. **Error message** — biome rule exists but agent doesn't fix correctly → improve the message
3. **Skill** — agent doesn't understand the alternative → add guidance/example to relevant skill
4. **AGENTS.md** — fundamental philosophical misunderstanding → strengthen the philosophy

Only escalate if the previous level doesn't resolve the problem.

## Writing Style (all .md files)

- Strict guidelines, not suggestions. Authoritative imperative.
- UPPERCASE critical constraints: ALWAYS, NEVER, MUST.
- Positive framing: "use X" over "don't use X" where possible.
- Examples over descriptions when behavior is hard to specify.
- Technical and precise. No verbose jargon.
- Compact. Sacrifice grammar for concision. Fewer tokens = better.
- Optimized for AI agents (GPT-5.4, Claude Opus 4.6), not human readability.
- Written from perspective of an AI coding agent. Keywords the agent would search for. Messages that help it understand what it did wrong and how to fix it.
- Every line must earn its token cost by preventing a frequent, high-impact mistake.

---

## AGENTS.md

### Structure

```
# AGENTS.md
## Skills
## Research
## Code Style
## Package Imports
## Validation
```

Remove "Progress Tracking" — already in system prompt.

### Code Style — rewrite

Generic coding philosophy. No specific API patterns (those go in skills). Style intent for rules agents violate 90% of the time.

**Effect as standard library:**
- Effect modules (`Array`, `String`, `Record`, `Option`, `Predicate`, `Match`, `pipe`, `flow`) are the ONLY vocabulary for data transforms
- NEVER use native prototype methods (`.map()`, `.filter()`, `.trim()`, `.split()`, `.includes()`, etc.)
- NEVER use `typeof` — use `Predicate` helpers
- NEVER use nullish checks (`== null`, `!== null`, `=== undefined`) — use `Predicate` or `Option`
- Compose with `pipe` and `flow`, not intermediate variables

**Type system trust:**
- NEVER annotate types on variables or return types — if inference fails, redesign
- NEVER use `as` assertions — they hide broken designs
- Trust the types. Happy path only. Types say `X` → treat as `X`.
- Boundary validation is complete. No internal guards for typed values.
- Ignore edge cases that are theoretically possible but unreachable.

**Inline everything:**
- NEVER extract property accesses, aliases, boolean checks, simple functions, wrapper functions, or primitive constants
- Inline is mandatory when helper has no real logic
- Only extract when helper contains real logic AND makes code simpler after extraction
- Prefer small local duplication over meaningless extraction

**Control flow:**
- NEVER use `else` — early returns, `Match` for value-producing branches
- NEVER destructure function parameters — access `props.x` keeps data source visible
- Keep control flow flat

**Errors:**
- Biome/TS error → evidence the design is wrong → redesign, not workaround
- Fighting biome rules = wrong approach. Step back and simplify.

### Skills section — 3 bullets

- Skills often have enough context to proceed without research
- Read source files the skill points to for exact signatures
- `.opencode/resources/` is last resort

### Research, Package Imports, Validation — keep as-is

---

## Agents

### build.md — add validation + self-improve

Current workflow:
```
1. Implement following the skill patterns
2. Do not finish until required validation passes
```

New workflow:
```
1. Implement following the skill patterns
2. Validate: `bun run fix` then `bun run check`. Iterate until both pass.
3. Self-improve: load `self-improve` skill. Review conversation for repeated errors, user corrections, retry loops. Update 1-2 highest-impact items across config layers.
```

### development.md — add validation + self-improve

Add to workflow after task completion:
```
5. After completing a task, validate: `bun run fix` then `bun run check`.
6. Self-improve: load `self-improve` skill. Review conversation for patterns the user corrected or repeated issues. Update 1-2 highest-impact items. Then continue with question tool.
```

The user can also trigger self-improve on demand via keywords.

Keep all other staged changes.

### plan.md — no changes

---

## Skills

### Shared structure

```
---
name: <name>
description: <task-oriented trigger. "Load when [doing X]." No negative triggers.>
metadata:
  patterns: <code tokens agent encounters in files it's editing>
---

## Source files
<file paths — updated during self-improve when research discovers useful files>

## Key patterns
<"Where to look" index: concept → files/APIs>

## Examples
<bad/good pairs. Only when genuinely useful. ALWAYS anonymized — generic names, simple types.>
```

### Descriptions and metadata

- Task-oriented: "Load when [doing X]"
- No "Do not load for..." — positive triggers only
- Metadata: code tokens the agent would see in files it's working with
- General topics, not specific function signatures

---

### effect

**Description:** `Load when writing async Effect programs — services, layers, retries, timeouts, concurrency, streams.`

**Metadata:**
```
Effect.gen, Effect.fnUntraced, Effect.service, Effect.provide,
Layer.effect, Layer.succeed, Layer.merge, ServiceMap.Service,
Stream., Schedule., Effect.retry, Effect.timeout, Effect.race
```

**Source files:** Effect.ts, Layer.ts, ServiceMap.ts, Stream.ts, Schedule.ts

**Key patterns** (restore from old `effect-core`):
- Sequential effects: `Effect.gen`, `Effect.fnUntraced`
- Service access: `Effect.service`, `Effect.serviceOption`, `Effect.provide*`
- Service construction: `ServiceMap.Service`, `Layer.effect`, `Layer.succeed`, `Layer.merge`
- Concurrency: `Effect.forEach` options, `race*`, `timeout*`, `retry*`, `Schedule`
- Streams: `Stream` when value is really a stream

**Examples:** keep staged service/layer example, adapt to new writing style.

---

### primitives

**Description:** `Load when transforming data — pipe, flow, Match, Array, Record, String, Option, Predicate.`

**Metadata:**
```
pipe(, flow(, Match.value(, Match.when(, Match.orElse(,
Array.map(, Array.filter(, Array.findFirst(,
Record., String., Option.fromNullable(, Option.map(,
Predicate.isString, Predicate.isNullish, Predicate.hasProperty
```

**Source files:** Function.ts, Predicate.ts, Match.ts, Array.ts, Record.ts, String.ts, Option.ts

**Add reinforcement:** Effect modules are the ONLY vocabulary for data transforms in this repo.

**Restore from old `effect-primitives`:**
- `pipe` when value is in hand, `flow` when building a reusable composed function
- `Match` when branching produces a value
- Composition: `dual`, `identity`, `constant`
- Type guards: `Predicate.*`
- Collections: `Array.*`, `Record.*`
- Strings: `String.*`
- Optionality: `Option.fromNullable`, `Option.map`, `Option.flatMap`

---

### schema

**Description:** `Load when defining data shapes, decoding unknown input, or building encode/decode transformations.`

**Metadata:**
```
Schema.Struct(, Schema.Class(, Schema.TaggedErrorClass(,
Schema.decodeTo(, Schema.encodeTo(, Schema.decodeUnknown,
Schema.optional(, Schema.toStandardSchemaV1(,
SchemaTransformation.transform, SchemaTransformation.transformOrFail
```

**Source files:** SCHEMA.md, Schema.ts, SchemaTransformation.ts, SchemaGetter.ts

**Key patterns** (restore from old `effect-schema`):
- Value transforms: `Schema.decodeTo`, `Schema.encodeTo`, `SchemaTransformation.transform`, `transformOrFail`
- Same-type normalization: `Schema.decode`, `Schema.encode`
- Missing key / Option: `transformOptional`, `optionFromOptionalKey`, `optionFromNullOr`
- Parse middleware: `Schema.middlewareDecoding`, `Schema.middlewareEncoding`
- Reuse/invert: `Schema.flip`, `Transformation.compose`
- Built-ins: `splitKeyValue`, `snakeToCamel`, `fromJsonString`, `dateTimeUtcFromString`
- Lower-level: `SchemaGetter.transform`, `SchemaGetter.transformOrFail`

**Restore best practices:**
- `Schema.Class` / `Schema.Struct` as source of truth
- `decodeTo` / `encodeTo` when shapes differ
- `transformOrFail` when conversion can fail
- `new` for trusted internal construction, decode only at real unknown boundaries

**Restore 2 examples** (adapt to new style):

1. decodeTo transformation:
```typescript
// Bad
const parse = (v: string) => Number(v)

// Good
const Count = Schema.String.pipe(
  Schema.decodeTo(Schema.Number, SchemaTransformation.transform({
    decode: v => Number(v),
    encode: v => String(v)
  }))
)
```

2. Built-in transform:
```typescript
// Bad
const parse = (v: string) => v

// Good
const Query = Schema.String.pipe(Schema.decode(SchemaTransformation.splitKeyValue()))
```

---

### rpc

**Description:** `Load when defining RPC endpoints, grouping them, adding middleware, or wiring client/server.`

**Metadata:**
```
Rpc.make, RpcGroup.make, RpcClient., RpcServer.,
RpcMiddleware., RpcSchema., Rpc.exitSchema,
.middleware(, stream: true, RpcTest.makeClient
```

**Source files:** Rpc.ts, RpcMiddleware.ts, RpcSchema.ts, RpcClient.ts, RpcServer.ts, RpcGroup.ts, RpcTest.ts, RpcMessage.ts

**Key patterns** (restore from old `effect-rpc`):
- Endpoint: `Rpc.make`, `Rpc.exitSchema`
- Groups: `RpcGroup.make`
- Streaming: `Rpc.make(..., { stream: true })`, `RpcSchema.Stream`
- Middleware: `RpcMiddleware.Service`
- Response control: `Rpc.fork`, `Rpc.uninterruptible`
- Assembly: `RpcClient.ts`, `RpcServer.ts`
- Testing: `RpcTest.ts`, `RpcTest.makeClient`

**Restore best practices:**
- Trust RPC schemas as external boundary — no re-validation deeper in app
- `RpcTest.ts` as first end-to-end reference

---

### react

**Description:** `Load when building screens — route files, search params, atom-based state, async UI data, RPC client usage.`

**Metadata:**
```
createFileRoute(, Route.useSearch, Route.useParams,
validateSearch:, Atom., AtomRuntime., useAtom, useAtomSuspense,
AsyncResult., RpcClient.query, RpcClient.mutation,
Atom.keepAlive, Atom.family, Reactivity.
```

**Source files:** keep both sections (Effect Reactivity + TanStack Router)

**Key patterns** (keep current + restore from old `effect-atom`):
- Route: `createFileRoute`, `validateSearch`, `Schema.toStandardSchemaV1`
- Atoms: `Atom.keepAlive`, `AtomRuntime.atom`, `Atom.family`, `Atom.mapResult`
- RPC clients: `AtomRpc.Service`, `RpcClient.query`, `RpcClient.mutation`
- Suspense: `useAtomSuspense`
- Mutation: `AtomRuntime.fn`, `Reactivity.mutation`, `Reactivity.query`, `reactivityKeys`
- Cache: `setIdleTTL`, `keepAlive`, `autoDispose`, `family`
- Stale async: `AsyncResult.previousSuccess`, `getOrElse`, `matchWithWaiting`, `swr`
- Persistence: `kvs`, `searchParam`

**Restore best practices from old `effect-atom`:**
- `useAtomSuspense` for reads by default
- `keepAlive` + stream-inside-atom for long-lived subscriptions
- Reactivity keys for invalidation
- `AsyncResult` helpers for stale data visibility
- `optimistic` / `optimisticFn` for mutation UX

**Restore 3 examples** (adapt to new style):

1. RPC stream pattern:
```typescript
// Bad
const items = AtomRuntime.atom(RpcClient.use(client => client('list', payload)))

// Good
const items = Atom.keepAlive(
  AtomRuntime.atom(pipe(
    RpcClient.asEffect(),
    Effect.map(client => client('list', payload)),
    Stream.unwrap
  ))
)
```

2. AsyncResult stale data:
```typescript
// Bad
const text = result.waiting ? 'loading' : AsyncResult.getOrThrow(result)

// Good
const text = AsyncResult.getOrElse(result, () => 'loading')
```

3. Optimistic updates:
```typescript
// Bad
const pending = {saving: true}

// Good
const optimistic = Atom.optimistic(valueAtom)
```

**Keep:** search params example from staged version.

---

### ai

**Description:** `Load when integrating AI models — structured generation, tool definitions, toolkits, prompts, MCP schemas.`

**Metadata:**
```
LanguageModel.generateObject, Tool.make, Toolkit.make,
Prompt.make, Prompt.concat, Response., McpSchema.,
AnthropicStructuredOutput, OpenAiStructuredOutput
```

**Source files:** keep current list

**Key patterns** (restore from old `effect-ai`):
- Structured output: `LanguageModel.generateObject`
- Provider limits: `AnthropicStructuredOutput.ts`, `OpenAiStructuredOutput.ts`
- Tools: `Tool.make`, `Tool.dynamic`
- Toolkits: `Toolkit.make`, `Toolkit.merge`
- Prompt/response: `Prompt.make`, `Prompt.concat`, `Response`
- MCP: `McpSchema`

**Restore best practices:**
- Schema design is center of AI integration
- Prefer structured outputs over prompting for JSON
- Check provider-specific files when schema works in Effect but fails at provider

---

### ui

**Description:** `Load when building or styling components — Tailwind, theme tokens, shadcn primitives, icons.`

**Metadata:**
```
cn(, className=, theme.css, components/ui,
shadcn, @ai-toolkit/components, tailwind
```

**Source files:** keep current list

**Trim:** remove verbose cn() styling example — biome `cn-classname` enforces this.

**Keep:**
- CLI commands (add, docs, view)
- Visual principles (squared edges, high contrast, no effects, monospace, dense)

---

### self-improve (rename from `add-rule`, different structure)

**Description:** `Load when updating agent configuration — biome rules, skills, AGENTS.md, agent workflows.`

**Metadata:**
```
packages/linter, .grit, register_diagnostic, biome-ignore lint/plugin,
SKILL.md, AGENTS.md, .opencode/agents/, .opencode/skills/
```

**Source files:**
```
packages/linter/src/*.grit
packages/linter/src/-test.tsx
.opencode/skills/*/SKILL.md
.opencode/agents/*.md
AGENTS.md
```

#### Core principle

The configuration system is NOT append-only. It is a living, bounded system that trends toward fewer, stronger rules — never more, weaker ones.

Every self-improve step MUST leave the system the same size or smaller:
- **Strengthen** an existing line before adding a new one
- **Merge** rules that catch variants of the same problem
- **Remove** lines now covered by a stronger line elsewhere
- **Simplify** verbose guidance into a tighter formulation

The goal is resolving root causes, not patching edge cases. Derive the intent behind mistakes: "what led me to write code this way?" → fix that, not the surface symptom.

#### Triggers

Self-improve is activated:
1. **Post-task** (MANDATORY) — after validation passes in build/development agents
2. **Retry loop** — agent does something wrong → gets error → rewrites → also wrong
3. **User correction** — user corrects approach or signals frustration
4. **On demand** — user explicitly asks to add/update a rule or guideline

#### Priority escalation

Fix at the cheapest, most targeted level first. Only escalate if the previous level doesn't resolve:

1. **Biome rule** — syntactically expressible pattern → add/update grit rule
2. **Error message** — biome rule exists but agent doesn't fix correctly → improve the message
3. **Skill** — agent doesn't understand the alternative → add guidance/example to relevant skill
4. **AGENTS.md** — fundamental philosophical misunderstanding → strengthen the philosophy

#### Post-task reflection process

1. Review full conversation for repeated errors, user corrections, retry loops
2. Focus on 1-2 highest-impact systemic issues — not one-off fixes
3. Derive intent: "what led me to write code this way? what rule prevents arriving at this situation?"
4. Decide layer using priority escalation
5. Apply update. Check other layers for redundancy — if adding to one layer, check if another can be simplified.
6. Update skill source file indexes if research discovered useful files not in any skill's index. Remove stale references to changed/removed APIs.

#### Biome rule creation

When creating/modifying GritQL rules:

ALWAYS anonymize test cases and examples. NEVER reference current codebase code. Use generic names (`items`, `value`, `result`), simple types (`string`, `number`), minimal structures.

ALWAYS check existing rules before creating: `packages/linter/src/*.grit`

ALWAYS merge overlapping rules instead of creating near-duplicates.

GritQL template:
```grit
engine biome(1.0)
language js(typescript, jsx)

`$pattern` as $match where {
  register_diagnostic(span=$match, message="<fix instruction>. <why>.")
}
```

Test format:
```typescript
// packages/linter/src/-test.tsx
// biome-ignore lint/plugin: <1-5 word reason>
const bad = codeThatTriggersRule
const good = correctCode
```

Suppression: `// biome-ignore lint/plugin: <1-5 word reason>`

#### Skill maintenance

During self-improve:
- Add source files discovered during research to relevant skill indexes
- Remove stale references to APIs that changed or no longer exist
- Simplify guidance that's now redundant with a biome rule or AGENTS.md change
- Ensure examples follow all coding guidelines (use `pipe` not `.pipe()`, no type annotations, etc.)

#### Cross-layer consistency check

After any config update, verify:
- No duplicated content between AGENTS.md and skills
- No duplicated content between skills
- Biome rules and skill guidance don't contradict
- Examples in skills follow AGENTS.md philosophy

---

## Grit Rule Messages

### Principles

1. Lead with fix instruction, then brief reason.
2. Max ~30 words. No filler ("here", "instead", "in this case").
3. Name exact replacement API/pattern.
4. Consistent tone: `Use X.` / `Remove Y.` / `Rewrite until Z.`

### Messages to tighten

| Rule | Target message |
|---|---|
| no-native-methods | `Use Effect modules: Array.* for arrays, String.* for strings, Record.* for objects. Suppress with // biome-ignore lint/plugin: not a prototype method for external APIs.` |
| no-variable-type-annotation | `Remove type annotation. Rewrite until inference works. For empty containers: Array.empty<T>(), Record.empty<K, V>().` |
| no-return-type-annotation | `Remove return type annotation. Rewrite until inference works.` |
| no-type-assertion | `Remove \`as\` assertion. Inline, simplify, rewrite until inference works.` |
| no-typeof | `Use Predicate helpers: Predicate.isString(x), Predicate.isNumber(x), Predicate.isObject(x).` |
| no-nullish-checks | Shorten each variant: `Use Predicate.isNullish(x).` / `Use Predicate.isNull(x).` / `Use Predicate.isUndefined(x).` etc. |
| no-dynamic-imports | `Use static imports. Dynamic imports hide the module graph.` |
| no-simple-function-variables | `Inline the expression at the use site. Simple helpers add indirection and weaken inference.` |
| no-access-variables | `Inline the access at the use site. Aliases add no logic.` |
| no-simple-check-variables | `Inline the check. Extracting booleans detaches narrowing from the branch.` |

All other rules (no-arg-destructuring, no-arrow-for-named, no-wrapper-functions, no-else, no-primitive-const, no-pipe-method, no-in-operator, no-length-check, no-react-hooks, no-react-type-imports, no-renamed-imports, no-return-undefined-null, no-tailwind-class-variables, no-ternary-in-jsx, cn-classname, no-effect-antipatterns): current messages are good. Keep or apply minor consistency edits.

---

## Decisions

1. **TDD model** — biome rules = tests (catch regressions, ensure consistency). .md = implementation (evolve constantly, explain WHY). Both coexist.
2. **Not append-only** — every self-improve step leaves system same size or smaller. Consolidate, merge, remove. Never accumulate edge cases.
3. **Root causes over edge cases** — derive intent behind mistakes, fix the root cause, not the surface symptom.
4. **Priority escalation** — biome rule → error message → skill → AGENTS.md. Cheapest fix first.
5. **AGENTS.md = philosophy** — generic coding guidelines, no specific API patterns. Effect-as-stdlib, type trust, inlining, flat control flow.
6. **Skills = library specifics** — source files, patterns, examples. Loaded on demand. Independent, no overlap, no cross-references.
7. **Self-improve is MANDATORY** — build and development agents run it after validation. Focus on 1-2 systemic issues.
8. **Agent auto-updates config** — no approval step. Changes applied directly.
9. **Skill index maintenance** — during self-improve. Add useful files from research, remove stale references.
10. **Example anonymization** — generic names, simple types. Never reference codebase code.
11. **Descriptions are task-oriented** — "Load when [doing X]." No negative triggers.
12. **Old examples restored** — schema transforms, atom patterns. Adapted to new writing style.
13. **Self-improve renamed from add-rule** — different structure (process/decision guide, not library reference).
14. **Value per line** — every line must earn its token cost by preventing a frequent, high-impact mistake.
15. **Development agent gets validation step** — validate → self-improve → continue.
