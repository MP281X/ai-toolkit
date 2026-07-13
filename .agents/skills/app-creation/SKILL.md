---
name: app-creation
description: 'Create a workspace app from the portfolio template.'
---

Require a lowercase kebab-case app name. Stop if `apps/<name>` exists.

Before editing, gather the target-existence check, tracked template paths, root development-task configuration, app manifest, and allocated preview ports in one pass. Read only template files whose behavior must be retained or rewritten; replace source that will be discarded without auditing its implementation.

1. Determine the preview port before changing manifests:

```bash
max=$(rg --glob package.json -o 'PORT=[0-9]+' apps | cut -d= -f2 | sort -n | tail -1)
echo $(( (max / 10 + 1) * 10 ))
```

2. Copy the tracked files from `apps/portfolio`, excluding generated output such as `dist`, caches, and the generated route tree. Preserve the relative path, filename, file mode, and directory structure of every retained template file unless the requested behavior requires a structural change.
3. Reduce the app to one empty home page. Preserve the root shell, shared theme, router setup, static production server, build config, Docker entrypoint, and icon. Remove all RPC code and unused routes, aliases, dependencies, and environment variables. Keep retained infrastructure in its existing shape; make only changes required by removed behavior or the new identity.
4. Replace portfolio identity in package metadata, HTML metadata, telemetry names, and retained source identifiers. Set the package name to `@deslop/<name>` and retain only manifest entries used by the cleaned app. Set `preview` to build and launch `./dist/server.js` with the allocated port.
5. Add `@deslop/<name>#dev:client` and `@deslop/<name>#dev:server` to the root `package.json` `deslop.dev` list, preserving app and client/server ordering.
6. Run `vp install` after all manifest changes. Generate the route tree and prove the app build from the app directory; never edit the generated route tree directly:

```bash
(cd apps/<name> && vp build)
```

7. Search the completed app for removed template identity, RPC/telemetry references, obsolete environment variables, and unexpected generated files. Resolve every match rather than adding compatibility code.
8. Run `vp run fix && vp run check` from the repository root.

The completed app builds, has a unique preview port divisible by 10, retains the template conventions for unchanged behavior, and contains no portfolio-specific behavior.
