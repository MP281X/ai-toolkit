# Code

## Intent

Expose dataflow, ownership, and exact inferred types at the review site.

## Shape

| Prefer                                 | Reject                                    |
| -------------------------------------- | ----------------------------------------- |
| direct final path                      | parallel helper                           |
| local composition                      | single-use alias                          |
| direct property access                 | origin-hiding destructure                 |
| expression, `Match`, or reactive owner | reassigned local or holder object         |
| owning signature                       | forwarding wrapper or repacked parameters |

An abstraction must own policy, a boundary, lifecycle, recursion, expensive reused work, or behavior changed as one unit.

Keep module values only when they own shared identity, lifecycle, caching, schemas, or reused static data. Inline default services, accessors, single-use values, and aliases aggressively.

## Types

- Infer local and return types. Annotate a return only for recursion.
- Name only public, recursive, boundary, or independently shared types.
- Do not author `readonly` annotations or `Readonly` wrappers; preserve immutability through values and operations.
- Keep operation inputs inline unless they cross an unknown, serialized, or persisted boundary or are independently shared.
- Use `Value[]` for owned arrays; keep an owning schema property type only at its decoded boundary, and never widen a consumer to `Iterable<Value>` to absorb a type mismatch.
- Resolve type mismatches at their origin; never widen or narrow a value to appease its consumer.
- `value?: Value` means omission; add `| undefined` only when explicit `undefined` is a real boundary value.
- Model domain values and structured identities; never concatenate identity fields.

```diff
- const parse: Parser = flow(String.trim, Number.parse)
+ const parse = flow(String.trim, Number.parse)
```
