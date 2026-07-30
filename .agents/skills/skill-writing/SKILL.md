---
name: skill-writing
description: 'Use when creating or auditing repository instructions, skill metadata, progressive references, or enforcement ownership.'
---

## Intent

Make independent runs choose the same action from the same evidence.

## Ownership

| Owner              | Surface                                                       |
| ------------------ | ------------------------------------------------------------- |
| `AGENTS.md`        | unconditional repository behavior                             |
| TypeScript         | type validity, inference, compiler semantics                  |
| Oxlint             | maintained generic syntax, import policy, source restrictions |
| Effect diagnostics | Effect invalid states and native replacements                 |
| Fallow             | repository-graph reachability                                 |
| Domain skill       | conditional semantic behavior                                 |

One invariant has one owner. Prefer the earliest maintained owner that proves it without harmful false positives. If mechanical compliance can still violate semantic intent, tooling owns the detectable floor and the domain skill owns the semantic decision.

## Skill

- Description = front-loaded trigger + exact owned outcome/boundary.
- Simulate positive and adjacent negative prompts; rewrite metadata when either routes incorrectly.
- Body begins with owned behavior; never repeat title, description, invocation condition, `AGENTS.md`, or another skill.
- Add `agents/openai.yaml` only for interface metadata, invocation policy, or tool dependencies; keep it synchronized with `SKILL.md`.
- Root = unconditional policy + precise conditional routes.
- Reference = complete conditional rule; never mirror it in the root or another reference.
- Ordered workflow → state machine or steps with observable completion.
- Static domain → flat decisions.
- Retain intent/reason/failure/reject only when it changes application or correction.

Delete history, tutorials, compatibility, migration, opposite rules, partial mirrors, and sentences that do not change behavior beyond model defaults.

## Deterministic enforcement

Inspect installed help/schema, active configuration, matching `.agents/repos/*`, and repository hits; never preserve a volatile inventory in prose.

| Tool               | Audit                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript         | inventory inherited options; start at maximum practical owned-source strictness; relax only for maintained external declarations, generated source, or concrete repository evidence                                  |
| Oxlint             | enumerate maintained active-plugin rules; group by invariant; remove TypeScript/Effect/Fallow/formatter overlap; enable rules with one valid owned-source end state; reject broad presets and shape-only diagnostics |
| Effect diagnostics | enumerate the installed compatible schema/source; start strict; record concrete evidence for every weaker severity; configure once at the root compiler boundary                                                     |
| Fallow             | derive the smallest owned-source reachability config; preserve intentional public exports; exclude generated/reference source; omit default-off and default-equivalent entries                                       |

Suppressions are narrow, inline, reasoned, and backed by an irreducible boundary.

## Audit

Reject:

- multiple owners or incompatible answers;
- duplicated meaning in different words;
- metadata trigger gaps or collisions;
- unconditional rules hidden behind progressive discovery;
- claims unsupported by current source;
- exceptions without a concrete boundary;
- ambiguous authority, completion, or invalidation;
- structural inconsistency across sibling skills.
