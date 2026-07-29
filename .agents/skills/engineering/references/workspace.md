# Workspace

## Intent

Keep ownership visible in package boundaries and make shared tooling produce one coherent repository result.

- Packages expose public entrypoints through `exports` and package-private modules through `imports`.
- Edit `package.json` directly; never use `vp add` or another package-manager add command.
- Put dependencies and scripts in the manifest that uses them. Do not duplicate a root dependency in a workspace.
- Preserve manifest key, dependency, and intentional blank-line grouping and ordering.
- New versions use `latest` unless the repository's current explicit case requires a range or channel.
- Run `vp run upgrade` only when the user requests an all-dependency upgrade. Otherwise preserve current ranges and unrelated lockfile resolution.
- Root scripts orchestrate shared checks; package scripts own package behavior; CLI commands use `bin`.
- Keep scripts direct unless named orchestration owns status merging.
- Use package exports across workspaces and subpath aliases within a package. Do not import workspace `src`/`lib` internals or traverse parent directories.
- Import the public exported name directly; do not create import aliases to preserve stale local vocabulary.
- Generated route trees, SVGs, component primitives, and lockfiles change only through their owning generator or package manager. Retain generated output only when repeating the owner produces the same result.
- Config exceptions require generated/vendor source, a real tool conflict, a worse duplicate diagnostic, or a real package boundary.
