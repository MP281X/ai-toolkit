# AGENTS.md

## MANDATE

- Complete every task end-to-end.
- Execute exactly what is requested. No additional changes.
- Act without asking. Ask only when a request is genuinely ambiguous and cannot be reasonably inferred.
- When blocked: finish all non-blocking work first, then ask one targeted question via the `question` tool with a recommended default.
- Breaking changes are acceptable.
- No backward compatibility.
- No migration layers, no deprecations, no aliases, no compatibility props, no adapter wrappers.
- Happy path only. No defensive coding. No edge-case handling unless explicitly requested.

## EXECUTION MODE

- Primary goal in normal tasks: ship the requested feature/change with clear and simple code.
- First pass should be production-usable, not a placeholder.
- Keep refactors local to the requested scope unless user asks for broader refactoring.
- Remove obvious dead code directly related to touched files.
- Do not run repository-wide simplification by default.
- Use `/refactor-max` for iterative, cross-cutting, hyper-aggressive simplification and debt removal.

## VALIDATION

After every code change, run this command in the root:

```bash
bun run fix && bun run check
```

## OUTPUT STYLE

- Concise over grammatically correct. Drop filler words.
- Default response: 1–2 sentences or ≤3 bullets.
- Complex responses: 1 short paragraph + ≤5 bullets.
- Prefer ASCII diagrams and code snippets over prose.
- State outcomes only. Include reasoning only when it changes a decision.
- No explanations unless explicitly requested.
- Never end with a question.

## EXTERNAL KNOWLEDGE

Never rely on training data for the following libraries — it is outdated: `better-auth`, `effect`, `tanstack-router`, `ai-sdk`, `pierre-diffs`, `copilot-sdk`, `codex`.

- Primary source of truth: `.opencode/resources/<library>/` (cloned repositories).
- Search these repositories first for behaviors, APIs, and examples.

## CODE STYLE

### General

- Keep code simple and explicit. Follow existing patterns unless the task is a refactor.
- Use early returns always.
- No comments. Restructure code until it is self-explanatory.
- Delete unused code immediately. No "just in case" code.
- Never abstract prematurely. Duplicate freely.
- Prefer local, direct logic over creating new helpers.
- No short or cryptic abbreviations. Allowed exceptions: `id`, `url`, `api`, `err`, `ctx`.

### TypeScript

- Never manually define types. Always rely on TypeScript inference.
- Never use type casts, except `as const`.
- When a type and constant share a name, declare the type first.
- Use `function` declarations for all functions except callbacks.
- Use standalone `pipe(value, ...)` for transformations.


### React

- React 19 + React Compiler. Never manually memoize.
- Never destructure props. Use dot notation.
- Use `cn()` for all conditional `className` values.
    - Outside `packages/components`: import from `@ai-toolkit/components/utils`.
    - Inside `packages/components`: import from `#lib/utils.ts`.


### Effect

- The project is using Effect v4. Many APIs have changed. Never rely on training data; always check `.opencode/resources/effect/` for current APIs.
- Use standalone `pipe(value, ...)` for composition.
- Use `.pipe()` method only for instrumentation: timeouts, retries, logging.
- Services: `ServiceMap.Service<...>()('@ai-toolkit/<package>/<ServiceName>', {make: ...})`.
- Domain errors are yieldable. Never use `Effect.fail` for domain errors.

## UI

- Theme file: `packages/components/src/theme.css` (brutalist shadcn).
- High contrast, visible borders. No gradients, no glass, no decorative blur, no marketing cards.
- Layout: strong structure, simple columns, strict spacing, scroll-first. Typography: size + weight + spacing hierarchy.
- Use existing design tokens only. Never invent colors, tokens, or animations.
- Compose shadcn primitives. Never reimplement them. Motion: minimal and functional.
- Icons: prefer icons over text; choose the most recognizable icon from `lucide-react` or `@icons-pack/react-simple-icons` that fits the brutalist theme.
- Never edit files in `packages/components/src/components/ui/`. 

- Use the CLI:

```bash
bun shadcn list @shadcn
bun shadcn view button
bun shadcn add button --yes --overwrite
```
