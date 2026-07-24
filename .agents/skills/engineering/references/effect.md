# Effect

## Model

- Application behavior uses Effect; foreign APIs have explicit boundaries.
- Unknown input uses `Schema`; configuration uses `Config`; expected failures use typed errors.
- Resources use layers and finalizers. Pure transformations stay local until they own policy or change together.
- Prefer removal, existing code, maintained Effect/platform capability, direct local composition, then abstraction for domain policy, lifecycle, external boundary, public contract, or proven shared behavior. Genericity requires a second real behavior.

## Public contract

- Every export needs a current requirement, consumer, external protocol, or black-box behavior.
- Expose one public path per behavior. Shared or instance input belongs in layer/config; operation input belongs in the method.
- Infer returns unless inference loses the contract. Export helper types only when callers name them.
- Public methods expose `R = never`, except caller-owned scoped resources.

## Services and data

- `service.ts` owns the tag, contract, and public layer constructors; named `internal/*` modules own implementations.
- Runtime tags stay broad; instance generics belong on constructors or identity helpers.
- Current mutable values use one `SubscriptionRef` read path; incremental-only output uses `Stream`.
- Lifecycle uses `Scope` and finalizers. Cleanup methods exist only for domain stop behavior.
- One package service means one instance; apps own multi-instance `RcMap` state.
- Multiple implementations use specific suffixes such as `makeCodex` or `makeGitCli`.

## Schemas and utilities

- `schema.ts` contains minimal boundary data. Optional or nullable fields require a current absence case.
- Raw external shapes are public only when the protocol shape is public.
- Service failures use one exported `Schema.TaggedErrorClass` with required `message`, optional `cause`, and inline tagged reason only when callers branch on it.
- `utils.ts` contains public pure composable helpers; private helpers stay in named `internal/*` modules.
