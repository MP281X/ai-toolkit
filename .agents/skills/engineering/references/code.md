# Code

## Intent

Make final dataflow and ownership visible without explanatory indirection.

## Direct shape

- Reuse a direct existing path first; compose locally second; introduce an abstraction only when it owns policy, lifecycle, a boundary, recursion, or behavior reused or changed as one unit.
- Inline single-use access, condition, guard, callback, identity, primitive, pass-through, and static-return aliases when the expression is clearer at its use.
- Use natural parameters. Do not preserve a signature by repacking arguments into object bags, tuples, rest parameters, defaults, or forwarding wrappers.
- Use `Function.identity` for identity callbacks and `Match` when repeated discriminant branches form one decision.
- Keep value origin visible with direct property access; destructure only when the resulting names own an independent semantic value.
- Derive immutable values with expressions, `Match`, or the owning Effect/reactive primitive. Keep mutable state under an explicit runtime or reactive owner, not reassigned locals, module state, or local holder objects.
- Use maintained predicates for nullish or type checks when they preserve narrowing.

**Reject:** IIFEs used only for expression shape, needless named intermediates, origin-hiding destructuring, signature laundering, deeply nested conditionals, and compatibility wrappers.

## Types and identity

- Name a type when it is public, recursive, a boundary contract, or shared by independent consumers; otherwise preserve inference.
- Never annotate a return type except on a recursive function. Ban regular type assertions in owned source; permit `as const`, and leave generator-owned assertions to their generator.
- An optional property means omission. Include `undefined` only when explicit `undefined` is an honest accepted boundary value.
- Keep module augmentation local to the module declaration.
- Model public domain strings with schemas or brands.
- Represent identity with structured domain values; never concatenate fields into an ambiguous key.

**Failure:** incidental aliases and annotations create false APIs, hide ownership, and let callers construct invalid identities.

**Direction:** expose the smallest semantic contract and derive the rest at the owning use.
