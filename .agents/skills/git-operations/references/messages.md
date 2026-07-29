# Messages

## Commit

The subject is `<type>: <imperative outcome>`, with at most 50 characters after the type and no trailing period.

Choose one type: `feat`, `fix`, `refactor`, `perf`, `chore`, `docs`, `test`, `ci`, `style`.

Match repository vocabulary. Use concrete nouns and omit vague verbs such as `support`, `improve`, `update`, or `draft`. Add a body only for an unrecoverable deviation from the linked issue.

## Pull request

Use a concise outcome title and create the pull request as draft.

```md
## Changes

| Change                        | Reason                                             |
| ----------------------------- | -------------------------------------------------- |
| `<delivered technical shape>` | `<implementation reasoning absent from the issue>` |

Closes #<number>
```

Describe only the delivered final state and implementation reasoning absent from the linked issue. Exclude superseded requirements, iterations, issue restatement, workflow, validation, commit chronology, file-by-file narration, and recoverable repository facts.
