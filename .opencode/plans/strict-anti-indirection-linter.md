# Strict Anti-Indirection Linter Plan

## Objective

Replace `packages/linter` with a source-of-truth CLI + SDK that finds AI-generated code slop deterministically.

The tool should power `.opencode/commands/refactor.md` and make the refactor loop stricter, less negotiable, and less dependent on agent judgment.

Primary goal:

- Detect indirection, unnecessary abstraction, mutation, non-pipeable code, and type indirection.
- Emit oxlint-style diagnostics for agents.
- Require structural refactors until no resolvable diagnostics remain.
- Never offer autofixes as the main path.
- Never give agents easy escape hatches like exporting, renaming, moving to `utils`, or suppressing.

Non-goal:

- Do not optimize for conventional readability.
- Do not preserve small abstractions because they look reusable.
- Do not build an autofixer for complex structural changes.
- Do not expose user config or allowlists for strict rules.

## Core Philosophy

AI agents tend to create append-only abstractions:

```ts
const getUserId = (user: User) => user.id

const buildUserHref = (user: User) => `/users/${getUserId(user)}`

const renderUserLink = (user: User) => <Link href={buildUserHref(user)}>{user.name}</Link>
```

Preferred shape:

```tsx
<Link href={`/users/${user.id}`}>{user.name}</Link>
```

The guiding question for every abstraction:

```txt
Does this abstraction hide meaningful complexity or policy?
```

If not:

```txt
Inline it.
```

The codebase should be simple, linear, pipeable, and un-abstract inside implementation boundaries.

Packages can still be black boxes:

```txt
package public API -> small stable interface
package internals -> direct, linear, minimal indirection
```

## Source Of Truth Contract

The strict linter is not advice.

It is the contract for the refactor command.

Agent-facing rules:

- A diagnostic means the current structure is wrong.
- Fix diagnostics through structural refactor.
- Do not suppress diagnostics.
- Do not rename symbols to satisfy rules.
- Do not export symbols to satisfy rules.
- Do not move code to `utils` to satisfy rules.
- Do not add compatibility layers, overloads, adapters, or fallback branches.
- Continue until all resolvable diagnostics are gone.

Blockers:

- A blocker is not an accepted exception.
- A blocker fails the command.
- A blocker means either the code needs a deeper refactor or the rule needs better precision.
- Continue resolving every other diagnostic before reporting blockers.

Slash-command wording should avoid permission language like:

```md
If this is an edge case, skip it.
```

Use wording like:

```md
Assume strict lint diagnostics are correct.
Resolve every diagnostic through the structural refactor implied by the rule message.
If no behavior-preserving rewrite exists, continue resolving all other diagnostics, then fail with a blocker report that explains the exact external API requirement and why each attempted rewrite changes behavior.
```

## Product Shape

Build a CLI for slash commands, staged checks, local runs, and CI-like validation.

CLI modes:

- `bunx @ai-toolkit/deslop --staged`
- `bunx @ai-toolkit/deslop --unstaged`
- `bunx @ai-toolkit/deslop --changed`
- `bunx @ai-toolkit/deslop <files...>`
- `bunx @ai-toolkit/deslop --full` only when explicitly requested

The main workflow should run on staged/changed files first.

The tool should hardcode generated/vendor exclusions.

No user-facing config.

## Hardcoded Exclusions

Exclude before linting:

```txt
node_modules/**
dist/**
build/**
coverage/**
.turbo/**
.next/**
.output/**
*.d.ts
**/components/ui/**
**/bun.lock
**/package-lock.json
**/pnpm-lock.yaml
.opencode/resources/**
.opencode/plans/**
```

Rationale:

- Generated/vendor/external sources should not produce diagnostics.
- Edge cases should be fixed in rule precision, not bypassed by agents.
- No allowlist/config that agents can edit to avoid work.

## Architecture

Use a hybrid model.

### Oxlint Layer

Use oxlint for fast AST-local diagnostics.

Pattern from React Doctor:

```txt
generate temporary oxlint config
load custom JS plugin through jsPlugins
spawn oxlint CLI with --format json
parse diagnostics
render standard output / JSON
```

Why:

- Fast parser/traversal.
- ESLint-like JS plugin API.
- Good diagnostic format.
- Built-in plugins can supplement rules later.

Constraints:

- Oxlint JS plugins are alpha.
- Oxlint docs say JS plugins do not currently support type-aware rules.
- Type-aware and cross-file rules should live in the SDK analyzer layer.

### SDK Analyzer Layer

Needed for deterministic structural rules that oxlint JS plugins alone cannot handle well:

- Single-use types across files.
- Namespace type external-reference checks.
- Cross-file single-use functions.
- Interface/type reference graph.
- Type-aware native prototype method distinction.
- Package API surface analysis.

The CLI should expose one internal Effect entrypoint:

```ts
const result =
	yield *
	runDeslop({
		mode: 'staged',
		cwd
	})
```

Return shape should stay simple first:

```ts
interface StrictDiagnostic {
	rule: string
	severity: 'error'
	message: string
	filePath: string
	line: number
	column: number
}
```

Future evidence fields can be added later:

```ts
interface StrictDiagnosticEvidence {
	symbolName?: string
	replacementKind?: 'inline-expression' | 'inline-type' | 'direct-call' | 'effect-module-helper'
	relatedLocations?: Array<{
		filePath: string
		line: number
		column: number
		label: string
	}>
}
```

All strict diagnostics should be `error` for agent-facing output.

## Oxlint Invocation Model

Use React Doctor as the reference.

Expected command shape:

```sh
node path/to/oxlint -c /tmp/deslop-oxlintrc/oxlintrc.json --format json file1.ts file2.tsx
```

Config shape:

```json
{
	"categories": {
		"correctness": "off",
		"suspicious": "off",
		"pedantic": "off",
		"perf": "off",
		"restriction": "off",
		"style": "off",
		"nursery": "off"
	},
	"jsPlugins": ["./dist/strict-plugin.js"],
	"rules": {
		"ai-toolkit/no-simple-condition-variable": "error"
	}
}
```

Prefer spawning the CLI instead of relying on undocumented SDK internals.

## Rule Message Requirements

Diagnostics are for AI agents first.

Messages must be explicit and action-oriented.

Messages must not describe loopholes.

Bad:

```txt
This helper is private and only used once.
```

Good:

```txt
This helper only hides a simple expression. Inline the expression at the call site so the data flow stays linear.
```

Bad:

```txt
This type is allowed if exported.
```

Good:

```txt
This named type hides a local shape. Inline the shape at the consuming boundary.
```

Bad:

```txt
Native method disallowed unless this is not a built-in receiver.
```

Good:

```txt
Use the Effect module helper instead of a native prototype method. Replace string, array, and record transforms with `String.*`, `Array.*`, or `Record.*` inside `pipe`.
```

## Initial Rule Families

### Anti-Indirection Rules

Report simple variables:

```ts
const isActive = status === 'active'
const hasItems = items.length > 0
const name = user.profile.name
const canSubmit = form.isValid && !form.isSubmitting
```

Expected refactor:

```ts
if (status === 'active') {
	// ...
}
```

Rules:

- `no-simple-condition-variable`
- `no-access-variable`
- `no-derived-simple-variable`
- `no-single-use-variable`

Report access helpers:

```ts
const getUserName = (user: User) => user.name

function getConfigPort(config: Config) {
	return config.server.port
}
```

Expected refactor:

```ts
user.name
config.server.port
```

Rules:

- `no-access-helper`
- `no-one-line-function`
- `no-single-expression-function`

Report signature wrappers:

```ts
const getUser = (id: string) => api.user.get({id})

const saveName = (name: string) => save({name})

const parseJson = (value: string) => JSON.parse(value)
```

Expected refactor:

```ts
api.user.get({id})
save({name})
JSON.parse(value)
```

Rules:

- `no-signature-wrapper`
- `no-pass-through-function`
- `no-call-shape-adapter`

Report branch-growing helpers:

```ts
const getLabel = (item: User | Team | Project, fallback = 'Unknown') => {
	if ('displayName' in item) return item.displayName
	if ('name' in item) return item.name
	if ('title' in item) return item.title
	return fallback
}
```

Expected refactor:

```tsx
<UserRow label={user.displayName} />
<TeamRow label={team.name} />
<ProjectRow label={project.title} />
```

Rules:

- `no-union-normalizer-helper`
- `no-configurable-helper`
- `no-helper-branch-growth`

### Type Indirection Rules

Default policy:

```txt
Rely on type inference everywhere possible.
Inline explicit shapes only at function/component argument positions.
```

Forbidden:

```ts
type UserName = string
```

Forbidden even when complex:

```ts
interface CreateUserInput {
	name: string
	email: string
	role: 'admin' | 'user'
}

function createUser(input: CreateUserInput) {
	return User.create(input)
}
```

Expected refactor:

```ts
function createUser(input: {name: string; email: string; role: 'admin' | 'user'}) {
	return User.create(input)
}
```

Forbidden callback aliases:

```ts
type OnSubmit = (value: string) => void

function Form(props: {onSubmit: OnSubmit}) {}
```

Expected refactor:

```ts
function Form(props: {onSubmit: (value: string) => void}) {}
```

Forbidden return/variable annotations:

```ts
const user: User = yield * getUser()

const getUser = (): Effect.Effect<User, UserError> => User.find()
```

Expected refactor:

```ts
const user = yield * getUser()

const getUser = () => User.find()
```

Rules:

- `no-variable-type-annotation`
- `no-return-type-annotation`
- `no-type-alias-for-object-shape`
- `no-interface-for-object-shape`
- `no-function-signature-type-alias`
- `no-callback-type-alias`
- `no-named-function-args-type`
- `no-single-use-type`
- `no-single-use-interface`

### Component Props Rules

Always inline component props, independently of complexity.

Forbidden:

```tsx
interface ButtonProps {
	label: string
	disabled?: boolean
	onClick: () => void
}

export function Button(props: ButtonProps) {
	return <button disabled={props.disabled}>{props.label}</button>
}
```

Expected refactor:

```tsx
export function Button(props: {label: string; disabled?: boolean; onClick: () => void}) {
	return <button disabled={props.disabled}>{props.label}</button>
}
```

Forbidden namespace props:

```tsx
export function RichTextArea(props: RichTextArea.Props) {}

export namespace RichTextArea {
	export interface Props {
		value: string
		onChange: (value: string) => void
	}
}
```

Expected refactor:

```tsx
export function RichTextArea(props: {value: string; onChange: (value: string) => void}) {}
```

Rules:

- `no-named-props-type`
- `no-namespace-props-type`
- `no-props-interface-for-component`

### Namespace Type Rules

Namespace types are not a general escape hatch.

Allowed only when both are true:

- The namespace name matches the function/component name.
- The type is non-props and referenced from another file as an external contract.

Potentially valid:

```tsx
export function RichTextArea(props: {ref?: Ref<RichTextArea.Handle>}) {}

export namespace RichTextArea {
	export interface Handle {
		focus: () => void
		snapshot: () => Snapshot
	}

	export interface Snapshot {
		value: string
		selectionStart: number
		selectionEnd: number
	}
}
```

Invalid if local-only:

```txt
This namespace type hides a local shape. Inline the shape where it is consumed.
```

Rules:

- `no-local-namespace-type`
- `no-namespace-props-type`
- `no-namespace-callback-alias`

### Functional / Effect Style Rules

Use Effect modules instead of native prototype methods for collection/string/record transforms.

Forbidden:

```ts
const names = users.map(user => user.name).filter(Boolean)
```

Expected refactor:

```ts
const names = pipe(
	users,
	Array.map(user => user.name),
	Array.filter(Predicate.isTruthy)
)
```

Forbidden:

```ts
items.push(item)
return items
```

Expected refactor:

```ts
return Array.append(items, item)
```

Forbidden:

```ts
const result = []
for (const item of items) {
	if (item.active) {
		result.push(item.name)
	}
}
return result
```

Expected refactor:

```ts
return pipe(
	items,
	Array.filter(item => item.active),
	Array.map(item => item.name)
)
```

Rules:

- `no-native-prototype-method`
- `no-mutation`
- `no-accumulator-loop`
- `no-imperative-array-transform`
- `no-method-pipe`

Precision rule:

- Keep syntax rules simple first.
- Do not add naming-based exceptions.
- Add type-aware exceptions only when needed and deterministic.
- False positives should lead to rule improvements, not agent skips.

### Control Flow Rules

Keep control flow flat and visible.

Rules:

- `no-else`
- `no-then`
- `no-dynamic-imports`
- `no-redundant-guard`
- `no-nullish-checks` where current rules already cover it

Preferred:

```ts
if (!user) return null

return <User user={user} />
```

Avoid:

```ts
if (user) {
	return <User user={user} />
} else {
	return null
}
```

## Existing Package To Replace

Current package:

```txt
packages/linter
```

Current implementation:

- `packages/linter/package.json`
- `packages/linter/biome.refactor.json`
- `packages/linter/src/*.grit`

Current tech:

- Biome config with Grit plugins.
- Diagnostics only.
- Invoked by `.opencode/commands/refactor.md` through `bunx biome lint --staged --config-path=packages/linter/biome.refactor.json`.

Current limitations:

- Syntax-pattern driven.
- Weak cross-file/reference analysis.
- No proper export awareness.
- No type-aware native-method distinction.
- Agents can skip diagnostics due to command wording.

The new package should preserve useful current rules while making them stricter and moving structural checks into SDK analyzers.

## Slash Command Integration

Current command:

```txt
.opencode/commands/refactor.md
```

Current issue:

```md
If a custom lint error targets required external API usage or a framework API with no equivalent rewrite, leave it unchanged and add it to the skipped custom lint list.
```

Future command should remove skip language.

Future loop:

```txt
collect staged/changed files
run strict linter
agent refactors all diagnostics
rerun strict linter
repeat until zero resolvable diagnostics
run bun run check
fail if blockers remain
```

Definition of done:

- Strict linter reports zero resolvable diagnostics.
- `bun run check` passes.
- Blockers fail the command with proof, not an accepted skip list.

## Research Sources

Use these sources before implementation.

### Oxlint Docs

Primary docs:

- `https://oxc.rs/docs/guide/usage/linter.md`
- `https://oxc.rs/docs/guide/usage/linter/cli.md`
- `https://oxc.rs/docs/guide/usage/linter/js-plugins.md`
- `https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.md`
- `https://oxc.rs/docs/guide/usage/linter/config-file-reference.md`
- `https://oxc.rs/docs/guide/usage/linter/type-aware.md`
- `https://oxc.rs/docs/guide/usage/linter/output-formats.md`

Questions to answer from docs:

- Exact JS plugin shape and supported ESLint APIs.
- Whether JS plugins support fixes/options/selectors needed here.
- Current type-aware limitations for JS plugins.
- JSON output shape.
- Config fields for `jsPlugins`, `plugins`, `rules`, `ignorePatterns`, and `options`.

### React Doctor Reference Repo

Path:

```txt
.opencode/resources/react-doctor
```

Key files:

- `.opencode/resources/react-doctor/packages/react-doctor/src/cli.ts`
- `.opencode/resources/react-doctor/packages/react-doctor/src/scan.ts`
- `.opencode/resources/react-doctor/packages/react-doctor/src/utils/run-oxlint.ts`
- `.opencode/resources/react-doctor/packages/react-doctor/src/oxlint-config.ts`
- `.opencode/resources/react-doctor/packages/react-doctor/src/plugin/types.ts`
- `.opencode/resources/react-doctor/packages/react-doctor/src/plugin/index.ts`
- `.opencode/resources/react-doctor/packages/react-doctor/src/plugin/rules/*.ts`
- `.opencode/resources/react-doctor/packages/react-doctor/package.json`

Extract:

- CLI -> scan -> oxlint execution flow.
- Temporary oxlint config generation.
- JS plugin registration.
- Rule visitor shapes.
- Diagnostic parsing and cleanup.
- File batching and ignore handling.
- Staged-file materialization strategy.

Important React Doctor pattern:

```txt
custom CLI
-> generate temp oxlint config
-> include plugin with jsPlugins
-> spawn oxlint --format json
-> parse diagnostics
-> render custom report
```

### Current Linter Package

Path:

```txt
packages/linter
```

Files:

- `packages/linter/package.json`
- `packages/linter/biome.refactor.json`
- `packages/linter/src/*.grit`
- `packages/linter/src/-test.tsx`

Extract:

- Existing rule inventory.
- Current diagnostic wording.
- Existing edge cases and false positives.
- Current Effect module/prototype method policy.
- Current type annotation rules.
- Existing Biome limitations to avoid repeating.

### Refactor Command

Path:

```txt
.opencode/commands/refactor.md
```

Extract:

- Current staged-file workflow.
- Current 5-pass loop.
- Current skip language that must be removed.
- Current definition of done.

Future command should call the new CLI instead of:

```sh
bunx biome lint --staged --config-path=packages/linter/biome.refactor.json
```

### Effect Patterns

Sources:

- `.opencode/resources/effect/LLMS.md`
- repo usages under `packages/*`
- current `packages/linter/src/no-native-methods.grit`
- current `packages/linter/src/no-effect-antipatterns.grit`

Extract:

- Preferred `pipe`, `Array`, `String`, `Record`, `Option`, `Effect`, `Match` usage.
- Valid Effect-required type patterns.
- Existing service/tag/schema patterns that cannot be inlined because library APIs require named constructs.

### Package API Examples

Paths:

- `packages/components/src/lib/utils.ts`
- `packages/components/src/components/rich-text-area.tsx`
- `packages/components/src/components/form.tsx`
- `packages/components/src/components/icons.tsx`
- `packages/ai/src/service.ts`
- `packages/ai/src/tools/contracts.ts`
- `packages/ai/src/catalog.ts`
- `packages/git/src/service.ts`
- `packages/git/src/schema.ts`
- `packages/opentelemetry/src/client.ts`
- `packages/opentelemetry/src/server.ts`

Extract examples of:

- Legitimate package-level policy helpers like `formatError` and `formatNumber`.
- Dependency facade exports used to avoid direct consumer dependencies.
- Namespace component contracts like `RichTextArea.Handle` / `RichTextArea.Snapshot`.
- Effect service contracts that require named classes/types.
- Current abstractions that would become deslop diagnostics.

## Implementation Phases

### Phase 1: Rule Spec And Fixture Corpus

Create fixture examples before implementation.

For each rule:

- Bad input.
- Expected diagnostic message.
- Preferred refactored output as documentation only.
- Edge blocker example if relevant.

Start with current Grit rules and add stricter type/props examples.

Do not build autofixes.

### Phase 2: Oxlint Plugin Prototype

Implement local AST-only rules first:

- `no-simple-condition-variable`
- `no-access-variable`
- `no-one-line-function`
- `no-access-helper`
- `no-signature-wrapper`
- `no-pass-through-function`
- `no-variable-type-annotation`
- `no-return-type-annotation`
- `no-named-props-type`
- `no-named-function-args-type`
- `no-callback-type-alias`
- `no-native-prototype-method` simple syntax version

Use oxlint JS plugin shape from docs and React Doctor.

### Phase 3: CLI Wrapper

Implement CLI around SDK:

- staged file discovery
- unstaged file discovery
- changed file discovery
- path mode
- hardcoded exclusions
- temp oxlint config
- oxlint spawn
- JSON parse
- standard diagnostic output

Do not add config.

### Phase 4: SDK Cross-File Analyzer

Implement structural reference rules:

- `no-single-use-type`
- `no-single-use-interface`
- `no-local-namespace-type`
- cross-file namespace type reference checks

Use TypeScript project/reference graph or another deterministic analyzer.

Keep first target narrow: type/reference rules.

### Phase 5: Replace Refactor Command Integration

Update `.opencode/commands/refactor.md` to use new CLI.

Remove skip-list language.

Make strict lint source of truth.

Command should fail if blockers remain.

### Phase 6: Rule Precision Improvements

After real usage:

- Improve native prototype rule with type-aware receiver detection.
- Reduce false positives by deterministic type evidence only.
- Add cross-file single-use function rules.
- Add pass-through component/props rules.
- Add helper branch-growth rules.

Do not add naming-based exceptions.

Do not add allowlists.

## Open Questions For Implementation

- Which parser/reference engine should power SDK cross-file rules?
- Can oxlint JSON diagnostics include enough related-location data for agent use, or should SDK diagnostics merge evidence after oxlint output?
- Should staged mode lint staged snapshots like React Doctor, or is working-tree staged file selection enough for the first version?
- How much of current `packages/linter/src/*.grit` should be ported one-to-one before adding stricter rules?
- Which current package API types are real external contracts and should be preserved by cross-file evidence?

## Success Criteria

The plan succeeds when:

- `packages/linter` no longer depends on Biome/Grit for strict refactor rules.
- CLI and SDK expose the same diagnostic engine.
- `.opencode/commands/refactor.md` uses the new strict linter.
- Agents cannot complete the refactor command while resolvable strict diagnostics remain.
- Simple variables, helpers, wrappers, props types, argument type aliases, callback aliases, variable annotations, and return annotations are reported aggressively.
- Type shapes are inlined at function/component boundaries.
- Native collection/string/record prototype transforms are pushed toward Effect module helpers.
- Blockers fail with proof instead of becoming accepted exceptions.
