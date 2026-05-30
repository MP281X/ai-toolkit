---
name: new-app
description: Create a new app by copying the portfolio template, fixing names, ports, and cleaning up RPC contracts and routes.
---

You are an app generator. Copy `@apps/portfolio/` and apply systematic transformations.

## Workflow

1. Get the new app name from `<request>`
2. Find the maximum port across all apps using: `grep -r "dev:.*--port" apps/*/package.json | grep -oP '\d+' | sort -n | tail -1`
3. Calculate next port range: round up to next multiple of 10, use that and +1
4. Copy `@apps/portfolio/` to `@apps/{name}/`, exclude `node_modules` and `dist`:
   ```bash
   mkdir -p apps/{name}
   find apps/portfolio -type f \
     ! -path "*/node_modules/*" \
     ! -path "*/dist/*" \
     ! -path "*/.git/*" \
     -exec cp --parents {} apps/{name}/ \;
   ```
5. Run `vp install` from repo root to update lockfile with new workspace member
6. Apply all transformations
7. Delete all route files except `(home)/index.tsx` and `__root.tsx`
8. Replace `(home)/index.tsx` with placeholder content

## Transformations

### package.json

- Set `"name": "@deslop/{name}"`
- Update ports: `dev:client` uses `{port}`, `dev:server` uses `{port+1}`

### vite.config.ts

- Update proxy target: `http://localhost:{port+1}`

### index.html

- Update `<title>` to the new app name

### src/lib/atomRuntime.ts

- Replace `OtelLayer('portfolio-client')` with `OtelLayer('{name}-client')`
- Replace `RpcContracts` import and usage with empty `RpcGroup.make()`

### src/lib/serverRuntime.ts

- Replace `OtelLayer('portfolio-server')` with `OtelLayer('{name}-server')`
- Remove `RpcHandlers` import and provide

### src/rpcs/contracts.ts

Replace entire content with empty exports:

```typescript
import {RpcGroup} from 'effect/unstable/rpc'

export const RpcContracts = RpcGroup.make()
```

### src/rpcs/handlers.ts

Replace entire content with empty exports:

```typescript
import {Effect, Layer} from 'effect'
import {RpcContracts} from '#rpcs/contracts.ts'

export const RpcHandlers = RpcContracts.toLayer(Effect.succeed(RpcContracts.of({})))
```

### src/routes/(home)/index.tsx

Replace with placeholder:

```typescript
import {createFileRoute} from '@tanstack/react-router'

export const Route = createFileRoute('/(home)/')({
	component: RouteComponent
})

function RouteComponent() {
	return (
		<div className="flex min-h-screen items-center justify-center">
			<h1 className="text-2xl font-bold">{name} App</h1>
		</div>
	)
}
```

## Definition of done

- `@apps/{name}/` exists with all template files copied
- `vp install` run to update workspace lockfile
- package.json has correct name and ports
- vite.config.ts proxy points to correct server port
- index.html has correct title
- RPC contracts and handlers are empty stubs
- lib files reference correct telemetry names
- Only home route exists with placeholder content
- No portfolio-specific code remains
- `vp run type-check` passes
