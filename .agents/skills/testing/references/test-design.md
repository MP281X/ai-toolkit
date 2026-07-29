# Test design

## Intent

Protect breakable behavior through stable public seams rather than implementation structure.

- A scenario needs a current requirement, consumer, protocol, or regression risk.
- Test packages through public exports. Mock commands, APIs, CLIs, and networks at their system boundary.
- Derive expected values independently from the implementation.
- Colocate tests as `name.test.ts` or `name.test.tsx`.
- Do not test type shape, schema shape, framework shape, method existence, library behavior, or compile-time guarantees.

For test-first work, add one failing public behavior, confirm the intended failure, implement the smallest passing vertical slice, and repeat before refactoring.
