---
name: implementation
description: 'Use only when explicitly invoked to implement one canonical issue and publish its draft pull request.'
---

```mermaid
stateDiagram-v2
	[*] --> Analyze
	Analyze --> Implement
	Implement --> Assurance
	Assurance --> Implement: finding
	Assurance --> Publish: clean
	Publish --> [*]
	Analyze --> Blocked: conflicting contract
	Blocked --> Analyze: resolved
	Blocked --> [*]: unresolved
```

## Analyze

For each issue clause, identify its owning public seam and proof; record only applicable invariants, dependency APIs, and risks. Re-read the issue after compaction.

Load every matching `engineering` reference. Inspect current ownership and linked cloned source.

## Implement

Own all repository writes. Inspect the complete base-to-worktree diff and every changed or untracked file.

## Assurance

Freeze repository writes. Spawn independent testing and review concurrently with clean context. Give each the issue and actual base; both inspect the shared complete worktree. After any repository write, rerun both against the complete candidate.

## Publish

Load `git-operations`. Commit the reviewed tree, push, and create or update one draft pull request closing the issue. Return only its URL.
