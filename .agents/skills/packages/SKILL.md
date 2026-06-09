---
name: packages
description: Use when changing package boundaries, public exports, service interfaces, schemas, package dependencies, or app composition.
---

# Packages

Packages are black boxes that expose services and schemas.

## Boundaries

- Keep packages self-contained
- Never import another local package from a package
- Never install another local package in a package
- Put cross-package composition in apps
- Export schemas and service interfaces needed by apps
- Keep internal implementation details private
- Remove public exports that only expose implementation mechanics

## Manifests

- Use nearby package and app manifests as the source of truth for field order
- Keep app and package script names consistent across nearby manifests
- Apps may have app-only metadata such as `version`, `files`, `bin`, `repository`, and `publishConfig`
- Apps use `imports`, `scripts`, `dependencies`, and `devDependencies`
- Apps do not define `exports`
- Packages use `imports` only for internal aliases
- Packages use `exports` for every public entrypoint
- Keep exports explicit and minimal
- Keep dependency groups ordered like nearby packages
- Do not add package scripts unless the package has a real package-local command

## File Structure

- Put package source under `src`
- Keep package filenames, aliases, and public entrypoint names consistent across packages
- Use `src/schema.ts` for public schemas
- Use `src/service.ts` for the main service
- Use `src/lib/*` for private implementation details
- Export side-effect-free reusable helpers only when they are part of the package contract
- Keep app source under `src`
- Keep app filenames and aliases consistent across apps
- Use `src/main.client.tsx` and `src/main.server.ts` for app entrypoints
- Use app aliases consistently: `#lib/*`, `#rpcs/*`, and `#routes/*`
- Use package aliases consistently: `#lib/*` when private implementation imports are needed

## Services

- A package service models one instance
- Apps own multiple instances with keyed resource maps
- Package services should not know app ids, tabs, worktrees, routes, or UI state
- Pass stable constructor inputs through the layer when that makes the service directly usable in an `RcMap`
- Keep method names short and domain-specific
- Do not duplicate the service name in method names

## Schemas

- Export schemas for public inputs, outputs, states, and errors
- Do not make apps redefine schemas or transformations owned by a package
- Keep response schemas private when only the package needs the external API shape
- Keep app-facing schemas minimal and stable

## Composition

Apps glue packages together.

```text
app
  owns routing, atoms, RcMap keys, RPC handlers, UI commands

package
  owns one service instance, schemas, external APIs, process/resource handling
```

Packages can be designed to compose cleanly by matching structural shapes, but they should not import each other to create bridges.
