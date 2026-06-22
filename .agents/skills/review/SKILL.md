---
name: review
description: Use after implementation for read-only review passes over interfaces, correctness, simplification, dead code, and signature reduction.
---

# Review

## Mode

- Read-only.
- No file edits.
- Main agent owns synthesis.
- Findings first; severity ordered; file/line grounded.

## Passes

- Interface stability: public signatures, services, schemas, exports.
- Correctness: behavior, state, errors, concurrency, boundaries.
- Simplification: direct code, fewer helpers, less duplicated state.
- Dead code: unused exports, obsolete tests, compatibility paths.
- Signature reduction: one semantic input, inferred locals, no config bags.

## Output

- High-signal findings only.
- State no findings explicitly.
- Include residual test/verification risk.
