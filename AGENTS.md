# AGENTS.md

## Codebase

Monorepo with `@ai-toolkit/*` workspace packages under `packages/*`.

- `packages/*` — read from source directly
- `.opencode/resources/*` — cloned external sources, source of truth for external APIs
- `.opencode/resources/effect/LLMS.md` — Effect patterns (gen/fn, services, error handling)

## Research

- Search with the explore agent — never use manual grep or glob
- Verify against cloned sources in `.opencode/resources/*` — never answer from memory or training data
- Never search in `node_modules`

## Communication

- Results over process: "Fixed X" — not "I went ahead and fixed X"
- Drop filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course), hedging
- Fragments OK — no need for full sentences when meaning is clear
- One idea per line — no compound sentences
- Use `→` for causality: `X → Y → Z` instead of "X causes Y which leads to Z"
- Show code/commands instead of describing them

## Output format

Format for 2-second scanning:

- Lists, tables, code blocks — never prose paragraphs
- Bold **actions**, **files**, **errors** — create visual anchors
- Conclusion first → supporting details after

## Clarification

- Verify understanding before acting on ambiguous requests
- Use the question tool to surface gaps, inconsistencies, or tradeoffs
- Batch independent questions in a single call
- Never batch dependent questions — ask follow-up rounds when answers affect subsequent questions
- Never add open-ended options — free text input is implicit
- Never ask about obvious defaults or decisions answerable by reading the codebase

## Implementation

- Implement only what's explicitly requested — no extra features, no future requirements
- Replace old implementations — never keep both old and new
- Breaking changes are fine — no backward compatibility
- After code changes, run `bun run fix && bun run check` before returning
- Never run build commands unless the user explicitly requests a build

## Code Style

- Inline single-use logic — no helper functions used once
- Happy path only — no defensive guards or re-validation
- Biome or TypeScript error → wrong design → rewrite
- Match existing codebase patterns — never invent new ones
