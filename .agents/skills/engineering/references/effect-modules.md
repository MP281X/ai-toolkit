# Effect modules

Search before adding a helper. Use only exact exports read from `.agents/repos/effect/packages/effect/src/<Module>.ts`.

| Domain        | Modules                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Values        | `String` · `Number` · `BigInt` · `BigDecimal` · `Boolean` · `Array` · `Record` · `Struct` · `Tuple` · `Iterable` · `NonEmptyIterable` · `Data` · `Brand` · `Newtype`           |
| Decisions     | `Predicate` · `Filter` · `Match` · `Order` · `Ordering` · `Equivalence` · `Equal` · `Hash` · `Reducer` · `Combiner` · `Optic`                                                  |
| Outcomes      | `UndefinedOr` · `Option` · `Result` · `Exit` · `Cause` · `Take`                                                                                                                |
| Collections   | `HashMap` · `HashSet` · `Chunk` · `Trie` · `Graph` · `HashRing`                                                                                                                |
| Boundary      | `Schema` · `JsonSchema` · `JsonPatch` · `JsonPointer` · `Encoding` · `Redacted` · `Redactable` · `Config` · `ConfigProvider` · `Formatter` · `ErrorReporter` · `PlatformError` |
| Time          | `Duration` · `DateTime` · `Clock` · `Schedule` · `Cron`                                                                                                                        |
| Program       | `Effect` · `Stream` · `Channel` · `Sink` · `ExecutionPlan`                                                                                                                     |
| State         | `Ref` · `SubscriptionRef` · `SynchronizedRef` · `ScopedRef` · `References` · `Queue` · `PubSub`                                                                                |
| Resources     | `Scope` · `Resource` · `Cache` · `ScopedCache` · `RcMap` · `RcRef` · `LayerMap` · `LayerRef` · `Pool`                                                                          |
| Concurrency   | `Deferred` · `Latch` · `Semaphore` · `PartitionedSemaphore` · `Fiber` · `FiberHandle` · `FiberMap` · `FiberSet`                                                                |
| Requests      | `Request` · `RequestResolver`                                                                                                                                                  |
| Observability | `Logger` · `LogLevel` · `Metric` · `Tracer` · `Inspectable`                                                                                                                    |
| Runtime       | `Context` · `Layer` · `ManagedRuntime` · `Runtime` · `Scheduler`                                                                                                               |
| Transactional | `TxRef` · `TxSubscriptionRef` · `TxHashMap` · `TxHashSet` · `TxQueue` · `TxPubSub` · `TxSemaphore` · `TxReentrantLock` · `TxDeferred`                                          |
| Platform      | `FileSystem` · `Path` · `Console` · `Stdio` · `Terminal` · `Random` · `Crypto` · `unstable/cli`                                                                                |
