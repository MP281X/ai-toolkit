# Messages

## Issue

Use a concise required-outcome title.

```md
## Problem

<observable problem and material consequence>

## Outcome

<required current behavior>

## Acceptance

- <consumer-visible proof>

## Constraints

- <material constraint or exclusion>
```

Serialize the supplied or approved contract without adding or reconciling requirements. Omit research logs, implementation steps, rejected alternatives, and history.

## Commit

```text
<feat|fix|refactor|perf|chore|docs|test|ci|style>: <imperative outcome>
```

- At most 50 characters after the type.
- Use repository vocabulary and a specific outcome in one unpunctuated line.

## Pull request with issue

Use a concise final-outcome title.

```md
## Changes

- `<delivered final state>` — `<reason absent from the issue>`

Closes #<number>
```

## Pull request without issue

```md
## Problem

<problem solved and material consequence>

## Changes

- <delivered final state>
```

Omit empty sections, routine validation, implementation narration, file lists, and duplicated commit history.
