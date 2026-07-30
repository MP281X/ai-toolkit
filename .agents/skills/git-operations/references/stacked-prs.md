# Stacked pull requests

Keep every review boundary valid without rewriting published history.

## Topology

- Root targets the default branch; each child targets its immediate parent.
- Every pull request remains independently understandable and valid against its immediate base.
- Inspect the complete topology before mutation.

```bash
gh stack add
gh stack view
gh stack submit
```

In `gh stack submit`, set every pull request to draft; never use `--open`.

## Published alignment

- Align root → tip, one node at a time.
- Merge the updated immediate base into each published descendant; validate and push normally.
- If intended conflict resolution is not provable, stop.
- After a parent merges, retarget its direct child to the parent's destination and recheck the topology.

Reject `gh stack sync`, rebase, amend, squash, reset, and force-push for published branches.
