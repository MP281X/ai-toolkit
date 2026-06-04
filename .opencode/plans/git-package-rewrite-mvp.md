# Git Package Rewrite MVP

## Summary

Rewrite `@deslop/git` around small Effect-native services with no app-owned disk state. Workbench owns `RcMap` and only exposes RPC methods. The diff UI stays package-independent but is shaped to work directly with git review data.

The service remains stateless across process restarts: git operations may mutate real repositories, but comments/review state are runtime memory only. No cache files, persisted metadata, prefetching, or compatibility paths.

## Public Shape

- Expose cwd-based services only; use `cwd` consistently in all method inputs.
- Use tagged Effect schemas, including:
  - `GitReviewTarget = { _tag: "head" } | { _tag: "commit"; hash: string }`
  - `head` means `HEAD -> worktree`
  - `commit` means selected commit parent/base -> worktree`
- Split services by responsibility:
  - workspace discovery/worktree management
  - repository maintenance
  - review diff/comments/reviewed files
  - commit/push/PR actions
  - shared git command execution
- Workbench `rpcs` only call service methods and adapt RPC wiring; schemas come from `@deslop/git`.

## Core Behavior

- Discover repos by finding `.git` folders under `cwd`, excluding any path under dot-prefixed directories or `node_modules`.
- For each repo, find all worktrees with `git worktree list --porcelain -z`.
- Run background maintenance lazily on startup and every 180 seconds:
  - fetch/prune all remotes
  - delete branches whose upstream is `[gone]`
  - force-remove their linked worktrees
  - preserve unpublished local branches with no upstream
  - fast-forward branches only when it can be done directly; conflicting/diverged states are left for manual resolution
- Worktree creation accepts `{ cwd, branch }`; service decides existing local, existing remote, or new branch from default upstream.
- Worktree deletion accepts `{ cwd }`; service force-removes the worktree and deletes the branch.
- Commit action:
  - dirty tree: require message, stage all, commit, push with upstream, create draft PR if missing
  - clean tree with unpushed commits: push only
  - disabled in UI when there is nothing to commit or push
- Remove WIP, stage/unstage/discard UI paths, persisted review storage, and legacy fallback behavior.

## Review UI

- Do not auto-select the first file.
- Clicking a file marks that exact diff fingerprint reviewed.
- If the file changes, reviewed becomes false again.
- Comments stay in memory and are not deleted when handled.
- Use `resolved` for comments and `reviewed` for files.
- Local and GitHub comments both support resolve/collapse behavior.
- Copying comment content resolves the comment; GitHub comments call the remote resolve-thread action.
- Use action/request atoms for loading and error state; do not duplicate request status in git schemas.
- Show loading states for async buttons: GitHub refresh/load, save comment, resolve/copy-resolve, reviewed toggle, worktree create/delete, commit/push.
- Keep Tab behavior for full-file view.
- Use lucide icons from `@deslop/components/icons`.

## Tracing

- Add spans to every public service method where useful with `Effect.fn("Service.method")`.
- Add explicit spans around major internal phases:
  - git command execution
  - repo discovery
  - worktree parsing
  - maintenance fetch/classify/delete/fast-forward
  - diff generation
  - comment save/resolve
  - commit/push/PR creation
- Annotate spans with safe metadata: `cwd`, target tag/hash, branch, file path, file/comment counts, command name, and result counts.
- Do not attach patch contents, comment body text, commit message text, or large command output to spans.
- Avoid noisy per-line/per-hunk spans; use aggregate spans for hot loops.

## Tests

Use Vitest through Vite Plus per the Vite Plus test guide: `vp test` runs once by default and config belongs in `vite.config.ts`.

Add focused git package tests that create isolated temporary repositories with `fs.mkdtemp` wrapped in Effect `acquireRelease`, then clean with `fs.rm({ recursive: true, force: true })`.

Test coverage:

- repo discovery excludes dot directories and `node_modules`
- repo discovery dedupes repos and lists linked worktrees
- maintenance deletes `[gone]` upstream branches and their worktrees
- maintenance preserves unpublished local branches
- fast-forward maintenance updates only directly fast-forwardable branches
- worktree creation handles existing local, existing remote, and new branch cases
- review diff supports `head` and `commit` targets
- reviewed file state invalidates when diff fingerprint changes
- resolved comments remain present and collapsed
- copy-resolve marks local comments resolved
- GitHub comment/PR behavior uses a fake `gh` command on temp `PATH`, not live GitHub auth
- commit-and-push covers dirty commit+push and clean push-only paths

Performance tests:

- assert command-count behavior for critical paths to prevent per-file/per-branch command loops
- add broad wall-clock smoke budgets for repo discovery, branch classification, and diff generation on synthetic repos
- do not performance-test through the UI

Verification:

- `vp test`
- `vp run check`
- targeted grep to confirm removed legacy concepts: WIP, persisted git review storage, stage/unstage/discard RPC usage

## Assumptions

- `git` and `gh` are always installed.
- Runtime memory state is allowed; app-owned filesystem state is not.
- Git repository mutations are allowed because they are the purpose of the service.
- Unexpected repository states should throw `GitError` and be handled by the nearest frontend error boundary.
- Source for Vitest behavior: https://viteplus.dev/guide/test
