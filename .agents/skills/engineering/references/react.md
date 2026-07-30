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
RpcClient.query('projects.branches', {cwd})
RpcClient.mutation('projects.maintenance')
```

- Each frontend defines one always-available `AtomRpc.Service` client in its runtime module.
- Expose current backend state through streaming RPCs.
- Read `AsyncResult` atoms with `useAtomSuspense` when a Suspense boundary owns loading.
- A ref-shaped value uses `useRef`, not state containing `{current}`.
- `Atom.family` identity uses a stable domain value, never array position or concatenated fields.
- Keep props beside their owner; reusable component packages receive no service-schema types.
- Async commands expose pending and failure. Success follows backend confirmation.
- Reserve effects for browser synchronization and clean them up.

Reject component-owned fetching, domain validation, Promise state, duplicated backend state, optional/local RPC runtimes, wrapper atoms, and effects that fetch or derive application data.
