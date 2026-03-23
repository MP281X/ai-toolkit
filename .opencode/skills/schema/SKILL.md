---
name: schema
description: Load when defining data shapes, decoding unknown input, or building encode/decode transformations.
metadata:
  patterns: |
    Schema.Struct(, Schema.Class(, Schema.TaggedErrorClass(,
    Schema.decodeTo(, Schema.encodeTo(, Schema.decodeUnknown,
    Schema.optional(, Schema.toStandardSchemaV1(,
    SchemaTransformation.transform, SchemaTransformation.transformOrFail
---

## Source files

- `.opencode/resources/effect/packages/effect/SCHEMA.md`
- `.opencode/resources/effect/packages/effect/src/Schema.ts`
- `.opencode/resources/effect/packages/effect/src/SchemaTransformation.ts`
- `.opencode/resources/effect/packages/effect/src/SchemaGetter.ts`

## Patterns

- Value transforms → `Schema.ts`, `SchemaTransformation.ts`: `Schema.decodeTo`, `Schema.encodeTo`, `SchemaTransformation.transform`, `SchemaTransformation.transformOrFail`
- Same-type normalization → `Schema.ts`: `Schema.decode`, `Schema.encode`
- Missing key and `Option` handling → `SchemaTransformation.ts`: `transformOptional`, `optionFromOptionalKey`, `optionFromNullOr`
- Parse middleware → `Schema.ts`: `Schema.middlewareDecoding`, `Schema.middlewareEncoding`
- Reuse and inversion → `Schema.ts`, `SchemaTransformation.ts`: `Schema.flip`, `Transformation.compose`
- Built-ins → `SchemaTransformation.ts`: `splitKeyValue`, `snakeToCamel`, `fromJsonString`, `dateTimeUtcFromString`
- Lower-level transforms → `SchemaGetter.ts`: `SchemaGetter.transform`, `SchemaGetter.transformOrFail`
- USE `Schema.Class` or `Schema.Struct` as source of truth. USE `new` for trusted internal construction.

## Examples

```typescript
// Bad
const parseCount = (text: string) => Number(text)

// Good
const Count = pipe(
  Schema.String,
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transform({
      decode: text => Number(text),
      encode: count => String(count)
    })
  )
)
```

```typescript
// Bad
const parseQuery = (text: string) => text

// Good
const Query = pipe(Schema.String, Schema.decode(SchemaTransformation.splitKeyValue()))
```
