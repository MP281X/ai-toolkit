# Messages

## Commit

The subject is `<type>: <imperative outcome>`, with at most 50 characters after the type and no trailing period.

Choose one type: `feat`, `fix`, `refactor`, `perf`, `chore`, `docs`, `test`, `ci`, `style`.

Match repository vocabulary. Use concrete nouns and omit vague verbs such as `support`, `improve`, `update`, or `draft`.

A small diff needs only the subject. Otherwise add a blank line and at most five importance-ordered bullets covering behavior, API, or workflow outcomes. The message describes the complete commit diff.

## Pull request

Apply the commit-body selection rules to the complete pull-request diff. Keep the body brief and outcome-first. Explain product intent only when the diff cannot. Include a closing issue reference.
