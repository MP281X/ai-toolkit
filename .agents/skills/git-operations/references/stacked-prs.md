# Stacked pull requests

Keep every review boundary valid without rewriting published history.

## Topology

- Root targets the default branch; each child targets its immediate parent.
- Every pull request remains independently understandable and valid against its immediate base.
- Inspect the complete topology before mutation.

```bash
gh stack add          # create a branch atop the current stack
gh stack init --adopt # adopt existing branches
gh stack view         # inspect topology
gh stack submit       # publish the stack as draft pull requests
```

In `gh stack submit`, set every pull request to draft.

## Published alignment

- Align root → tip, one node at a time.
- Merge the updated immediate base into each published descendant; validate and push normally.
- Provable conflict resolution is the continuation condition.
- After a parent merges, retarget its direct child to the parent's destination and recheck the topology.
