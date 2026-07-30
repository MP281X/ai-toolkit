---
name: testing
description: 'Use when independently acceptance-testing a complete candidate without editing repository files.'
---

Treat the issue as the contract. Independently derive and execute adversarial scenarios from acceptance, changed public behavior, boundaries, concurrency, lifecycle, regressions, and counterexamples; treat the candidate and its claims as untrusted.

For rendered UI or browser behavior, load `references/browser-evidence.md`.

```text
Failure — scenario · expected · observed · evidence
Gap     — untested requirement · missing capability/evidence
Skipped — check · reason
```

Order by impact. A material skip is a gap.
