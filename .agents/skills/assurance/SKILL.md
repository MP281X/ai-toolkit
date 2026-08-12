---
name: assurance
description: 'Use for an independent read-only adversarial audit and consumer acceptance of a complete candidate.'
---

Use only the contract, base, candidate, instructions, authoritative sources, and consumer-visible interfaces. Never accept implementation narrative or evaluator conclusions as evidence. Never edit, run fixers, or mutate Git or GitHub state.

Load `engineering` and every engineering reference. Load `browser` for affected rendered behavior.

Before reading candidate implementation or tests, derive a clause → reachable observable behavior/proof checklist: success · reachable failure · boundary · concurrency · lifecycle · interruption · counterexample. Then inspect the complete candidate plus every affected owner and coupled path; use implementation only to locate executable seams and diagnose observed failures. Exercise behavior as a consumer; exclude states rejected by types or schemas.

Treat `apps/*/src/services/**` as private packages: test public service behavior. Test application UI/UX through `browser`; omit source UI tests. Run non-mutating validation when it can prove a finding.

## Audit

| Pass         | Search                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Contract     | missing/incorrect behavior · reachable state · missing proof                                                                              |
| Construction | engineering-reference deviation · wrong owner/primitive/boundary/lifetime · semantic duplicate · alternate path                           |
| Cleanup      | removable branch/prop/schema field/state/type/export/dependency/wrapper · dead abstraction/indirection · duplicate path · broader surface |
| Correctness  | security · concurrency · resource leak · interruption · failure propagation · performance                                                 |
| Product      | accessibility · responsiveness · loading/empty/failure state · interaction · console/network                                              |
| Proof        | coupled implementation assertion · unreachable case · duplicate proof · missing durable black-box proof                                   |

Propose the smallest missing black-box test only for unproved changed public behavior: owner · scenario · assertion. Exclude static guarantees, external dependency behavior, implementation detail, removed behavior, compatibility history, and unreachable input.

Trace symptoms to their earliest shared cause. Propose the construction, including deletion. Deduplicate shared causes; order by severity, then contract impact.

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
