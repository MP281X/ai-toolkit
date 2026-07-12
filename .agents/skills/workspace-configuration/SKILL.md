---
name: workspace-configuration
description: 'Manifests; dependencies; export wiring; Vite Plus; lint/test/build config; scripts; lockfiles; automation.'
---

## Topology

Packages use `exports` for public entrypoints and `imports` for private aliases. Apps own their `imports`, scripts, and dependencies.

## Manifests

Keep the root `package.json` unchanged unless root behavior or tooling requires it. A dependency belongs in the target manifest, uses `latest`, and preserves existing grouping and order. A root dependency is not repeated in a package manifest.

Dependency changes never edit `pnpm-workspace.yaml`. Regenerate the lockfile after a manifest change and stop on unrelated lockfile churn.

## Vite Plus

The root `vite.config.ts` owns lint, format, and test defaults. Standalone ESLint, Prettier, Vitest, or Oxlint configuration exists only when Vite Plus requires it.

Config exceptions require generated/vendor source, a real tool conflict, a worse duplicate diagnostic, or a real package boundary.

## Scripts

The root owns check, fix, and test orchestration. A package script needs explicit package behavior; CLI packages expose commands through `bin`.

Keep scripts direct. Use a named orchestration script only when status merging requires it.

```bash
vp run -r <script>
vp run @scope/name#<script>
vp run --filter <selector> <script>
```
