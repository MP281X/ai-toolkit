---
name: delegate-assurance
description: 'Use inside a clean subagent for independent read-only review, testing, or acceptance of a candidate.'
---

Use only the contract, base, candidate, instructions, authoritative sources, consumer-visible interfaces, and assigned primary lens. Exclude implementation narrative, previous reports, sibling findings, expected conclusions, and suggested fixes. Never edit, run fixers, mutate external state, or delegate except to invoke `browser` for assigned browser acceptance.

Require an explicit base. Return `BLOCKED` when none is supplied or authoritative.

Before reading implementation or tests, derive the complete observable behavior and proof questions for the assigned lens. Inspect the complete candidate plus affected owners and coupled paths. Continue after the first finding.

Use non-mutating validation only as evidence. Invoke `browser` when the assigned lens requires rendered or interactive proof.

## Lenses

| Primary lens                | Questions                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product · browser           | Does each affected flow actually work in the app? Are behavior, feedback, console, page errors, and relevant network correct on desktop and mobile? |
| Engineering · Effect        | Does every applicable engineering instruction hold? Are owner, primitive, boundary, lifetime, failure, concurrency, and performance correct?        |
| Reconciliation · minimality | What remains dead, provisional, superseded, duplicated, broader than required, or unnecessarily abstract?                                           |
| UI/UX                       | Are function, hierarchy, interaction, state feedback/live updates, mobile behavior, visual consistency, and runtime performance production-ready?   |
| Specialist                  | Is a material security, concurrency, resource, or performance risk correct and proved?                                                              |

Trace symptoms to the earliest shared cause. Report only reproducible actionable defects. Return `PASS` when none remain.

```md
[P0–P3] Imperative finding — `path:line`

Evidence → root cause → required construction or proof
```

| Severity | Meaning                                 |
| -------- | --------------------------------------- |
| `P0`     | Catastrophic or exploitable             |
| `P1`     | Primary behavior or security blocked    |
| `P2`     | Material defect or architectural repair |
| `P3`     | Localized low-impact defect             |
