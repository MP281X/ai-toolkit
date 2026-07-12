# Stacked Pull Requests

## Topology

- The root targets the default branch.
- Each later branch targets its preceding stack branch.
- Every pull request remains independently understandable and reviewable against its immediate base.

## Commands

```bash
gh stack add
gh stack view
gh stack push
gh stack submit
gh stack sync
```

`gh stack sync` fetches, fast-forwards trunk, cascades rebases, pushes with force-with-lease when required, synchronizes pull requests, and may prune merged branches.

For conflicts, run `gh stack rebase`, resolve the current branch, then `gh stack rebase --continue`. Abort with `gh stack rebase --abort`. Use `--downstack`, `--upstack`, or `--no-trunk` only for a known intended segment.
