---
name: effect-core
description: Effect runtime, services, and async operations
metadata:
  patterns: Effect.gen, fnUntraced, ServiceMap, Layer, Stream, errors
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Effect.ts
.opencode/resources/effect/packages/effect/src/Layer.ts
.opencode/resources/effect/packages/effect/src/ServiceMap.ts
.opencode/resources/effect/packages/effect/src/Stream.ts
.opencode/resources/effect/packages/effect/src/Schedule.ts
```

## Purpose

- Start in `Effect.ts`; most of the important runtime choices are there, not in helpers built on top
- Use `Effect.gen` for lazy sequential effects with no arguments and `Effect.fnUntraced` for argument-taking effect functions
- Keep service boundaries small: define the `ServiceMap.Service` and its `Layer` close together
- Before writing custom orchestration, inspect the nearby concurrency, service-access, and provide APIs in `Effect.ts`

## Where to look

- Sequential effect definitions: `Effect.gen`, `Effect.fnUntraced`
- Service access and provision: `Effect.service`, `Effect.serviceOption`, `Effect.services`, `Effect.provide*`
- Service construction: `ServiceMap.Service`, `Layer.effect`, `Layer.succeed`, `Layer.merge`
- Concurrency helpers: `Effect.forEach` options, `race*`, `timeout*`, `retry*`, and `Schedule.ts`
- Stream integration: `Stream.ts` when the value is really a stream, not a loop around `Effect`

## Best practices

- Use `Effect.gen` for sequential effects without arguments and `Effect.fnUntraced` for effect functions with arguments
- Keep service definitions and live layers close together instead of scattering them across files
