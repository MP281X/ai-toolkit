---
name: packages
description: Use when changing package boundaries, public exports, service interfaces, schemas, package dependencies, or app composition.
---

# Packages

## Boundaries

- Package = black box
- No local package import/install inside packages
- Cross-package composition lives in apps
- Public surface: app-facing services, schemas, contract helpers
- Private surface: implementation mechanics, external response details

## Manifests And Files

- Infer field order, metadata, scripts, aliases, exports, and layout from nearby source
- Apps compose; packages export
- Exports explicit, minimal, app-facing
- Private aliases only for private imports
- Package scripts only for package-local commands
- File/alias/entrypoint names: consistent with nearby peers
- Apps: no `exports`; use `imports`, `scripts`, `dependencies`, `devDependencies`
- Packages: `exports` for public entrypoints; `imports` for private aliases
- Package source: `src/schema.ts` public schemas, `src/service.ts` main service, `src/lib/*` private implementation
- App entrypoints: `src/main.client.tsx`, `src/main.server.ts`
- App aliases: `#lib/*`, `#rpcs/*`, `#routes/*`
- Package private alias: `#lib/*`

## Services

- One service = one instance
- Multi-instance: app keyed resource map
- No app ids, tabs, worktrees, routes, UI state in package services
- Stable constructor inputs in the layer when that removes app wrappers
- Method names: short, domain-specific
- No service-name echo in method names

## Schemas

- Export public input/output/state/error schemas
- Package-owned schemas/transforms stay package-owned
- External response schemas private unless app-facing
- App-facing schemas minimal, stable
