---
name: repo-rules
description: Use when editing AGENTS.md, SKILL.md files, custom oxlint rules, rule fixtures, rule config, or the relationship between agent instructions and static enforcement.
---

# Repo Rules

## Surfaces

- `AGENTS.md`: repo workflow and always-valid invariants.
- Scoped `AGENTS.md`: local runtime or ownership invariants.
- Skill: trigger-specific domain policy.
- Oxlint config: static enforcement.
- Custom rule: mechanically detectable fallback.
- Fixture: executable rule case.
- One rule, one surface.

## Relationship

- Agent instructions steer authoring.
- Skills target root cause, not edge cases.
- Linter enforces static shapes.
- Fixtures prove custom rules fire.
- Disabled rules do not create repo policy.
- Analysis requests are read-only.
- Implementation starts after accepted inventory or explicit implementation request.
- External rule adoption requires conflict review against `AGENTS.md`, skills, custom rules, and current config.
- External rule config respects rule metadata and local repo policy.
- Conflict review states: rule, source, conflicting instruction, decision.
- Rule removal or disabling deletes corresponding skill or `AGENTS.md` instructions instead of restating them as advice.
- Check removal deletes helper output, fixtures, and tests for that check unless another active check still uses them.

## Style

- Directive bullets.
- Technical terms over prose.
- No motivation, filler, or regression notes.
- Examples only when terms stay ambiguous.
- Frontmatter: `name`, `description` only.
- Split only for distinct trigger.
- Merge when one skill requires reading the other.

## Rule Authoring

- Start from forbidden shape.
- Prefer native/official Oxlint rule when it enforces the same shape.
- Keep custom rules narrow.
- Rule fixes remove the forbidden shape; do not add abstractions that only move it around.
- Add custom rules only after the forbidden shape is accepted.
- Removing or disabling a rule also removes its rule-specific authoring guidance.
- For newly written repo tooling, reshape the code before adding config exceptions.
- If a rule fix makes code less direct, revisit the rule or scope before preserving the workaround.
- Shared constants require stable repo policy or multiple real consumers.
- Prefer duplicated literals over indirection when values are not a policy boundary.
- Fixture violations use matching `oxlint-disable-next-line -- fixture`.
- Unused disable means coverage failure.
- If a lint fixture is discovered as a runtime test, add explicit skipped suite.
- Existing violations are fixed by removing the forbidden shape unless explicitly out of scope.
