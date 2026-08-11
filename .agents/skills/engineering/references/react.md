# React

## Intent

Give each state one owner; keep components presentational.

| Owner                  | State                                                                   |
| ---------------------- | ----------------------------------------------------------------------- |
| TanStack Router search | shareable/restorable view, selection, filter, sort, tab, panel, cursor  |
| Effect Atom            | frontend logic, derived values, async state, actions, pending, failures |
| Effect RPC             | typed backend requests, success, failure, and streams                   |
| React                  | ephemeral DOM interaction                                               |

```ts
const [result, maintainProject] = useAtom(RpcClient.mutation('projects.maintenance'), {mode: 'promise'})
await maintainProject({payload: {cwd}})
```

- Each frontend defines one always-available `AtomRpc.Service` client in its runtime module.
- Expose current backend state through streaming RPCs.
- Read `AsyncResult` atoms with `useAtomSuspense` when a Suspense boundary owns loading.
- Join related async sources and derive the complete presentation model in one Atom; components read the finished model instead of coordinating `AsyncResult` branches.
- Construct component-local and direct RPC Atoms at their use site; React Compiler stabilizes them. Use module scope for shared state, keyed families, or a composed Atom graph.
- `Atom.family` identity uses a stable domain value, never array position or concatenated fields.
- Optimistic state wraps the authoritative source Atom. Its reducer returns the provisional source value; success refreshes that source and failure rolls it back. Never model pending identifiers as an optimistic source.
- Keep props beside their owner; reusable component packages receive no service-schema types.
- `AsyncResult` owns pending and failure; never mirror either into React state. Subscribe to fire-and-react failures at the UI boundary.
- Mount an Atom that owns related `AtomContext.subscribe` reactions instead of installing several component subscriptions.
- Use generated RPC query and mutation Atoms directly. If composition needs an input type the RPC cannot infer, move that operation into its owning RPC contract instead of inventing a callback-shaped UI contract.
- Use Promise mode only when its setter is awaited; never discard it with `void`.
- Keep async operations in Atom. A TSX callback may use `async` / `await` only to sequence the documented Promise bridge of an existing Atom or an unavoidable browser API; never replace Atom ownership with Promise state or Promise-chain methods.
- Reserve effects for browser synchronization and clean them up.
- DOM scheduling uses explicit `window` APIs and cleanup when Effect has no synchronous presentation operation.
- Synchronous presentation uses Effect module unsafe operations when available, such as `DateTime.nowUnsafe()` and `Random.Random.defaultValue().nextDoubleUnsafe()`. When no synchronous Effect operation exists, move the behavior to Effect Atom; never run an Effect during render.

Reject domain validation, Promise state, duplicated backend state, optional/local RPC runtimes, wrapper atoms, and effects that derive application data.
