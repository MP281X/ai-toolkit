# Stacked pull requests

## Topology

- The root targets the default branch; each later pull request targets its immediate preceding branch.
- Add and submit only unpublished nodes. Inspect the complete topology before changing a stack.
- Every pull request remains independently understandable and valid against its immediate base.

```bash
gh stack add
gh stack view
gh stack push
gh stack submit
```

## Published alignment

- Preserve published commits. Align a descendant by merging its updated immediate base, then validate and push normally.
- Align and validate one node at a time from root to tip. Escalate conflicts when intended final behavior is not provable from the issue and current source.
- After an earlier pull request merges, retarget its direct child to the merged destination and recheck the remaining topology.

**Reject:** stack sync, rebase, amend, squash, force-push, or any operation that rewrites a published branch.
