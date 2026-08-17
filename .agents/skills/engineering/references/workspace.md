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

## Generated ownership

The generator owns baseline topology and configuration. Edit the existing owner required by the contract; do not recreate, normalize, or duplicate generated structure. A service root is `apps/<app>/src/services/<name>` or `packages/<name>/src`.

| Concern                                           | Existing owner                     |
| ------------------------------------------------- | ---------------------------------- |
| Frontend-safe schemas, associated types, errors   | `<service>/schema.ts`              |
| Frontend-safe pure service operations             | `<service>/lib/utils.ts`           |
| Service interface and exposed Layers              | `<service>/service.ts`             |
| Private implementation or backend dependencies    | `<service>/internal/*`             |
| Application RPC group                             | `apps/<app>/src/rpcs/contracts.ts` |
| Application RPC implementation                    | `apps/<app>/src/rpcs/handlers.ts`  |
| Client Atom RPC runtime and shared app operations | `apps/<app>/src/lib/utils.ts`      |
| Server entry module and complete Layer graph      | `apps/<app>/src/main.server.ts`    |

No `index.ts` or barrel exports.

Frontend-safe owners contain contracts only. Runtime behavior and platform dependencies stay in `internal/*`.

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
