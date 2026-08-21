# Stacked Pull Requests

Keep every review boundary valid without rewriting published history.

## Topology invariants

| Node  | Base             | Invariant                              |
| ----- | ---------------- | -------------------------------------- |
| Root  | Default branch   | Independently understandable and valid |
| Child | Immediate parent | Independently understandable and valid |

## Read-only inspection

```bash
gh stack view
```

## Creation after Safety approval

```bash
gh stack add
```

## Publication after Safety approval

```bash
gh stack submit
```

In `gh stack submit`, set every pull request to draft; never use `--open`.

## Published alignment

```mermaid
flowchart TD
	subgraph Alignment
		R[Resolve topology + exact mutation group] --> S{Safety gate passed?}
		S -->|No| X[Stop]
		S -->|Yes| G[Align root]
		G --> E{Next parent-child edge<br/>in topological order?}
		E -->|Yes| M[Merge current parent into current child]
		M --> V[Validate current child]
		V --> U[Push current child]
		U --> E
		E -->|No| A[Aligned stack]
	end

	subgraph After_parent_merge
		P[Parent merged] --> R2[Resolve exact retarget mutation]
		R2 --> S2{Safety gate passed?}
		S2 -->|No| X2[Stop]
		S2 -->|Yes| T[Retarget direct child]
		T --> Q[Verify topology]
	end
```

## Topology

| Branch | Base | Pull request | Draft state | Revision |
| ------ | ---- | ------------ | ----------- | -------- |
| ...    | ...  | ...          | ...         | ...      |
