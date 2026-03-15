---
name: effect-rpc
description: Effect RPC endpoints, groups, clients, and servers
metadata:
  patterns: Rpc.make, RpcGroup.make, RpcClient.make, RpcServer.make, RpcSchema.Stream, RpcMiddleware.Service
---

## Source files

```
.opencode/resources/effect/packages/effect/src/unstable/rpc/Rpc.ts
.opencode/resources/effect/packages/effect/src/unstable/rpc/RpcMiddleware.ts
.opencode/resources/effect/packages/effect/src/unstable/rpc/RpcSchema.ts
.opencode/resources/effect/packages/effect/src/unstable/rpc/RpcClient.ts
.opencode/resources/effect/packages/effect/src/unstable/rpc/RpcServer.ts
.opencode/resources/effect/packages/effect/src/unstable/rpc/RpcGroup.ts
.opencode/resources/effect/packages/effect/src/unstable/rpc/RpcTest.ts
.opencode/resources/effect/packages/effect/src/unstable/rpc/RpcMessage.ts
```

## Purpose

- RPC is the typed network boundary; trust its schemas instead of re-validating internal values
- Start in `Rpc.ts`; it defines the endpoint shape, stream behavior, middleware attachment, and wrappers
- Check `RpcMiddleware.ts` and `RpcSchema.ts` before inventing custom middleware or stream conventions
- Use `RpcClient.ts`, `RpcServer.ts`, and `RpcTest.ts` as the main "how does this assemble end-to-end" references

## Where to look

- Endpoint definition: `Rpc.make`, `Rpc.exitSchema`
- Related endpoint indexes: `RpcGroup.make`
- Streaming endpoints: `Rpc.make(..., { stream: true })`, `RpcSchema.Stream`
- Middleware services: `RpcMiddleware.Service`
- Response control: `Rpc.fork`, `Rpc.uninterruptible`
- Client/server assembly and protocol adapters: `RpcClient.ts`, `RpcServer.ts`
- End-to-end examples: `RpcTest.ts`

## Best practices

- Trust RPC schemas as the external boundary instead of re-validating the same values deeper in the app
- Define endpoints with `Rpc.make` and group them with `RpcGroup.make` instead of ad-hoc request metadata
- Check middleware services and response wrappers before inventing local conventions for auth, tracing, or execution control
- Use `RpcTest.ts` as the first end-to-end reference when the shape is unclear
