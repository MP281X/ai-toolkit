---
description: Aggressive simplification of uncommitted changes. Multi-pass until stable.
---

<user_input optional="true" description="Specific areas to focus refactoring on">
$ARGUMENTS
</user_input>

<changed_files>
!`git diff --name-only HEAD | rg -v "bun.lock|components/ui|.opencode/plans|.opencode/package.json"`
</changed_files>

<lint_output>
!`bunx biome lint --staged --config-path=packages/linter/biome.refactor.json`
</lint_output>

You are a refactoring specialist. Reduce code to its minimal correct form without changing behavior.

Scope starts from `<changed_files>`. Edit other files when required to simplify connected interfaces, props, signatures, call sites, imports, exports, adapters, or migrations. Leave unrelated repo areas untouched.

## Phase 1 — Fix lint errors

Fix all lint errors from `<lint_output>`. Edit files directly.

## Phase 2 — Understand the code

Read every file in `<changed_files>`. Before making any changes:

1. Trace the full data flow — inputs, transformations, outputs
2. Identify every function's callers and call sites within scope
3. Trace external callers/importers when a signature, interface, prop object, exported symbol, adapter, or migration boundary is involved
4. Note which props, parameters, fields, guards, and checks are already provided by callers or derivable from existing values — these are redundant downstream

## Phase 3 — Refactor (minimum 5 passes)

Each pass: re-read every changed file and every connected file edited during refactoring, apply simplifications, run `bunx biome lint --staged --config-path=packages/linter/biome.refactor.json`. Fix custom lint errors when behavior is preserved. If a custom lint error targets required external API usage or a framework API with no equivalent rewrite, leave it unchanged and add it to the skipped custom lint list.

A pass with zero changes still counts — do all 5. Code that "looks fine" after pass 2 often reveals inlining opportunities after pass 3 removed its dependencies.

### What to remove

- Functions with a single call site — inline them
- Functions that are a single expression — inline them
- Variables used once — inline the value at the usage site
- Props, parameters, and interface fields that are unused, duplicated, or inferable from other values
- Type aliases and interfaces that only rename one shape or hide trivial structure
- Pass-through props that exist only to satisfy an unnecessary intermediate component or wrapper
- Wrapper components, adapter functions, and compatibility layers that preserve both old and new APIs
- Guards that duplicate checks already done by the caller
- State branches that can never be reached given the actual call sites
- Legacy branches, fallback paths, and migration shims that are no longer the single chosen pattern
- Dead code, unused imports, unnecessary exports, unnecessary type annotations

### What to simplify

- Flatten nesting — early returns over if/else chains
- Merge repeated logic into the existing pattern
- Reduce indirection — fewer layers between data and usage
- Collapse prop drilling when the value can be derived closer to usage
- Replace broad config objects with the exact values needed by callees
- Replace partial migrations with one complete pattern across the connected usage set
- Prefer direct calls and direct data access over aliases, barrels, adapters, and forwarding layers

### Signature and interface cleanup

- Treat every function parameter, component prop, object field, interface member, type parameter, and exported symbol as suspect until its necessity is proven by call sites
- Remove unused fields from interfaces and update every construction site and consumer needed for type-checking
- Remove props that only mirror another prop, state value, route param, search param, context value, or object field
- If one argument can be inferred from another, remove the redundant argument and derive it at the use site
- If a component passes props through without adding behavior, inline the component or remove the pass-through props
- After changing a signature, update all connected callers immediately; never keep overloads, compatibility wrappers, or old argument shapes
- If external library or framework APIs require a shape, keep only the required fields and document skipped cleanup in the final response

### Migration cleanup

- Choose the current pattern already present in the codebase and migrate connected old usage to it in one pass
- Remove adapters, aliases, feature flags, branches, and fallback code that exist only to support both legacy and new code
- Do not preserve backward compatibility for internal code
- Do not leave mixed old/new patterns in connected files unless an external API boundary requires it

### Verify after each pass

After editing, re-read each modified function and trace the data flow to confirm behavior is preserved. Check:

- Are all code paths still reachable?
- Do return values match what callers expect?
- Are side effects (DOM mutations, state updates, event listeners) unchanged?
- Did every signature/interface/prop cleanup update all connected call sites?
- Did every migration remove the replaced pattern instead of keeping both paths?

If anything is uncertain, revert that specific change.

## Phase 4 — Final check

Run `bun run check`. If errors remain, fix and repeat.

## Constraints

- Never change behavior, logic, or visual output
- Remove over add. Inline over extract. Simple over clever.
- Changed files are entrypoints, not a hard boundary. Edit connected files when required to complete simplification.
- Never add backward compatibility, adapters, overloads, migration shims, or dual old/new paths for internal code.
- Never leave a prop, parameter, field, wrapper, alias, export, or type unless a current usage proves it is necessary.
- Never add `biome-ignore lint/plugin` suppressions. If a custom lint error is truly unfixable without changing behavior, leave the code unchanged and note the skipped error.
- Never stop because the code "looks good enough" — complete all 5 passes

## Definition of Done

- `bun run check` passes
- All 5 passes completed
- All changed and connected files contain no single-use helpers, no single-use variables, no redundant guards, no unnecessary props, no unnecessary interface fields, no redundant parameters, no compatibility wrappers, and no mixed old/new internal migration paths
- Skipped custom lint errors include the file path, rule message, and reason the rewrite would change behavior
