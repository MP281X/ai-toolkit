---
name: engineering
description: 'Use for product source, Effect, React, tests, product UI, package topology, manifests, scripts, exports, or generated files.'
---

Effect owns behavior and state; servers are authoritative; streaming RPC synchronizes Atom; React presents; adapters translate external interfaces.

- Trust typed values; decode unknown external data once at its boundary.
- Omit states excluded by types or schemas.
- Propagate the first reachable failure; retry or recover only when required by the contract.
- Remove dead, superseded, duplicate, contract-obsolete, or compatibility-only surface across the coupled path.
- Compose every matching canonical example without changing its structure; change only domain data.
- Verify current dependency signatures from their authoritative source; never infer them from memory.

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

## References

Read every matching reference completely once before acting. Open the link directly relative to this `SKILL.md`; never list, glob, grep, or search this skill directory. Continue only after reported truncation.

| Work                                                                                                                               | Reference                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Effect primitives, modules, operations, Stream, tracing, errors, or concurrency                                                    | [Effect](references/effect.md)                                                           |
| Schema defaults, transformations, validation, missing values, public types/interfaces/props/services, RPC contracts, or boundaries | [Contracts and data](references/contracts.md) + [Effect data](references/effect-data.md) |
| Services, Layers, scoped resources, SubscriptionRef, keyed instances, or caches                                                    | [Effect services](references/effect-services.md)                                         |
| Router, RPC client, Atom, or React                                                                                                 | [Frontend](references/react.md)                                                          |
| Service or helper behavior tests                                                                                                   | [Testing](references/testing.md)                                                         |
| Product interaction or visual design                                                                                               | [UI design](references/ui-design.md)                                                     |
| Package topology, manifests, dependencies, scripts, exports, CLI, or generated files                                               | [Workspace](references/workspace.md)                                                     |
