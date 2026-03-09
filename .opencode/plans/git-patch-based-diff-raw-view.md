# Goal

- Replace the current `{ old, new }` git diff payload with a patch-based payload that supports both:
  - diff rendering
  - compact non-diff raw rendering
- Eliminate crashes when a changed file no longer exists in the working tree.
- Reduce client payload size by avoiding sending full file contents twice.

## Decisions

- Backend git diff entries should send `filePath` and `patch` instead of `old` and `new`.
- Diff view should render from Pierre patch input, not from full old/new file contents.
- Raw view should be derived from the same parsed patch by using the right-side hunk text only.
- Raw view is hunk-only, not full-file.
- Deleted files should not have a raw/final view.
- No custom diff parser should be introduced.

## Build

- Update the git diff schema in `packages/git/src/schema.ts`.
  - Replace `old` and `new` fields with `patch`.

- Update staged diff generation in `packages/git/src/service.ts`.
  - Stop loading file contents with `git show` for diff entries.
  - Generate a per-file unified patch from git CLI instead.
  - Keep the existing file action APIs unchanged.

- Update unstaged diff generation in `packages/git/src/service.ts`.
  - Stop reading the working-tree file directly for diff entries.
  - Generate a per-file unified patch from git CLI instead.
  - This must handle deleted or missing files without filesystem reads.

- Keep the RPC surface in `apps/template/src/rpcs/git/contracts.ts` and `apps/template/src/rpcs/git/handlers.ts` aligned with the new schema.

- Update `packages/components/src/components/render/diff.tsx`.
  - Add a patch-based diff component that renders with Pierre `PatchDiff`.
  - Add a raw-from-patch component that:
    - parses the patch once
    - derives the right-side hunk text from Pierre parsed data
    - renders it with Pierre `File`
  - For deleted files or patches with no right-side content, render an empty/unavailable raw state.

- Update `apps/template/src/routes/(home)/diff/index.tsx`.
  - Replace `old` / `next` usage with `patch` usage.
  - Keep the diff/raw toggle UI.
  - Raw mode should show the compact final hunk view.
  - Disable or visually de-emphasize raw mode when no final view exists.

- Ensure patch parsing is not duplicated unnecessarily in the route.
  - Parse once per rendered file entry, then feed both diff and raw views from the same parsed result where practical.

- Validate the behavior for:
  - modified files
  - newly added files
  - deleted files
  - renamed files if git already reports them in the chosen patch form

## Examples

- Modified file:
  - diff = full patch view
  - raw = only the changed hunk result on the right side

- Large refactor with many deletions:
  - diff = noisy but complete change view
  - raw = short plain-text result of the changed hunks

- Deleted file:
  - diff = deletion patch
  - raw = unavailable
