# Project Undo Tree Checkpoints Plan

## Objective

Build a local-only, project-wide undo tree for AI-assisted development.

The checkpoint workflow should feel like Neovim `undo-tree`, but for an entire worktree instead of one file.

The user manually creates checkpoints while exploring different implementation routes. Restoring an older checkpoint should preserve the current route first, then move the worktree to the selected state.

This is not a commit workflow. Git commits remain milestone/final-history events created outside this UI.

## Non-Goals

- Do not use staging as the checkpoint mechanism.
- Do not create local WIP commits.
- Do not push checkpoints.
- Do not add a commit button.
- Do not add labels, kinds, descriptions, retention classes, or agent-specific metadata in v1.
- Do not implement selected-file restore in v1.
- Do not implement patch reapply/cherry-pick semantics in v1.

## Core Model

Use hidden Git tree snapshots as state nodes.

Use Effect `Graph` as the in-memory undo tree representation.

Persist only the minimal serializable state in Effect `KeyValueStore`.

### Semantics

- A checkpoint is a full worktree state.
- A node id is the Git tree hash for that state.
- Identical filesystem states dedupe naturally because they have the same tree hash.
- Edges represent exploration history between tree states.
- The graph is scoped to a `cwd` and the current `HEAD` commit.
- When `HEAD` changes, start a new graph for the new `HEAD`.
- Old graphs can remain in storage, but the active UI should only show the graph for the current `HEAD`.

### Root

The graph root is not the `HEAD` commit object.

The graph root is a hidden snapshot tree captured when the graph for the current `HEAD` is first created.

This matters because the worktree can include local files that are not in the commit.

The graph still stores the current `HEAD` commit hash as the graph base so checkpoints reset naturally after a real commit.

## Persisted Shape

Keep storage intentionally boring.

```ts
type CheckpointState = {
	head: string
	root: string
	current: string
	edges: ReadonlyArray<readonly [from: string, to: string]>
}
```

No separate node list is required.

Nodes are derived from:

- `root`
- `current`
- every edge source
- every edge target

Use `Schema` for this shape and `KeyValueStore.toSchemaStore` for typed reads/writes.

Store one key per `cwd`.

The key should include a stable cwd identifier, not the raw path if path separators create awkward key names. A fast hash of `cwd` is enough.

Example key:

```txt
checkpoint/<hash(cwd)>
```

The value includes `head`, so the service can reset when `HEAD` changes.

## Effect Graph Usage

Persist `CheckpointState`, not an Effect `Graph` instance.

Rebuild the graph from persisted state whenever needed.

Reason:

- Effect `Graph` is the correct runtime representation for graph operations and Mermaid output.
- The persisted shape should stay stable, small, and independent of internal graph indices.
- Tree hashes should remain the durable identity.

Runtime graph builder:

```ts
function makeGraph(state: CheckpointState) {
	const nodes = new Map<string, Graph.NodeIndex>()

	return Graph.directed<string, string>(graph => {
		const node = (tree: string) => {
			const existing = nodes.get(tree)
			if (existing !== undefined) return existing

			const index = Graph.addNode(graph, tree)
			nodes.set(tree, index)
			return index
		}

		node(state.root)
		node(state.current)

		for (const edge of state.edges) {
			Graph.addEdge(graph, node(edge[0]), node(edge[1]), '')
		}
	})
}
```

Use `Graph.toMermaid` for the diagram source.

Node label rules:

- Root node label: `root`.
- Current node label: short tree hash plus `*`.
- Other node label: short tree hash.

No custom node kind is needed.

## Hidden Git Snapshot Store

Use the opencode-inspired Git plumbing approach.

Create a hidden Git directory for snapshots, separate from the repository `.git` directory.

The hidden Git directory is app-owned and local-only.

It should live under the app data directory, for example:

```txt
~/.deslop/git-checkpoints/<hash(cwd)>/
```

Snapshot operations should run Git with:

```txt
--git-dir <hidden-git-dir>
--work-tree <cwd>
```

### Create Snapshot

The create snapshot operation should:

1. Initialize the hidden Git directory if it does not exist.
2. Stage the worktree into the hidden index.
3. Write the tree with `git write-tree`.
4. Return the tree hash.

Capture the whole worktree state that the local CLI can see.

This product is local-only, so ignored/local files may be checkpointed. Do not add v1 ignore controls.

### Restore Snapshot

The restore operation should replace the real worktree with the selected hidden tree state.

Use simple replace semantics.

Do not implement merge/conflict handling.

Restoring a node means:

```txt
make the worktree equal to this checkpoint tree
```

## Service Shape

Add a cwd-scoped service in `@packages/git`, following the current `GitWorktree.layer({ cwd })` pattern.

Proposed service:

```ts
export class GitCheckpoint extends Context.Service<GitCheckpoint>()('@deslop/git/service/GitCheckpoint', {
	make: Effect.fnUntraced(function* (config: {readonly cwd: string}) {
		return {checkpoint, restore, state, mermaid}
	})
}) {}
```

Methods:

```ts
type GitCheckpointService = {
	readonly checkpoint: Effect.Effect<CheckpointState, GitError>
	readonly restore: (tree: string) => Effect.Effect<CheckpointState, GitError>
	readonly state: Effect.Effect<CheckpointState, GitError>
	readonly mermaid: Effect.Effect<string, GitError>
}
```

Keep the API this small for v1.

No label mutation.

No delete operation.

No selected-file restore.

No commit action.

## State Transitions

### Ensure State

Every public method first ensures state for the current `HEAD`.

Algorithm:

1. Read persisted `CheckpointState` from `KeyValueStore`.
2. Read current Git `HEAD` commit.
3. If stored state exists and `state.head === HEAD`, use it.
4. Otherwise create a root snapshot and persist:

```ts
{
	head,
	root: tree,
	current: tree,
	edges: []
}
```

This makes real commits naturally close the previous undo tree.

### Manual Checkpoint

Algorithm:

1. Ensure state.
2. Create a new hidden snapshot tree from current worktree.
3. If `tree === state.current`, return state unchanged.
4. If edge `[state.current, tree]` already exists, only set `current = tree`.
5. Otherwise append edge `[state.current, tree]` and set `current = tree`.
6. Persist and return state.

### Restore

Algorithm:

1. Ensure state.
2. Create an auto-save snapshot of current worktree.
3. If auto-save tree differs from `state.current`, add edge `[state.current, autoSaveTree]` and set `current = autoSaveTree` before restoring.
4. Restore requested tree to the worktree.
5. Set `current = requestedTree`.
6. Persist and return state.

This preserves redo/alternate-route behavior without an explicit redo stack.

After restore, future manual checkpoints branch from the restored node.

## RPC Plan

Add checkpoint RPCs to `apps/agent/src/rpcs/contracts.ts`.

Minimal endpoints:

```ts
checkpoint.state({ cwd }) -> CheckpointState
checkpoint.create({ cwd }) -> CheckpointState
checkpoint.restore({ cwd, tree }) -> CheckpointState
checkpoint.mermaid({ cwd }) -> string
```

Optional stream endpoint after v1:

```ts
checkpoint.watch({ cwd }) -> CheckpointState
```

For v1, explicit refresh after actions is enough.

Use an `RcMap` in `handlers.ts`, like `GitWorktreeSessions`, to build a cwd-scoped `GitCheckpoint.layer({ cwd })`.

## UI Plan

Add a checkpoint tree surface in `apps/agent`.

Use `@packages/components/src/components/render/mermaid.tsx` to render the graph.

Initial UI pieces:

- `Create checkpoint` button.
- Mermaid graph panel.
- Simple node list with tree hashes and restore buttons.
- Current node indicator.

Keep node interaction simple in v1.

Do not require clicking inside the Mermaid SVG initially.

The node list can drive restore actions while Mermaid provides spatial context.

## Mermaid Rendering

The backend can return Mermaid source directly via `checkpoint.mermaid`.

The frontend renders:

```tsx
<Mermaid>{source}</Mermaid>
```

Diagram defaults:

```txt
flowchart TD
```

Use short tree hashes for labels.

Use a suffix or visual marker for current:

```txt
abc1234*
```

Keep this minimal until interactive SVG node selection is worth the complexity.

## Git `HEAD` Changes

When a real commit changes `HEAD`, checkpoints from the previous head should stop being the active undo tree.

Behavior:

- `state` detects the new `HEAD`.
- A new root snapshot is created automatically for the new `HEAD`.
- The UI now shows the new empty graph.
- Old persisted graphs are not shown in v1.

This matches the mental model that committing squashes the previous checkpoint exploration into the new Git history.

## File Scope

Capture local-only files too.

This is acceptable because the app is local-only and the user explicitly does not need ignore controls in v1.

If Git plumbing makes ignored files awkward, start by capturing tracked plus untracked non-ignored files, but keep the target behavior as full local worktree capture.

Do not add a settings UI for file exclusion.

## Error Handling

Keep failures explicit.

- If hidden Git init fails, return `GitError`.
- If snapshot creation fails, return `GitError`.
- If restore fails, return `GitError`.
- Do not silently fall back to normal commits, stash, or file copies.

No merge conflict handling is needed because restore is replacement semantics.

## Verification Plan

Add tests in `@packages/git` for the service behavior where practical.

Core cases:

- First checkpoint creates state for current `HEAD`.
- Repeated checkpoint with identical tree does not add an edge.
- Checkpoint after edits adds an edge from previous current to new tree.
- Restore auto-saves dirty current state before switching to requested tree.
- Checkpoint after restoring an older node creates a sibling branch.
- Changing `HEAD` creates a new graph root.

Run repo verification after implementation:

```txt
vp run check
```

## Implementation Order

1. Add checkpoint schemas to `@packages/git/src/schema.ts`.
2. Add `GitCheckpoint` service to `@packages/git/src/service.ts` or a new exported module if the file becomes too large.
3. Wire Effect `KeyValueStore.layerFileSystem` with Bun filesystem/path services at the app/server layer.
4. Add checkpoint RPC contracts and handlers.
5. Add a minimal checkpoint route or panel in `apps/agent`.
6. Render Mermaid graph with `Mermaid` component.
7. Add create and restore actions.
8. Run `vp run check`.

## Open Implementation Detail

The only intentionally open detail is exact full-worktree capture behavior for ignored files.

Preferred target: checkpoint every local file visible to the CLI.

Acceptable first implementation: checkpoint tracked files plus untracked non-ignored files, then expand once the Git plumbing path is clear.
