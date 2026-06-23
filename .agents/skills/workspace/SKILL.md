---
name: workspace
description: Use when changing package boundaries, public exports/imports, manifests, dependencies, Vite Plus config, lint/test/build config, package scripts, workspace automation, or verification commands.
---

# Workspace

## Boundaries

- Package = black box.
- Apps compose; packages export.
- Public surface: app-facing services, schemas, contract helpers.
- Private surface: implementation mechanics, external response details.
- Public exports are boundary decisions, not convenience escapes.

## Layout

- Root `package.json` unchanged unless behavior/tooling needs it.
- Root-installed dependency not repeated in package manifests.
- Install dependencies by manually editing the target `package.json`.
- Use `latest` for newly installed dependency versions.
- Never edit `pnpm-workspace.yaml` when installing dependencies.
- Preserve manifest grouping, order, blank dividers.
- Packages use `exports` for public entrypoints and `imports` for private aliases.
- Apps use `imports`, scripts, dependencies.

## Vite Plus

- `vite.config.ts` is lint/format/test config.
- Root owns monorepo defaults.
- No standalone ESLint, Prettier, Vitest, Oxlint config unless Vite Plus requires it.
- Config exceptions require generated/vendor code, true tool conflicts, duplicate worse diagnostics, or real boundary exceptions.
- Rule removal or disabling includes removing matching skill and `AGENTS.md` guidance.

## Scripts

- Root owns check/fix/test/typecheck scripts.
- CLI packages expose commands through `bin`; package scripts require explicit behavior need.
- Root scripts stay direct and readable.
- Avoid shell control-flow wrappers in package scripts; use a named script when orchestration needs status merging.
- Recursive: `vp run -r <script>`.
- Targeted: `vp run @scope/name#<script>`.
- Filtered: `vp run --filter <selector> <script>`.
- Manifest change => package manager generated lockfile.

## Lockfile

- Inspect generated lockfile changes after install.
- Report unrelated lockfile churn before proceeding.
