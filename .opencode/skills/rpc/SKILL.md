---
name: rpc
description: Load when defining RPC endpoints, grouping them, adding middleware, or wiring client and server assembly.
metadata:
  patterns: |
    Rpc.make, RpcGroup.make, RpcClient., RpcServer.,
    RpcMiddleware., RpcSchema., Rpc.exitSchema,
    .middleware(, stream: true, RpcTest.makeClient
---

## Source files

- `.opencode/resources/effect/packages/effect/src/unstable/rpc/Rpc.ts`
- `.opencode/resources/effect/packages/effect/src/unstable/rpc/RpcMiddleware.ts`
- `.opencode/resources/effect/packages/effect/src/unstable/rpc/RpcSchema.ts`
- `.opencode/resources/effect/packages/effect/src/unstable/rpc/RpcClient.ts`
- `.opencode/resources/effect/packages/effect/src/unstable/rpc/RpcServer.ts`
- `.opencode/resources/effect/packages/effect/src/unstable/rpc/RpcGroup.ts`
- `.opencode/resources/effect/packages/effect/src/unstable/rpc/RpcTest.ts`
- `.opencode/resources/effect/packages/effect/src/unstable/rpc/RpcMessage.ts`

## Patterns

- Endpoint definition → `Rpc.ts`: `Rpc.make`, `Rpc.exitSchema`
- Groups → `RpcGroup.ts`: `RpcGroup.make`
- Streaming → `Rpc.ts`, `RpcSchema.ts`: `Rpc.make(..., {stream: true})`, `RpcSchema.Stream`
- Middleware → `RpcMiddleware.ts`: `RpcMiddleware.Service`
- Response control → `Rpc.ts`: `Rpc.fork`, `Rpc.uninterruptible`
- Client/server assembly → `RpcClient.ts`, `RpcServer.ts`
- Testing → `RpcTest.ts`, `RpcTest.makeClient`
- Trust RPC schemas as external boundary

## Examples

```typescript
// Bad
const GetValue = {name: 'GetValue', payload: Schema.String}

// Good
const GetValue = Rpc.make('GetValue', {payload: Schema.String, success: Schema.Number, error: Schema.String})
```
