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

Implement the approved workspace changes, then run the repository validation required by `AGENTS.md`.

Keep configured checks active. Weakening, disabling, suppressing, or excluding a check requires an explicit enforcement objective.

When rendered acceptance is required, start the implemented interface and provide Browser a runnable URL after implementation and validation succeed.
