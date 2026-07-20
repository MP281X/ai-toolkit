---
name: workspace-configuration
description: 'Use for approved workspace manifests, configuration, exports, scripts, and lockfiles; return coherent package wiring.'
---

## Wiring

- Packages: public entrypoints in `exports`; private aliases in `imports`.
- Applications: imports, scripts, and dependencies.
- Dependencies: the manifest that uses them; preserve local grouping.
- External dependencies: `latest` where consistent with the target manifest; retain intentional ranges and `workspace:*`.
- Manifest changes: lockfile records resolution; stop on unrelated churn.
- Root: shared check, fix, and test orchestration.
- Packages: package behavior scripts; CLI commands in `bin`.

Keep scripts direct unless named orchestration owns status merging.
