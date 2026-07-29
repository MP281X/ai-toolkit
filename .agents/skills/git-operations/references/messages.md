# Messages

## Commit

The subject is `<type>: <imperative outcome>`, with at most 50 characters after the type and no trailing period.

Choose one type: `feat`, `fix`, `refactor`, `perf`, `chore`, `docs`, `test`, `ci`, `style`.

Match repository vocabulary. Use concrete nouns and omit vague verbs such as `support`, `improve`, `update`, or `draft`. A small diff needs only the subject; otherwise add at most five importance-ordered bullets describing the complete diff.

## Pull request

Describe the complete base-to-head outcome, not commit chronology. Lead with the result, include validation, and close the issue with `Closes #<number>`. Create it as draft.

## Issue

Use an imperative outcome title. The body is the complete canonical desired state:

1. outcome;
2. decisions and rationale;
3. behavior and interfaces;
4. scope and boundaries;
5. acceptance;
6. dependencies, risks, and meaningful rejected alternatives.

Do not preserve transcript, progress diary, implementation order, or an add/remove history.
