# Workspace

## Intent

Keep ownership visible in package boundaries and make shared tooling produce one coherent repository result.

- Packages expose public entrypoints through `exports` and package-private modules through `imports`.
- Put dependencies and scripts in the manifest that uses them; preserve grouping and intentional ranges.
- Manifest changes include only required lockfile resolution.
- Root scripts orchestrate shared checks; package scripts own package behavior; CLI commands use `bin`.
- Keep scripts direct unless named orchestration owns status merging.
- Use package exports across workspaces and subpath aliases within a package. Do not import workspace `src`/`lib` internals or traverse parent directories.
- Generated route trees, SVGs, component primitives, and lockfiles change through their owning generator or package manager.
- Config exceptions require generated/vendor source, a real tool conflict, a worse duplicate diagnostic, or a real package boundary.
