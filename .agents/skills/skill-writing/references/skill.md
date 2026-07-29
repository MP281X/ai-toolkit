# Skill

## Intent

Give the smallest relevant audience one precise source for every instruction.

## Invocation

A model-invoked skill needs an independent leading concept. Its name carries identity; its description adds trigger branches and the outcome or boundary needed for reliable invocation.

Use `agents/openai.yaml` only when interface metadata or invocation policy changes. Set `policy.allow_implicit_invocation: false` only for workflows that require explicit user selection.

The body starts with owned behavior. Do not repeat the title, description, invocation condition, root context, or another skill's policy.

## Shape

- Ordered workflows use steps or a state machine with observable entry and completion criteria.
- Reference skills use flat decision rules.
- A diagram owns its represented facts; do not mirror it in prose.
- Progressive references are loaded only by a decision-changing branch.
- Keep examples only when prose leaves a material ambiguity.

## Pruning

Delete superseded, opposite, historical, compatibility, migration, tutorial, rationale-free, and partial-mirror residue. Every sentence must change behavior beyond model defaults.

## Self-review

Audit the complete composed instruction system for:

- multiple owners or incompatible answers;
- duplicated meaning in different words;
- metadata that cannot trigger its owned work;
- unconditional rules hidden behind progressive discovery;
- stale claims unsupported by current repository or maintained source;
- suppressions and exceptions without a concrete boundary;
- ambiguity in authority, completion, or invalidation.
