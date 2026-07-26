# Engineering enforcement

- Rules are architectural sentinels: enforce stable boundaries and ownership, not preferred syntax or mechanical rewrites.
- Domain and service contracts are Schema-backed; components are presentation-only and application behavior lives in Effect Atom dataflow.
- Prefer Effect modules to equivalent globals or prototypes. Never call `Effect.run*` in application code and never use method `.pipe`.
- Use data-first calls for dual APIs with two arguments; use `pipe` or `flow` for larger compositions.
- Access-alias checks target aliases that obscure owned APIs, not normal destructuring, props, or local names.
- Keep ternaries on one line; otherwise use a named value, `Match`, or control flow. Reused `Match.type` definitions live at module scope.
- Service modules expose static `layer*` constructors; internal implementations satisfy the public service contract and provide implementation-only dependencies.
- Generated code stays generator-owned and is excluded from repository formatting, lint, and dead-code analysis. Fallow gates dead files, exports, and types; component exports remain public.
- Scope runtime-specific lint rules to their runtime. Tests cover public services, public helpers, and custom rules only.
- Suppressions are exceptional, inline, narrow, and include the concrete reason; report every added suppression.
