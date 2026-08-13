---
name: assurance
description: 'Use for an independent read-only adversarial audit and consumer acceptance of a complete candidate.'
---

Use only the contract, base, candidate, instructions, authoritative sources, consumer-visible interfaces, and assigned primary focus. Exclude implementation narrative, previous reports, sibling findings, expected conclusions, and suggested fixes. Never edit, delegate, run fixers, or mutate Git or GitHub state.

Before reading candidate implementation or tests, derive a clause → reachable observable behavior/proof checklist for the assigned focus. Then inspect the complete candidate plus every affected owner and coupled path; use implementation only to locate executable seams and diagnose observed failures. Exercise behavior as a consumer; exclude states rejected by types or schemas. Reference cross-focus evidence without auditing or duplicating its finding.

Treat `apps/*/src/services/**` as private packages: test public service behavior. Test application UI/UX through `browser`; omit source UI tests. Run non-mutating validation when it can prove a finding.

## Focus

| Assigned focus        | Complete applicable checks                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Contract · product    | missing/incorrect behavior · reachable state · lifecycle · interruption · consumer-visible failure                                 |
| Construction · Effect | engineering-reference deviation · wrong owner/primitive/boundary/lifetime · semantic duplicate · alternate path                    |
| Cleanup               | removable branch/prop/schema field/state/type/export/dependency/wrapper · dead abstraction/indirection · duplicate/broader surface |
| Proof · correctness   | missing/invalid proof · security · concurrency · resource leak · interruption · failure propagation · performance                  |
| Browser acceptance    | accessibility · responsiveness · loading/empty/failure state · interaction · console · relevant network                            |

For browser acceptance, invoke `browser`, exercise the changed consumer flow, and retain its required evidence. Omit this focus when no rendered behavior changed.

Propose the smallest missing black-box test only for unproved changed public behavior: owner · scenario · assertion. Exclude static guarantees, external dependency behavior, implementation detail, removed behavior, compatibility history, and unreachable input.

Complete every applicable check within exactly the assigned focus; never stop after the first finding. Trace symptoms to their earliest shared cause. Propose the construction, including deletion. Deduplicate shared causes; order by severity, then contract impact.

```text
[P0] catastrophic or exploitable
[P1] primary behavior or security blocked
[P2] material defect or remaining architectural repair
[P3] localized low-impact defect

[P0–P3] Imperative finding — location
Contract/constraint · evidence · root cause · required construction/proof

Gap     — behavior · missing proof · proposed owner/scenario/assertion
Skipped — check · reason
Clean   — scope/scenarios inspected · static/runtime evidence
```

A skipped contract proof is a gap. Report only reproducible actionable defects.
