---
name: vite-plus
description: Use when changing Vite Plus tooling, package scripts, linting, formatting, tests, builds, workspace tasks, or repo automation.
---

# Vite Plus

## Config

- `vite.config.ts` is sole lint/format/test config.
- Root owns monorepo defaults.
- Package configs own package-specific build/runtime plugins.
- No standalone ESLint, Prettier, Vitest, Oxlint config unless Vite Plus requires it.
- Native Oxlint/plugin rules first.
- Custom JS plugin rules last.
- Disable native rules only for generated/vendor files, true conflicts, duplicate worse diagnostics.

## Scripts

- Root owns check/fix/test scripts.
- Packages do not add check/fix/test scripts.
- Commands through `vp run`.
- Recursive: `vp run -r <script>`.
- Targeted: `vp run @scope/name#<script>`.
- Filtered: `vp run --filter <selector> <script>`.
- Add package script before repeated package-local command.
- Manifest change => package manager generated lockfile.
- No `pnpm-workspace.yaml` catalog edit unless requested.
- No package-manager patching for verification unless requested.
- Keep root `check` and `test` scripts as the verification path.
