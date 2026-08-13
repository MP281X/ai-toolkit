---
name: engineering
description: 'Use for product source, Effect, React, tests, product UI, package topology, manifests, scripts, exports, or generated files.'
---

Compose every matching canonical example without changing its structure; change only domain data.

Effect owns behavior and state. Use its current primitives and data models instead of JavaScript APIs or local helpers. Before using a dependency API, delegate verification of the active version and exact signature to `delegate-exploration`; never infer it from memory.

## Construction

### Narrowest owner

```ts
// BAD
const user = input.session.user
const id = user.id
const result = load(id)

return result

// GOOD
return load(input.session.user.id)
```

### Standalone composition

```ts
// BAD
const CreateNote = Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed('Untitled')))

// GOOD
const CreateNote = pipe(Schema.String, Schema.withDecodingDefault(Effect.succeed('Untitled')))
```

### Evaluate reused effects once

```ts
// BAD
return Effect.all({
	audit: audit(yield * authorize(input.session.user.id)),
	view: render(yield * authorize(input.session.user.id))
})

// GOOD
const permissions = yield * authorize(input.session.user.id)

return Effect.all({audit: audit(permissions), view: render(permissions)})
```

### Intact objects

```tsx
// BAD
function Row({item: {id, title}}: {item: Item}) {
	return <ItemView id={id} title={title} />
}

// GOOD
function Row(props: {item: Item}) {
	return <ItemView id={props.item.id} title={props.item.title} />
}
```

Tuple and array destructuring remain canonical.

```ts
// BAD
const state = useState(initial)
const value = state[0]
const setValue = state[1]

// GOOD
const [value, setValue] = useState(initial)
```

### Inference

```ts
// BAD
const [target, setTarget] = useState<ReviewTarget>(ReviewTarget.make({}))

// GOOD
const [target, setTarget] = useState(ReviewTarget.make({}))
```

Annotate only schema pairs, public boundaries, recursive structures, or independently shared large shapes.

```ts
// BAD
const normalize = flow(String.trim, String.toLowerCase)

export function Label(props: {value: string}) {
	return <span>{normalize(props.value)}</span>
}

// GOOD
export function Label(props: {value: string}) {
	return <span>{pipe(props.value, String.trim, String.toLowerCase)}</span>
}
```

Module scope owns reuse, public boundaries, recursive or shared shapes, expensive shared computation, identity, or lifecycle: schema, service, component, Atom, cache, `RcMap`, `LayerMap`.

### Direct names

```ts
// BAD
import {Status as StatusSchema} from './schema.ts'

type StatusValue = typeof StatusSchema.Type

// GOOD
import {Status} from './schema.ts'

function render(status: Status) {
	return status
}
```

Name distinct owners to avoid import, type, property-access, or binding aliases. Schema pairs are the only mandatory same-name type declarations.

### Immutable ownership

Immutability is behavior; omit `readonly` syntax.

```ts
// BAD
function normalize(input: Item[]) {
	input.sort((left, right) => left.rank - right.rank)
	return input
}

// GOOD
function normalize(input: Item[]) {
	return Array.sortWith(input, item => item.rank, Order.Number)
}
```

Arguments, returned values, and service values remain immutable outside their owner.

## Effect modules

Use an existing module before adding a helper. Delegate exact export and signature inspection to `delegate-exploration`.

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

Stable module source: `.agents/repos/effect/packages/effect/src/<Module>.ts`.

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

Unstable entrypoint source: `.agents/repos/effect/packages/effect/src/unstable/<entrypoint>/index.ts`; modules are adjacent.

## References

Read every matching reference completely once before acting. Open the linked path directly relative to this `SKILL.md`; never list, glob, grep, or search this skill directory. Continue a read only when the tool reports truncation.

| Work                                                                                  | Reference                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Public types, interfaces, props, services, schemas, RPC contracts, or boundary shapes | [Contracts](references/contracts.md)             |
| Effect or Stream operations, tracing, errors, or concurrency                          | [Effect](references/effect.md)                   |
| Schema defaults, transformations, validation, or missing values                       | [Effect data](references/effect-data.md)         |
| Services, Layers, scoped resources, SubscriptionRef, keyed instances, or caches       | [Effect services](references/effect-services.md) |
| Router, RPC client, Atom, or React                                                    | [Frontend](references/react.md)                  |
| Service or helper behavior tests                                                      | [Testing](references/testing.md)                 |
| Product interaction or visual design                                                  | [UI design](references/ui-design.md)             |
| Package structure, manifests, dependencies, scripts, exports, CLI, or generated files | [Workspace](references/workspace.md)             |
