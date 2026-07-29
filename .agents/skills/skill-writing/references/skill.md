# Skill

## Intent

Give the smallest relevant audience one precise source for every instruction.

## Invocation

A model-invoked skill needs an independent leading concept. Its description names the exact trigger surface and outcome or boundary. Simulate positive and adjacent negative requests; rewrite metadata when either routes incorrectly.

Use `agents/openai.yaml` only when interface metadata or invocation policy changes. Treat generated metadata as generator-owned. Set `policy.allow_implicit_invocation: false` only for workflows that require explicit user selection.

The body starts with owned behavior. Do not repeat the title, description, invocation condition, root context, or another skill's policy.

## Shape

- Ordered workflows use steps or a state machine with observable entry and completion criteria.
- Reference skills use flat decision rules.
- A diagram owns its represented facts; do not mirror it in prose.
- A root contains only routing and unconditional policy; one precise pointer loads a decision-changing reference.
- The reference owns the complete conditional rule. Never mirror its summary or fallback in the root or another reference.
- Prefer the exact command or minimal valid/invalid example; retain prose only when it changes a decision.

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
- ambiguity in authority, completion, or invalidation;
- generated files edited outside their owner or inconsistent structural conventions.
