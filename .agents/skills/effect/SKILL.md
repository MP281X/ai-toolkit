---
name: effect
description: 'Use for approved Effect application behavior and external boundaries; return direct, concrete Effect code.'
---

## Model and boundaries

- Application behavior: Effect. Foreign APIs: explicit boundaries.
- Unknown input: `Schema`; configuration: `Config`; expected failures: typed errors.
- Resources: layers and finalizers. Pure transformations stay local until they own policy or change together.

## Direct-concrete ladder

remove unnecessary code → reuse current code → maintained Effect/platform capability → direct local composition → abstraction for domain policy, lifecycle, external boundary, public contract, or proven shared behavior

Genericity: real second behavior.

## References

- Configured `effect`: nontrivial API or architecture decisions.
- `references/package-contract.md`: exported services, schemas, utilities, layers, package behavior.
- `references/testing.md`: Effect test behavior.
