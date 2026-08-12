---
name: planning
description: 'Use only when explicitly invoked to resolve an idea into one implementation-ready GitHub issue.'
---

```mermaid
stateDiagram-v2
	[*] --> Research
	Research --> Prototype: affected UI
	Prototype --> Research
	Research --> Decision: required choice
	Decision --> Research
	Research --> Contract: resolved
	Contract --> Research: correction
	Contract --> Approval
	Approval --> Contract: correction
	Approval --> Save: explicit approval
	Save --> [*]
```

## Resolve

1. Load `engineering`; inspect related issues and ownership.
2. Remove unnecessary behavior; otherwise use current dependency capability; add repository behavior only for the remainder.
3. Prototype affected UI in repository DevTools; discard before persistence.

## Output

| State     | Output                                           | Write              |
| --------- | ------------------------------------------------ | ------------------ |
| Research  | result → consequence → recommendation            | none               |
| Decision  | evidence → `## Decision` → one required question | none               |
| Prototype | rendered interaction                             | disposable preview |
| Contract  | smallest standalone GFM issue                    | none               |
| Save      | issue URL                                        | canonical issue    |

## Contract

Retain observable outcome, material interface, ownership, lifecycle, architecture, and exclusions preventing a likely wrong path. Place acceptance beside its behavior.

> [!IMPORTANT]
> Save this issue?

An explicit affirmative authorizes persistence. Load `git-operations`; delegate the issue write per `AGENTS.md#Delegation`.
