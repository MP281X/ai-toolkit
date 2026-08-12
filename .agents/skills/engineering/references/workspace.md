# Workspace

## Topology

Use only paths required by the owning package:

```text
apps/<app>/src/
	lib/atomRuntime.ts
	lib/serverRuntime.ts
	rpcs/{contracts.ts,handlers.ts}
	services/<name>/{schema.ts,service.ts,internal/*}

packages/<name>/src/
	schema.ts
	service.ts
	utils.ts
	internal/*
```

| Ownership              | Rule                                                  |
| ---------------------- | ----------------------------------------------------- |
| Dependency             | highest shared manifest                               |
| Root script            | repository orchestration                              |
| Package script         | package-local behavior                                |
| CLI                    | `bin`; `effect/unstable/cli`                          |
| Cross-package import   | public package export                                 |
| Intra-package parent   | package subpath alias                                 |
| Intra-package sibling  | relative import                                       |
| Frontend-safe contract | `schema.ts` or `utils.ts`; no backend-only dependency |
| Implementation         | private `internal/*`                                  |
| Generated file         | reproducible output changed through its owner         |

Edit manifests directly; retain existing dependency sections and blank-line groups. Full dependency upgrade uses:

```bash
vp run upgrade
```

```json
{"exports": {"./schema": "./src/schema.ts", "./service": "./src/service.ts", "./utils": "./src/utils.ts"}}
```

Extract a package only for an application-neutral, independently satisfiable capability. Applications minimally compose packages and application-specific behavior.

## Source

- `.agents/repos/effect/packages/effect/src/unstable/cli/index.ts`
