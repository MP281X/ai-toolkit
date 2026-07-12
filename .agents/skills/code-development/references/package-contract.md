# Package Contract

## Evidence

Every public export needs a current requirement, consumer, external protocol, or required black-box behavior. Stop when evidence is missing or a public choice remains unresolved.

## Surface

- Expose one public path per behavior.
- Put shared or service-instance input in layer/config; operation input in the method.
- Infer returns unless inference loses the contract.
- Export helper types only when a caller names them.
- Keep compatibility only when current behavior requires it.
- Public methods expose `R = never`; caller-owned scoped resources are the exception.

## Services

- `service.ts` owns the tag, contract, and public layer constructors.
- Named `internal/*` modules own implementations.
- Runtime tags stay broad; instance generics belong on constructors or identity helpers.
- Current mutable values have one `SubscriptionRef` read path. Incremental-only output uses `Stream`.
- Lifecycle uses `Scope` and finalizers. Cleanup methods exist only for domain stop behavior.
- One package service means one instance. Apps own multi-instance `RcMap` state.
- Multiple implementations use suffixes such as `makeCodex`, `makeClaude`, or `makeGitCli`.

## Schemas

- `schema.ts` contains minimal boundary data.
- Optional and nullable fields require a current absence case.
- Raw external shapes are public only when the protocol shape is public.
- Service failures use one exported `Schema.TaggedErrorClass`: required `message`, optional `cause`, inline `reason._tag` only when callers branch on it.

## Utilities

`utils.ts` contains public, pure, composable helpers. Private helpers stay in named `internal/*` modules.
