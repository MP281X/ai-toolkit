# Effect modules

Search before adding a helper. Read exact exports from the cloned source.

| Domain        | Stable modules                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Composition   | `Function` · `Effect` · `Stream` · `Channel` · `Sink`                                                                                                  |
| Values        | `String` · `Number` · `Boolean` · `Array` · `Record` · `Struct` · `Tuple` · `Iterable` · `Data`                                                        |
| Decisions     | `Predicate` · `Filter` · `Match` · `Order` · `Ordering` · `Equivalence` · `Equal` · `Hash`                                                             |
| Outcomes      | `UndefinedOr` · `Option` · `Result` · `Exit` · `Cause`                                                                                                 |
| Collections   | `HashMap` · `HashSet` · `Chunk`                                                                                                                        |
| Schema        | `Schema` · `SchemaAST` · `SchemaGetter` · `SchemaIssue` · `SchemaParser` · `SchemaRepresentation` · `SchemaTransformation` · `JsonSchema` · `Encoding` |
| Configuration | `Config` · `ConfigProvider` · `Redacted` · `PlatformError`                                                                                             |
| Time          | `Duration` · `DateTime` · `Clock` · `Schedule`                                                                                                         |
| State         | `Ref` · `SubscriptionRef` · `SynchronizedRef` · `Queue` · `PubSub`                                                                                     |
| Resources     | `Scope` · `Resource` · `Cache` · `ScopedCache` · `RcMap` · `RcRef` · `LayerMap` · `Pool`                                                               |
| Concurrency   | `Deferred` · `Semaphore` · `Fiber` · `FiberHandle` · `FiberMap` · `FiberSet` · `Request` · `RequestResolver`                                           |
| Observability | `Logger` · `LogLevel` · `Metric` · `Tracer`                                                                                                            |
| Runtime       | `Context` · `Layer` · `ManagedRuntime` · `Runtime`                                                                                                     |
| Platform      | `FileSystem` · `Path` · `Console` · `Terminal` · `Random` · `Crypto`                                                                                   |

Stable source: `.agents/repos/effect/packages/effect/src/<Module>.ts`.

| Public entrypoint            | Material modules                                                                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect/unstable/reactivity` | `Atom` · `AsyncResult` · `AtomRpc` · `AtomRegistry` · `AtomRef` · `Reactivity` · `Hydration` · `AtomHttpApi`                                                                                                                                                                          |
| `effect/unstable/rpc`        | `Rpc` · `RpcGroup` · `RpcSchema` · `RpcClient` · `RpcServer` · `RpcSerialization` · `RpcMessage` · `RpcMiddleware` · `RpcClientError` · `RpcTest` · `RpcWorker`                                                                                                                       |
| `effect/unstable/ai`         | `Model` · `LanguageModel` · `EmbeddingModel` · `Tokenizer` · `Chat` · `Prompt` · `Response` · `Tool` · `Toolkit` · `AiError` · `Telemetry` · `IdGenerator` · `ResponseIdTracker` · `McpSchema` · `McpProtocol` · `McpServer` · `OpenAiStructuredOutput` · `AnthropicStructuredOutput` |
| `effect/unstable/http`       | `HttpServer` · `HttpRouter` · `HttpServerRequest` · `HttpServerResponse` · `HttpMiddleware` · `HttpClient` · `HttpClientRequest` · `HttpClientResponse` · `FetchHttpClient` · `HttpBody` · `Headers` · `UrlParams` · `Multipart`                                                      |
| `effect/unstable/httpapi`    | `HttpApi` · `HttpApiGroup` · `HttpApiEndpoint` · `HttpApiSchema` · `HttpApiBuilder` · `HttpApiClient` · security · middleware · errors · tests · OpenAPI                                                                                                                              |
| `effect/unstable/process`    | `ChildProcess` · `ChildProcessSpawner`                                                                                                                                                                                                                                                |
| `effect/unstable/socket`     | `Socket` · `SocketServer`                                                                                                                                                                                                                                                             |
| `effect/unstable/cli`        | `Command` · `Argument` · `Flag` · `Param` · `Primitive` · `CliConfig` · `CliError` · `CliOutput` · `Completions` · `HelpDoc` · `GlobalFlag` · `Prompt`                                                                                                                                |

Unstable entrypoint: `.agents/repos/effect/packages/effect/src/unstable/<entrypoint>/index.ts`. Module source: adjacent `<Module>.ts`.
