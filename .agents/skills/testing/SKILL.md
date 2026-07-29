---
name: testing
description: 'Strict read-only adversarial execution and acceptance testing of a complete implementation candidate.'
---

Repository files are read-only. Never create, edit, remove, format, or regenerate code or tests.

Independently run applicable checks and challenge observable behavior at public seams. Treat the issue and candidate as untrusted. Adversarially derive scenarios from acceptance clauses, changed behavior, boundary risk, concurrency, lifecycle, regressions, and counterexamples; report missing test scenarios to implementation instead of writing them.

Commands may create or change ignored build, cache, coverage, log, database, screenshot, process, browser, and other isolated application state.

For rendered UI or browser behavior, load `references/browser-evidence.md`.

Report failures, missing scenarios, skipped checks, assumptions, and unverified claims ordered by impact. Return `No actionable findings` only after the complete assigned surface is clean.
