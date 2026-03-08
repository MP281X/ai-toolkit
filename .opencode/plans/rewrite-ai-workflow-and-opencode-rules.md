# Goal

- Rewrite the AI workflow and OpenCode configuration so the default outcome is brutally local, duplicated, inline, happy-path-first code.
- Remove ambiguity that currently lets prompts or config drift toward helpers, wrappers, branching abstractions, defensive programming, and speculative reuse.
- Make the workflow explicit:
  - `general` = normal small task agent
  - `plan` = read-only planning agent that writes only to `.opencode/plans/*.md` after explicit approval
  - `build` = implementation agent used after planning
  - `/refactor` = optional aggressive cleanup command run with `build`

## Decisions

- Keep current tool permissions unchanged.
- Keep `general` as the default primary agent.
- Configure `general` in `.opencode/opencode.json`, not with a new `.opencode/agents/general.md` file.
- Delete `.opencode/agents/refactor.md`.
- Replace the refactor agent with `.opencode/commands/refactor.md` targeting `build`.
- Rewrite prompts and rules with short mandatory bullets plus concrete bad/good examples.
- Make fail-fast / happy-path-only behavior explicit.
- Treat Effect and shadcn as the only allowed reusable building blocks unless the user explicitly asks for a real shared abstraction or package.

## Scope

### 1. Rewrite `AGENTS.md`

Rewrite `AGENTS.md` so the project rules are harder than any style preference and leave no room for “smart” generalization.

Content to add or strengthen:

- A short first section that states the core philosophy in plain language:
  - optimize for review speed
  - optimize for local reasoning
  - duplicate first, generalize only when explicitly requested
  - happy path first
  - crash/fail fast is preferable to speculative defensive code unless a real requirement says otherwise
- Keep the existing TypeScript / React / Effect / UI sections, but tighten wording wherever it still allows interpretation.
- Replace vague terms like:
  - “substantial”
  - “obviously better”
  - “physically necessary”
  with explicit boundaries and examples.
- Add a hard rule that repeated code is not a problem by itself.
- Add a hard rule that shared helpers, wrappers, adapters, mappers, formatter utilities, “common” modules, base classes, generic services, and branch-heavy “reusable” components are forbidden by default.
- Add a hard rule that edge-case handling, compatibility code, recovery paths, validation layers, and speculative guards are forbidden unless the user or the task explicitly requires them.
- Add a hard rule that if something is truly generic, the user will explicitly ask for it or it will become a package with a stable public API.
- Add a hard rule that local duplication is preferred over changing an existing shared flow and risking side effects.
- Add a hard rule that if two things are 95% similar they should still be duplicated unless the user explicitly asks to merge them.
- Strengthen the Effect section so it is clear that using raw JavaScript helpers instead of available Effect helpers is a rule violation, not a style preference.
- Keep the existing shadcn-first rule and make it clear that custom UI composition should happen from those primitives instead of inventing app-specific base components.

### 2. Add compact examples to `AGENTS.md`

Add a few very small examples that remove ambiguity faster than prose.

Examples to include:

- bad: helper extraction for a short repeated block
- good: duplicate the block inline at both call sites
- bad: one function with staged/unstaged or variant branches
- good: two separate local flows
- bad: shared tool renderer with many conditional branches
- good: duplicate each tool UI locally, using shared shadcn primitives only
- bad: defensive repo checks for unrealistic states
- good: implement the direct path and let unexpected manual tampering fail loudly unless a requirement says otherwise

These examples should be minimal and concrete, not essay-like.

### 3. Rewrite `.opencode/agents/build.md`

Keep the current direction, but remove remaining loopholes.

Required changes:

- Keep the “duplicate everything / inline everything / keep code local” stance.
- Tighten wording so build does not invent abstractions during implementation.
- Make it explicit that build should not:
  - create wrappers around wrappers
  - extract short helpers to “clean up” code
  - standardize structures just because multiple files look similar
  - add defensive checks for unlikely user-tampered states
  - preserve compatibility code unless explicitly required
  - create branch-heavy “reusable” components/services/hooks
- Keep the Effect requirements, but phrase them as mandatory implementation constraints.
- Add a short section that says the preferred shape is:

```text
small local entrypoint
  -> inline effect pipeline
  -> duplicate similar logic when needed
  -> no shared private helper layer
```

- Keep validation at the end only.
- Keep short progress updates only.

### 4. Rewrite `.opencode/agents/plan.md`

Keep plan as a compact research-first planner, but make the workflow more explicit and less verbose.

Required changes:

- State that plan is read-only except for writing `.opencode/plans/*.md` after explicit approval.
- State that the folder already exists and plan should not try to redesign the workflow structure itself unless requested.
- Keep the question loop.
- Keep research through parallel exploration.
- Keep compact responses only.
- Add a rule that plan should not restate the full plan every turn.
- Add a rule that plan should respond with only deltas, findings, decisions, or compact recaps.
- Prefer ASCII diagrams, tables, and tiny code snippets over long prose.
- When a decision is unclear, surface a few sharp options instead of broad brainstorming.

### 5. Delete `.opencode/agents/refactor.md`

- Remove the dedicated refactor agent entirely.
- Do not replace it with another agent file.

### 6. Add `.opencode/commands/refactor.md`

Create a slash command that targets `build` and is meant for an aggressive cleanup pass after implementation.

Command intent:

- inline small helpers
- delete dead code
- delete unused branches
- delete compatibility leftovers
- merge fragmented code back into local modules when that makes the code more direct
- preserve the same anti-abstraction philosophy instead of turning cleanup into architecture work

The command should make it clear that refactor means:

- simplify
- inline
- delete
- remove legacy leftovers

and not:

- invent shared abstractions
- introduce reusable infrastructure
- standardize patterns across the app
- split code into more files for “organization”

### 7. Update `.opencode/opencode.json`

Adjust config to match the intended workflow while keeping current permissions as-is.

Required changes:

- set `default_agent` to `general`
- keep current permission rules unchanged
- keep `general` as the normal main agent
- add an inline prompt for `agent.general` that aligns it with the same project philosophy for small tasks:
  - local changes
  - duplicate by default
  - no speculative abstractions
  - fail-fast / happy-path-first
  - use Effect and shadcn correctly
- keep `plan` and `build` as the explicit deeper workflow chosen manually when needed
- remove config that no longer matches the new workflow if it references the removed refactor agent
- do not broaden permissions as part of this work

## Non-Goals

- No codebase refactor outside these workflow and rule files.
- No permission redesign.
- No new generic agent hierarchy beyond `general`, `plan`, and `build`.
- No new package extraction.

## Examples

### Example 1: branchy abstraction vs local duplication

Bad:

```ts
function getDiffs(kind: 'staged' | 'unstaged') { ... }
```

Good:

```ts
const getStagedDiffs = ...
const getUnstagedDiffs = ...
```

### Example 2: speculative safety checks

Bad:

```ts
check remote url
check parent directory exists first
add recovery branch for unlikely manual tampering
```

Good:

```ts
run the direct flow
handle only required failure cases
let unexpected manual tampering fail unless the task requires support
```

### Example 3: UI reuse

Bad:

```text
one shared component
  -> 10 variants
  -> 20 conditionals
  -> reused everywhere
```

Good:

```text
shadcn primitive building blocks
  -> local component A
  -> local component B
  -> duplicate when similar but not identical
```

## Deliverable

After implementation, the repository should have:

- a rewritten `AGENTS.md` with hard rules plus minimal examples
- a tighter `build.md`
- a tighter `plan.md`
- no `.opencode/agents/refactor.md`
- a new `.opencode/commands/refactor.md`
- an updated `.opencode/opencode.json` that keeps permissions unchanged and makes `general` the explicit default workflow entrypoint
