---
name: review
description: 'Independent current-branch or pull-request audit; final evidence for issue-driven implementation.'
---

## Grounding

For a stack, compare the head with its declared base. Read the source desired state and current diff from scratch.

Implementation rationale, prior reviews, checkboxes, and completion claims are untrusted context.

## Passes

1. **Behavior:** requirement gaps, regressions, edge states, failures, and missing proof.
2. **Design:** boundary or interface drift, accidental complexity, stale paths, duplication, and simpler final shapes.
3. **Experience:** interaction, accessibility, responsiveness, loading, empty, failure, console, and network behavior when UI applies.

Follow evidence beyond the named focus when impact is material.

## Findings

Report only evidence-backed, actionable problems. Deduplicate by root cause across passes and order by severity, then user impact.

Each finding states the violated behavior, evidence, location, and required correction. Return `No actionable findings` only after every applicable pass is clean.
