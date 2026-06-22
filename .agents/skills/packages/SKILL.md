---
name: packages
description: Use when changing package boundaries, public exports, service interfaces, schemas, package dependencies, or app composition.
---

# Packages

## Boundaries

- Package = black box.
- Cross-package imports use public exports only.
- No package-to-package private alias/path imports.
- Cross-package composition lives in apps.
- Apps compose; packages export.
- Public surface: app-facing services, schemas, contract helpers.
- Private surface: implementation mechanics, external response details.
- Public exports are boundary decisions, not lint workarounds.

## Exports

- Explicit exports.
- Minimal app-facing entrypoints.
- Minimal exports.
- Split exports by runtime compatibility.
- Schemas/utils must be frontend-backend safe when exported to apps.
- Services backend-only unless explicitly safe.
- External response schemas private unless app-facing.

## Layout

- Root `package.json` unchanged unless requested.
- `pnpm-workspace.yaml` unchanged unless requested.
- No catalog edit for normal package dependency.
- Root-installed dependency not repeated in package manifests.
- Package dependency only when package source imports it and root does not own it.
- Infer field order, scripts, aliases, exports, layout from nearby source.
- Preserve manifest grouping, order, blank dividers.
- Packages: `exports` for public entrypoints; `imports` for private aliases.
- Apps: no `exports`; use `imports`, scripts, dependencies.
- Package source default: `src/schema.ts`, `src/service.ts`, `src/lib/*`.
- Private alias default: `#lib/*`.

## Services

- One service = one instance.
- Multi-instance: app keyed resource map.
- No app ids, tabs, worktrees, routes, UI state in package services.
- Stable constructor input in layer when it removes app wrappers.
- Method names short, domain-specific, no service-name echo.
