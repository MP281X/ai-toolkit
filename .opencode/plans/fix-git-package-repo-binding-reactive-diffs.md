# Goal

- Make `@ai-toolkit/git` operate on the nearest parent git repo discovered from the app startup cwd for every read and mutation.
- Make staged and unstaged diffs reactive so the diff UI rerenders automatically.
- Add `clone` that clones or updates only the remote default branch, with shallow history only.

## Decisions

- Resolve the repo root once at service startup with `git rev-parse --show-toplevel`.
- Fail service startup if the app is not started inside a git repo.
- Bind every git command with Effect process `cwd: repoRoot`.
- Replace the current snapshot `stagedDiffs` and `unstagedDiffs` APIs with streaming APIs.
- Drive live diffs from `FileSystem.watch(repoRoot)` plus a small debounce.
- Keep current stage and unstage behavior.
- Modernize discard to `git restore --worktree --source=HEAD -- <file>`.
- Add `clone(url, directory): Effect<void, GitError>`.
- `clone` must ask the remote for its default branch each time via `git ls-remote --symref <url> HEAD`.
- New clones must use only the default branch and only the latest history: `git clone --depth 1 --single-branch --branch <default> <url> <directory>`.
- If the target parent directory is missing, create it.
- If the target directory already exists:
  - if it is not a git repo: fail
  - if `remote.origin.url` is not an exact string match: fail
  - if the repo is dirty: fail
  - if the checked out branch is not the default branch: fail
  - otherwise run `git pull --ff-only --depth 1 origin <default>`
- `clone` returns `void`.

## Package changes

- Update `packages/git/src/service.ts`.
  - Centralize a repo-bound git command helper using `Command.make('git', args, {cwd: repoRoot})`.
  - Resolve `repoRoot` once during layer construction and surface startup failure as `GitError`.
  - Keep diff computation local, but reuse it for both streams.
  - Store staged and unstaged diffs in `SubscriptionRef`s.
  - Watch `repoRoot`, debounce bursts, and recompute both diff refs on change.
  - Expose `stagedDiffs` and `unstagedDiffs` as `SubscriptionRef.changes(...)` streams.
  - Update `stageFile`, `unstageFile`, `discardFile`, and `clone` to use the repo-bound helper.
- Keep `packages/git/src/schema.ts` minimal.
  - Reuse `GitDiff`.
  - Reuse `GitError` with clear `message` values for clone and repo-state failures unless a tiny schema extension becomes necessary.

## App and RPC changes

- Update `apps/template/src/rpcs/git/contracts.ts`.
  - Mark `git.stagedDiffs` and `git.unstagedDiffs` as `stream: true`.
  - Add `git.clone` with payload `{url: string, directory: string}` and no success payload.
- Update `apps/template/src/rpcs/git/handlers.ts`.
  - Return the git diff streams directly.
  - Wire `git.clone` to `git.clone(payload.url, payload.directory)`.
- Update `apps/template/src/routes/(home)/diff/index.tsx`.
  - Replace one-shot `RpcClient.query(...)` diff reads with streaming atoms using the same `AtomRuntime.atom(... Stream.unwrap ...)` pattern already used by the realtime route.
  - Remove the local staged/unstaged “removed” bookkeeping that was compensating for static queries.
  - Let the streamed diffs drive rerenders after file edits and git operations.

## Behavior checks

- Starting the app from the repo root and from a nested directory inside the same repo must produce the same working stage, unstage, and discard behavior.
- External working-tree edits and index changes must update the diff UI after the debounce window.
- `clone` must:
  - clone into a missing target directory
  - create missing parent directories
  - pull an existing matching repo that is clean and already on the default branch
  - fail for non-repos, exact-origin mismatches, dirty repos, and non-default checked out branches

## Validation

- `bun run fix`
- `bun run check`
