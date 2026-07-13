---
name: app-creation
description: 'Create a workspace app from the portfolio foundation.'
---

Require a lowercase kebab-case app name. Stop if `apps/<name>` exists.

Before editing, gather the target-existence check, tracked template paths, root development-task configuration, app manifest, and allocated preview ports in one pass.

1. Determine the preview port before changing manifests:

```bash
max=$(rg --glob package.json -o 'PORT=[0-9]+' apps | cut -d= -f2 | sort -n | tail -1)
echo $(( (max / 10 + 1) * 10 ))
```

2. Copy the tracked files from `apps/portfolio`, excluding generated output and the generated route tree. Preserve copied paths, file modes, and foundation infrastructure.
3. Reduce the app to one placeholder home page that reads the app name through a minimal RPC and displays a loading fallback. Remove portfolio-specific UI and domain behavior. Preserve telemetry, runtimes, transport, shell, theme, server, build configuration, aliases, and environment handling. Do not add artificial references to satisfy dead-code checks.
4. Replace portfolio identity in package metadata, HTML metadata, telemetry names, and retained source identifiers. Set the package name to `@deslop/<name>` and set `preview` to build and launch `./dist/server.js` with the allocated port.
5. Add `@deslop/<name>#dev:client` and `@deslop/<name>#dev:server` to the root `package.json` `deslop.dev` list, preserving app and client/server ordering.
6. Add requested behavior through the retained foundation.
7. Run `vp install`, then `(cd apps/<name> && vp build)` to generate the route tree and prove the app build. Never edit the generated route tree directly.

8. Search the completed app for portfolio identity, portfolio domain behavior, and unexpected generated files. Resolve every match.
9. Run `vp run fix && vp run check` from the repository root.

The completed app builds, has a unique preview port divisible by 10, retains unchanged foundation infrastructure, and contains no portfolio-specific behavior.
