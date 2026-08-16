# Git conventions

## Identity

Use one type and one scope for the complete semantic change:

```text
<feat|fix|refactor|perf|chore|docs|test|ci|style>(<scope>): <outcome>
```

The scope is the shortest repository term naming the affected semantic owner. The outcome names the delivered result, not the implementation process. Do not use agent or tool names.

## Branch

```text
<type>/<scope>/<kebab-case-outcome>
```

- Use one short semantic branch for one issue or independent change.

## Title

```text
<type>(<scope>): <imperative outcome>
```

- At most 50 characters after `: `.
- No trailing period.
- Match repository vocabulary; reject `support`, `improve`, `update`, and `draft`.

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

Exclude issue restatement, superseded requirements, iterations, workflow, validation, commit chronology, file narration, and recoverable facts.
