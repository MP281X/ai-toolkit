---
name: effect-schema
description: Schema definitions and type modeling
metadata:
  patterns: Schema.decodeTo, Schema.encodeTo, Schema.decode, Schema.flip, Schema.middlewareDecoding, Schema.middlewareEncoding, SchemaTransformation.transformOrFail, SchemaTransformation.transformOptional
---

## Source files

```
.opencode/resources/effect/packages/effect/SCHEMA.md
.opencode/resources/effect/packages/effect/src/Schema.ts
.opencode/resources/effect/packages/effect/src/SchemaTransformation.ts
.opencode/resources/effect/packages/effect/src/SchemaGetter.ts
```

## Purpose

- Schema is not only validation; it is the main typed decode/encode transformation layer
- Start with `SCHEMA.md`, then use the source files below to pick the simplest current pattern
- Before writing custom parsing code, decide whether the problem is a value transformation, an optional-key transformation, or full parse middleware
- Prefer existing transformations and codecs over ad-hoc parsing helpers outside Schema

## Where to look

- Any value ↔ any other value: `Schema.decodeTo`, `Schema.encodeTo`, `SchemaTransformation.transform`, `SchemaTransformation.transformOrFail`
- Same-type normalization: `Schema.decode`, `Schema.encode`
- Missing key / `Option` behavior: `SchemaTransformation.transformOptional`, `optionFromOptionalKey`, `optionFromOptional`, `optionFromNullOr`
- Intercept the whole parse pipeline: `Schema.middlewareDecoding`, `Schema.middlewareEncoding`, `Schema.catchDecodingWithContext`, `Schema.catchEncodingWithContext`
- Reuse / invert logic: `Schema.flip`, `Transformation.compose`, `Transformation.flip`
- Non-obvious built-ins: `splitKeyValue`, `snakeToCamel`, `fromJsonString`, `timeZoneFromString`, `dateTimeUtcFromString`, `dateTimeZonedFromString`
- If you need custom behavior with lower-level control, inspect `SchemaGetter.transform`, `SchemaGetter.transformOrFail`, and `SchemaGetter.transformOptional`

## Best practices

- Prefer `Schema.Class` / `Schema.Struct` as the source of truth instead of parallel runtime parsing plus handwritten types
- Use `decodeTo` / `encodeTo` when the encoded and decoded shapes are genuinely different
- Use `transformOrFail` when conversion can fail or needs services; do not move that logic outside Schema by default
- Use `transformOptional` / `optionFrom*` helpers when the hard part is missing-key behavior
- Use schema middleware only when you need to intercept the whole parse Effect, not as a first choice for value conversion
- Use `new` for trusted internal construction and decode only real unknown boundaries

## Transformations

Keep parsing and formatting inside Schema when values cross a real boundary or when the encoded and decoded shapes differ.

```typescript
// Bad
const parseCount = (value: string) => Number(value)

// Good
const Count = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transform({
      decode: text => Number(text),
      encode: count => String(count)
    })
  )
)
```

## Built-in transforms

Check for an existing transformation before writing a custom parser or formatter.

```typescript
// Bad
const parseQuery = (text: string) => text

// Good
const Query = Schema.String.pipe(Schema.decode(SchemaTransformation.splitKeyValue()))
```
