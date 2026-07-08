---
name: instruction-maintenance
description: Use when creating, updating, deleting, reorganizing, pruning, or reviewing agent instructions, reusable workflows, code-shape policy, lint/static enforcement, AGENTS.md, .agents/skills, custom oxlint rules, rule fixtures, or .fallowrc.json.
---

# Instruction Maintenance

## Load First

- Read `AGENTS.md` and every `.agents/skills/*/SKILL.md`.
- For enforceable policy, inspect `vite.config.ts`, `packages/oxlint-rules/src/oxlint-plugin.ts`, `packages/oxlint-rules/src/oxlint-plugin.test.ts`, and `.fallowrc.json`.

## Ownership

- One meaning, one owner.
- The user gives intent; the agent chooses the owner.
- Put each instruction or enforcement in the narrowest current owner.
- `AGENTS.md`: always-on repo invariants, research, communication, subagents, verification.
- Skills: triggered workflows, domain procedures, nontrivial authoring patterns.
- Lint config/rules: mechanically enforceable policy.

## Placement

- Add or edit the canonical owner instead of adding a mirror; move misplaced guidance to the owner and delete the old copy.
- Treat similar instructions, paraphrases, summaries, examples, reminders, and partial mirrors as duplicates; merge them into one instruction.
- Delete obsolete, stale, contradicted, speculative, and compatibility instructions.
- Do not preserve removed behavior as regression guidance, history, examples, or reminders.
- Avoid cross-reference mirrors.

## Inventory

- Before edits, make a compact owner diff:
  - instruction
  - current owner
  - proposed owner
  - duplicates removed
  - conflicts
  - files affected
- Discuss the owner diff before broad or ambiguous edits.
- Ask when ownership, current intent, winning instruction, or enforcement level is unclear.
- If user placement conflicts with ownership, explain the better owner before editing.

## Writing

- Description routes; body executes.
- Use directive bullets; each word must change agent behavior.
- Pound every word; merge similar instructions and delete ambiguity, duplication, no-op, and misleading language.
- Prefer target behavior over prohibition.
- Always use leading words to collapse repeated behavior into stable handles.
- Prefer leading words already meaningful to the model and repo.
- Repeat the leading word in the description and body only when it improves routing and execution.
- Do not invent jargon when direct wording is clearer.
- Remove no-op prose, repeated rationale, filler examples, and paraphrases.
- Keep concepts colocated; do not scatter definition, rule, and caveat across files.

## Linting

- Use lint when the accepted policy is mechanically detectable and likely to regress.
- Prefer existing Vite Plus, Oxlint, or Fallow configuration before custom rules.
- Add custom Oxlint rules only for repo-specific static shapes: implement in `packages/oxlint-rules/src/oxlint-plugin.ts`, cover expected violations in `packages/oxlint-rules/src/oxlint-plugin.test.ts`, enable in `vite.config.ts`.
- Update `.fallowrc.json` only for dead-code or security analysis ownership.
- Do not encode non-mechanical judgment as lint.
- Do not add lint as a memorial for removed behavior; enforce the current target shape.
- Rule fixes produce the accepted target shape directly.
- Existing diagnostics are resolved into the accepted target shape unless explicitly out of scope.

## Completion

- Search affected skills and `AGENTS.md` for stale mirrors, conflicts, and duplicate wording.
