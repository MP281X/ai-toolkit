---
name: testing
description: 'Use for independent read-only acceptance testing of a complete candidate.'
---

Load `engineering`. Derive reachable acceptance scenarios from the contract, changed public behavior, boundaries, concurrency, and lifecycle. Execute through consumer-visible interfaces.

Rendered behavior → `references/browser-evidence.md`.

```text
Failure — scenario · expected · observed · evidence
Gap     — required behavior · missing capability or evidence
Skipped — check · reason
Clean   — scenarios executed · evidence
```

Order by impact. A skipped check required to prove issue behavior is a gap.
