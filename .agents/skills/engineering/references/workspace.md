# Workspace

## Intent

Keep package and generated-file ownership explicit.

- Edit `package.json` directly; never use `vp add`.
- Preserve existing manifest key, dependency, and intentional blank-line grouping/order.
- Put a dependency or script in its owning manifest; do not duplicate a root dependency in workspaces.
- New versions use `latest` unless the repository's current explicit case requires a range or channel.
- All-dependency upgrade → `vp run upgrade`; otherwise preserve unrelated ranges and lockfile resolution.
- Root scripts orchestrate repository behavior; package scripts own package behavior; CLIs use `bin`.
- Packages expose public entrypoints through `exports` and package-private modules through `imports`.
- Cross-workspace import → package export; intra-package import → subpath alias.
- Reject workspace `src`/`lib` imports and parent traversal.
- Extract a service package only for a generic independently reusable capability whose contract contains no application shapes or sibling-service requirements.
- Keep application services under `apps/<app>/src/services/<name>/{schema.ts,service.ts,internal/*}` and expose `#services/*` through the owning application manifest.
- Compose service packages in the application. When two capabilities cannot remain independent, keep their services in one owning package or keep the composition application-local.
- Change routes, SVGs, primitives, lockfiles, and other generated files through their owner; retain only reproducible output.
