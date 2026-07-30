# Messages

Preserve the linked issue as the contract; describe only the delivered outcome and reasoning it does not contain.

## Commit

```text
<feat|fix|refactor|perf|chore|docs|test|ci|style>: <imperative outcome>
```

- At most 50 characters after the type.
- No trailing period or body.
- Match repository vocabulary; reject `support`, `improve`, `update`, and `draft`.

## Pull request

Use a concise final-outcome title.

```md
## Changes

- `<delivered final state>` — `<reason absent from the issue>`

Closes #<number>
```

Exclude issue restatement, superseded requirements, iterations, workflow, validation, commit chronology, file narration, and recoverable facts.
