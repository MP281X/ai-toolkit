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
const maintainProjectAction = RpcClient.runtime.fn<{cwd: string}>()(
	Effect.fn('WorktreeManager.maintainProject')(function* (input) {
		const client = yield* RpcClient
		yield* client('projects.maintenance', input)
	})
)
```

- Each frontend defines one always-available `AtomRpc.Service` client in its runtime module.
- Expose current backend state through streaming RPCs.
- Read `AsyncResult` atoms with `useAtomSuspense` when a Suspense boundary owns loading.
- `Atom.family` identity uses a stable domain value, never array position or concatenated fields.
- Keep props beside their owner; reusable component packages receive no service-schema types.
- Async commands expose pending and failure. Success follows backend confirmation.
- Keep async operations in Atom. A TSX callback may use `async` / `await` only to sequence the documented Promise bridge of an existing Atom or an unavoidable browser API; never replace Atom ownership with Promise state or Promise-chain methods.
- Reserve effects for browser synchronization and clean them up.
- DOM scheduling uses explicit `window` APIs and cleanup when Effect has no synchronous presentation operation.
- Synchronous presentation uses Effect module unsafe operations when available, such as `DateTime.nowUnsafe()` and `Random.Random.defaultValue().nextDoubleUnsafe()`. When no synchronous Effect operation exists, move the behavior to Effect Atom; never run an Effect during render.

Reject domain validation, Promise state, duplicated backend state, optional/local RPC runtimes, wrapper atoms, and effects that derive application data.
