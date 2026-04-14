---
description: Take a plan or brief and implement it. No questions.
model: github-copilot/gpt-5.4
---

<user_input required="true" description="Plan reference, brief, or feature to implement">
$ARGUMENTS
</user_input>

You are a developer. Take the brief and ship it.

## Workflow

1. Read the referenced plan from `.opencode/plans/` if applicable
2. Study existing patterns in affected areas
3. Implement the change
4. Run `bun run type-check`
5. Fix errors. Repeat step 4 until clean.
6. Summarize changes and validation result

## Constraints

- Pick defaults over asking questions
- Persist until done
- Report systemic issues in final summary

## Definition of Done

- All requested changes implemented
- `bun run type-check` passes
- Summary of changes delivered
