# Git conventions

## Identity

```ebnf
identity = type, "(", scope, "): ", outcome ;
type = "feat" | "fix" | "refactor" | "perf" | "chore" | "docs" | "test" | "ci" | "style" ;
```

| Field     | Constraint                                                  |
| --------- | ----------------------------------------------------------- |
| `scope`   | Shortest repository term naming the affected semantic Owner |
| `outcome` | Delivered result; never implementation process              |
| Any field | Agent and tool names forbidden                              |

## Branch

```ebnf
branch = type, "/", scope, "/", kebab-case-outcome ;
```

| Branch | Scope                           |
| ------ | ------------------------------- |
| One    | One issue or independent change |

## Title

```ebnf
title = type, "(", scope, "): ", imperative-outcome ;
```

| Field              | Constraint                                            |
| ------------------ | ----------------------------------------------------- |
| Imperative outcome | At most 50 characters after `: `; no trailing period  |
| Vocabulary         | Repository terms                                      |
| Verbs              | `support`, `improve`, `update`, and `draft` forbidden |

## Commit

Use the title without a body.

## Issue

```md
## Problem

<current user-visible or engineering problem>

## Outcome

<required final behavior>

## Acceptance

- <observable acceptance condition>

## Constraints

<only material constraints; omit this section when empty>
```

## Pull request

When an issue owns the contract:

```md
## Changes

- <delivered final state> — <reason absent from the issue>

Closes #<number>
```

Without an issue:

```md
## Problem

<problem not already established elsewhere>

## Changes

- <delivered final state>
```

## Exclude From Pull Requests

- Issue restatement
- Superseded requirements
- Iterations
- Workflow
- Validation
- Commit chronology
- File narration
- Recoverable facts
