Developer: # AGENTS.md

This repository is an actively evolving TypeScript / React / Effect-TS codebase. APIs, module boundaries, and interactions are still being defined and may change significantly. Optimize for improving the codebase, not for preserving existing patterns or maintaining backward compatibility unless explicitly instructed.

## Core Objective

Write extremely high-quality code that is correct, simple, elegant, and production-grade without requiring human cleanup or follow-up refactors.

The standard is not merely “it works.” The standard is:
- correct
- strictly typed
- readable
- minimally complex
- well-structured
- elegant
- consistent with the surrounding architecture
- resistant to future breakage

If a solution feels hacky, overly clever, over-abstracted, or harder to understand than necessary, assume it is not good enough and look for a better approach.

## Code Quality Standards

Be intentionally strict.

When writing or modifying code:
- Prefer the simplest solution that fully solves the problem.
- Avoid unnecessary abstractions, indirection, generalization, and premature reuse.
- If code looks complex, assume it is likely wrong or over-engineered until proven otherwise.
- Do not stop at the first workable solution. Actively search for the most elegant and maintainable solution.
- Optimize for readability and understandability for both humans and AI agents.
- Strive for clarity of intent in naming, control flow, and module boundaries.
- Keep implementations compact, but not cryptic.
- Avoid “just make it pass” changes.

The goal is perfection-oriented improvement, not minimal patching.

## Stack-Specific Rules

These rules are important and come from repeated issues in this specific stack. Follow them unless the user explicitly instructs otherwise.

### TypeScript
- Rely on inference. Do not add manual types or casts unless they are genuinely necessary.
- Use `function` declarations except for callbacks.

### React
- Target React 19 + React Compiler.
- Never manually memoize.
- Never destructure props.
- Use `cn()` for every conditional `className`.
- Outside `packages/components`: `@ai-toolkit/components/utils`
- Inside `packages/components`: `#lib/utils.ts`

### Effect
- Use Effect v4 only.
- Prefer existing Effect primitives and modules over custom helpers.
- If you think you need a helper, verify Effect does not already provide it.
- Use Effect Schema fully for validation, transformation, and defaulting when applicable.
- Prefer `Effect.fnUntraced` for effectful functions rather than `(args) => Effect.gen(...)`.
- Use `pipe(value, ...)` for transformations. Reserve method `.pipe()` for instrumentation.
- Domain errors are yieldable. Do not use `Effect.fail` for domain errors.
- For callbacks, prefer one effectful handler and one captured runner.

### UI
- Use existing shadcn primitives first.
- Before building custom UI, check the shadcn CLI:
  - `bun shadcn list @shadcn`
  - `bun shadcn add <name> --yes --overwrite`
- Compose primitives; do not reimplement them.
- Keep the visual language in `packages/components/src/theme.css`.
- Use existing design tokens only.
- Prefer high contrast, visible borders, and minimal functional motion.
- Prefer icons over text when clearer.
- Never edit `packages/components/src/components/ui/`.

## External Package Research

When working with any external package, use the BTCA MCP rather than relying on memory or training data.

- BTCA must be used when working with any external package.
- Always call `btca_listResources` before `btca_ask`.
- Do not rely on training data for package APIs, behavior, or documentation.
- Do not query `@ai-toolkit/*` packages via the BTCA MCP; inspect those packages locally instead.
- Keep queries narrow and focused.
- Parallelize independent `btca_ask` calls as much as possible.

## Working in an Evolving Codebase

This codebase is under active iteration. Large refactors and API changes are normal.

Therefore:
- Do not resist architectural or API changes merely to keep older call sites stable.
- When a module or package API changes, expect downstream consumers to be updated accordingly.
- Unless explicitly instructed otherwise, prefer fixing consumers rather than weakening or reverting the module you just improved.
- Do not preserve outdated patterns if a better design is now available.

## Validation Commands

Use:
- `bun run fix`
- `bun run check`

These commands format the code and detect linting and type errors across the monorepo.

This repository enforces very strict typing and linting rules. If the code passes these checks, it is expected to be structurally correct.

Also note:
- The agent has access to LSP diagnostics for files it is actively editing.
- This means local type and formatting errors in touched files should usually be visible immediately.
- As a result, `bun run fix && bun run check` is especially important for detecting issues caused in other packagess.
- A common example is changing a package API and then needing to update consuming packages/apps.

When these commands reveal errors after your changes:
- Unless explicitly instructed otherwise, assume the consumers or dependent packages should be fixed.
- Do not “undo” or dilute an improved module just to satisfy outdated consumers.

## Task Execution Philosophy

Agents should be optimized for long-running, autonomous work that may span the entire codebase.

After the task is clear, work through it to completion with minimal interruption.

However, at the start of a task, you must carefully analyze the user request and identify anything ambiguous, underspecified, inconsistent, or potentially conflicting.

If anything important is unclear, use the question tool to resolve it before proceeding.

Guidelines:
- Front-load clarification.
- Ask clarifying questions early when they materially affect architecture, requirements, or implementation choices.
- It is acceptable to ask multiple targeted clarification questions at the beginning if needed.
- Once the task is sufficiently clear, proceed autonomously and do not ask more questions unless truly blocked.
- Do not interrupt execution for non-blocking uncertainties if a reasonable interpretation can be derived from the clarified context.

The user knows the codebase well and manually reviews AI-written code, so ambiguities and inconsistencies should usually be detectable from the initial request. Detect them proactively.

## Decision Heuristics

Before finalizing any implementation, ask yourself:
- Is this the simplest solution that correctly solves the problem?
- Is there a more elegant approach?
- Am I introducing abstraction that is not justified?
- Does this improve the codebase rather than merely preserving existing structure?
- Would this be easy for another human or agent to understand later?
- If this feels hacky, what is the cleaner design?

Do not accept a mediocre solution when a cleaner one is achievable.

## Default Biases

Default to these assumptions unless the user says otherwise:
- prioritize improving the design over preserving compatibility
- prefer updating consumers after API improvements
- favor simplicity over abstraction
- favor correctness and readability over speed of patching
- complete clarified tasks autonomously
- ask questions only at the beginning unless later blocked by a truly missing decision

## Bottom Line

Your job is to materially improve the codebase with extremely high care.

Be strict.
Be thoughtful.
Be autonomous.
Be simple.
Be elegant.
And do not settle for code that merely works when you can produce code that is obviously correct and clean.
