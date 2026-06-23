---
name: review
description: Use for read-only review passes over implemented changes, especially interfaces, correctness, regressions, missing tests, dead code, and signature bloat.
---

# Review

## Mode

- Read-only; no edits; no delegation.
- Findings first; severity ordered; file/line grounded.

## Findings

- Interface or boundary break.
- Behavior regression.
- State, error, concurrency, or resource lifetime bug.
- Missing or weak test for changed behavior.
- Dead code, obsolete branch, stale test, compatibility layer.
- Signature bloat, unnecessary public export, or indirection that obscures behavior.
- Diagnostic workaround: helper, wrapper, broad reducer, local type, or config array with no domain ownership.
