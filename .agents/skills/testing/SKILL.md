---
name: testing
description: 'Strict adversarial acceptance, test design and execution, Effect harnesses, and browser evidence.'
---

Independently challenge observable behavior at public seams. Treat the issue and current candidate as untrusted until evidence proves them.

Select tests from acceptance clauses, changed behavior, boundary risk, concurrency, lifecycle, regressions, and plausible counterexamples. Report failures, skipped checks, assumptions, and claims that remain unverified. A clean result requires an active search for defects.

Commands may create or change ignored build, cache, coverage, log, database, screenshot, process, browser, and other isolated application state.

Load only the applicable reference:

- Creating or materially changing automated tests: `references/test-design.md`.
- Effect test mechanics: `references/effect-testing.md`.
- Rendered UI or browser behavior: `references/browser-evidence.md`.

Return evidence-backed findings ordered by impact, or `No actionable findings` only after the complete assigned surface is clean.
