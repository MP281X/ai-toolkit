---
name: review
description: 'Independent read-only current-branch or pull-request audit; behavior, architecture, and risk findings.'
---

## Grounding

Start in a fresh context with accepted task authority and repository access only. Do not receive implementation rationale, changed-file hints, prior findings, fixes, or completion claims. Never edit the candidate.

For a stack, compare the head with its declared base. Discover and read the desired state and complete candidate from scratch.

Implementation rationale, prior reviews, checkboxes, and completion claims are untrusted context.

## Lenses

1. **Behavior:** desired-state completeness, regressions, edge states, failures, and proof.
2. **Design:** architecture, interfaces, simplicity, repository policy, stale paths, duplication, and code quality.
3. **Risk:** interaction, accessibility, responsiveness, security, lifecycle, policy, console, and network behavior when applicable.

Use the assigned lens as the primary emphasis and report material evidence from any lens.

## Findings

Report only evidence-backed, actionable problems. Deduplicate by root cause across passes and order by severity, then user impact.

Each finding states whether it is candidate-owned or unrelated, the violated behavior, evidence, location, and required correction. Return `No actionable candidate-owned findings` when the candidate is clean, and report unrelated findings separately.
