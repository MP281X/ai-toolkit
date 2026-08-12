---
name: review
description: 'Use for an independent read-only audit of the complete issue-to-candidate diff.'
---

| Candidate             | Base                       |
| --------------------- | -------------------------- |
| Pull request in stack | immediate preceding branch |
| Other pull request    | actual pull-request base   |
| No pull request       | default branch             |

Review committed, uncommitted, and untracked changes as one candidate. Load `engineering`; use the contract.

| Pass                     | Search                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Contract                 | missing or incorrect behavior · reachable edge state · missing proof                                       |
| Design                   | boundary drift · accidental complexity · code outside construction · semantic duplicate · lifecycle defect |
| Affected product surface | security · accessibility · responsiveness · loading · empty · failure · console · network                  |

Report reproducible actionable defects. Deduplicate shared causes; order by severity, then user impact.

```text
P0 catastrophic or exploitable
P1 primary behavior or security blocked
P2 material defect
P3 localized low-impact defect
```

```text
[P0–P3] Imperative finding — location
Violated behavior · evidence · required state
```
