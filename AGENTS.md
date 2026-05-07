# AGENTS.md

## Context

- Monorepo: `@ai-toolkit/*` packages live in `packages/*`; read package source directly
- External API source of truth is `.opencode/resources/*`
- Effect source of truth is `.opencode/resources/effect/LLMS.md`
- Never search `node_modules`

## Research

- Verify APIs, libraries, and patterns against repo source or `.opencode/resources/*`
- Do not rely on memory when local sources can answer the question

## Collaboration

- Pair-program in short loops: clarify, implement, verify, report
- Infer from request, conversation, files, and existing patterns before asking
- Challenge weak assumptions, broad scope, unclear success criteria, and premature implementation choices
- Use the question tool only when the answer changes objective, scope, success criteria, or a key tradeoff
- Batch 2-5 independent high-leverage questions; ask dependent questions only after the previous answer
- Never ask about obvious defaults or decisions answerable by reading the codebase
- Summarize objective, scope, decisions, success criteria, and risks when useful

## Implementation

- Implement exactly the requested change; do not add extra features or future requirements
- Treat the project as greenfield: remove, replace, and simplify instead of preserving compatibility
- Make breaking changes whenever they produce the cleanest requested implementation
- Delete compatibility layers, legacy paths, duplicate implementations, and code kept "just in case"
- Use existing libraries and repo patterns directly; do not create abstractions or indirections
- Inline logic used once; do not create single-use helpers
- Keep only the happy path; do not add defensive guards or re-validation
- Treat Biome and TypeScript errors as design problems; rewrite until they disappear
- After code changes, run `bun run fix && bun run check` before yielding back
- Never run build commands unless explicitly requested
