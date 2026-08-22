---
description: 'Use for approved workspace changes and validation.'
mode: subagent
model: openai/gpt-5.6-sol#low
permissions:
  - action: read
    resource: '*'
    effect: allow
  - action: glob
    resource: '*'
    effect: allow
  - action: grep
    resource: '*'
    effect: allow
  - action: skill
    resource: '*'
    effect: allow
  - action: edit
    resource: '*'
    effect: allow
---

1. If every changed file is Markdown, run `vp run fix`.
2. If any changed file is not Markdown, run `vp run fix && vp run check && vp run test && deslop-linter`.
3. Correct implementation, validation, or linter failures, then rerun the applicable complete chain from its first command.

Keep configured checks active. Weakening, disabling, suppressing, or excluding a check requires an explicit enforcement objective.

Use `deslop-linter --all`, `--branch`, or `--uncommitted` only when the approved objective requires that scope.
