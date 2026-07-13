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

2. Copy the tracked files from `apps/portfolio`, excluding generated output such as `dist`, caches, and the generated route tree. Preserve every copied path, filename, file mode, and infrastructure implementation unless the requested behavior requires a change.
3. Reduce the app to one empty home page. Remove portfolio UI, cursor behavior, domain contracts, handlers, telemetry identity, and unused dependencies. Preserve the root shell, shared theme, router, static production server, Docker entrypoint, RPC group and transport, client and server runtimes, serialization, WebSocket wiring, icon, build configuration, aliases, and environment handling.
4. Replace portfolio identity in package metadata, HTML metadata, telemetry names, and retained source identifiers. Set the package name to `@deslop/<name>` and retain only manifest entries used by the foundation. Set `preview` to build and launch `./dist/server.js` with the allocated port.
5. Add `@deslop/<name>#dev:client` and `@deslop/<name>#dev:server` to the root `package.json` `deslop.dev` list, preserving app and client/server ordering.
6. Add feature behavior through the retained foundation. Copied Docker, Vite, runtime, server-entrypoint, root-shell, and theme infrastructure remain unchanged unless a current requirement explicitly changes their behavior.
7. Run `vp install` after manifest changes. Generate the route tree and prove the app build from the app directory; never edit the generated route tree directly:

```bash
(cd apps/<name> && vp build)
```

8. Search the completed app for portfolio identity and domain behavior, obsolete environment variables, and unexpected generated files. Resolve every match rather than adding compatibility code.
9. Run `vp run fix && vp run check` from the repository root.

The completed app builds, has a unique preview port divisible by 10, retains unchanged foundation infrastructure, and contains no portfolio-specific behavior.
