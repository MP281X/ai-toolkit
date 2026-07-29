# TypeScript

## Intent

Use compiler guarantees as the strongest owner of types, inference, control flow, and module correctness.

Inspect the current root and package `tsconfig` files, installed TypeScript version, compiler schema/help, and relevant `.agents/repos/typescript` source before changing options.

1. Inventory every current compiler option and inherited override.
2. Start from maximum practical strictness for owned source.
3. Map each enabled option to its unique invariant and current diagnostic evidence.
4. Relax only when maintained external declarations, generated source, or repository evidence makes the guarantee impractical.
5. Keep generated and reference repositories outside owned-source analysis.

Do not duplicate a compiler diagnostic in Oxlint, Effect, Fallow, or prose.
