# Workspace

## Creation

Create applications and packages only through the registered Vite+ generators:

```bash
vp create app -- --name <name>
vp install
vp create package -- --name <name>
vp install
```

Names are unscoped kebab-case; generators derive `@deslop/<name>` and the canonical workspace directory. The app generator owns the React, TanStack Router, Effect RPC, telemetry, Vite, Docker, build, and publication baseline. The package generator owns manifest grouping, explicit subpath exports, and a same-named empty Effect service tagged `@deslop/<name>/service/<Service>`.

Run `vp install` immediately after either generator changes workspace topology and before checks, development, builds, or previews.

## Topology

```text
apps/<app>/src/
	lib/utils.ts
	main.server.ts
	rpcs/contracts.ts
	rpcs/handlers.ts
	services/<name>/schema.ts
	services/<name>/service.ts
	services/<name>/lib/utils.ts
	services/<name>/internal/*

packages/<name>/src/
	schema.ts
	service.ts
	lib/utils.ts
	internal/*
```

Every package and application service owns this baseline separation. No `index.ts` or barrel exports.

| File                | Owner                                                |
| ------------------- | ---------------------------------------------------- |
| `schema.ts`         | Frontend-safe schemas, associated types, errors      |
| `lib/utils.ts`      | Frontend-safe pure operations                        |
| `service.ts`        | Service interface and exposed implementation Layers  |
| `internal/*`        | Private implementation and backend-only dependencies |
| `rpcs/contracts.ts` | Frontend-safe application RPC group                  |
| `rpcs/handlers.ts`  | Server RPC implementation                            |
| `lib/utils.ts`      | Client Atom RPC runtime and shared application logic |
| `main.server.ts`    | Server entry module and complete Layer graph         |

| Ownership             | Construction                                     |
| --------------------- | ------------------------------------------------ |
| Dependency            | Highest manifest shared by every direct consumer |
| Root script           | Repository orchestration                         |
| Package script        | Package-local behavior                           |
| CLI                   | `bin`; `effect/unstable/cli`                     |
| Cross-package import  | Explicit package subpath export                  |
| Intra-package parent  | Package subpath alias                            |
| Intra-package sibling | Relative import                                  |
| Generated file        | Reproducible output changed through its owner    |

Edit manifests directly; retain dependency sections and blank-line groups. Full dependency upgrade:

```bash
vp run upgrade
```

```json
{"exports": {"./schema": "./src/schema.ts", "./service": "./src/service.ts", "./lib/utils": "./src/lib/utils.ts"}}
```

Extract a package only for an application-neutral, independently satisfiable capability. Applications compose packages with minimal application-specific behavior.

## Source

- `.agents/repos/effect/packages/effect/src/unstable/cli/index.ts`
