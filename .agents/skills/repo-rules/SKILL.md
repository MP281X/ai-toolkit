---
name: repo-rules
description: Use when editing AGENTS.md, SKILL.md files, custom oxlint rules, rule fixtures, rule config, or the relationship between agent instructions and static enforcement.
---

# Repo Rules

## Surfaces

- `AGENTS.md`: repo-wide invariants.
- Scoped `AGENTS.md`: local runtime or ownership invariants.
- Skill: trigger-specific domain policy.
- Oxlint config: static enforcement.
- Custom rule: mechanically detectable policy.
- Fixture: executable rule case.
- One rule, one surface.

## Relationship

- Agent instructions steer authoring.
- Skills describe the target authoring pattern.
- Linter enforces static shapes.
- Fixtures prove custom rules fire.
- Active rules, active config, and active instructions define repo policy.
- Analysis requests are read-only.
- Implementation starts after accepted inventory or explicit implementation request.
- External rule adoption requires conflict check against `AGENTS.md`, skills, custom rules, and current config.
- External rule config respects rule metadata and local repo policy.
- Conflict check records: rule, source, conflicting instruction, decision.
- Rule replacement updates the active rule, config, fixture, test, and guidance as one change.
- Retired checks leave current helper output, fixtures, and tests owned by active checks.

## Style

- Directive bullets.
- Technical terms over prose.
- Target patterns over history, motivation, and filler.
- Examples only when terms stay ambiguous.
- Frontmatter: `name`, `description` only.
- Split only for distinct trigger.
- Merge when one skill requires reading the other.

## Rule Authoring

- Start from accepted shape.
- Prefer native/official Oxlint rule when it enforces the same shape.
- Keep custom rules narrow.
- Rule fixes produce the accepted target shape directly.
- Add custom rules after accepting the enforced shape.
- Rule replacement carries matching authoring guidance.
- For newly written repo tooling, reshape the code before adding config exceptions.
- If a rule fix makes code less direct, revisit the rule or scope.
- Shared constants require stable repo policy or multiple real consumers.
- Prefer duplicated literals over indirection when values are not a policy boundary.
- Fixture violations use matching `oxlint-disable-next-line -- fixture`.
- Unused disable means coverage failure.
- If a lint fixture is discovered as a runtime test, add explicit skipped suite.
- Existing diagnostics are resolved into the accepted target shape unless explicitly out of scope.
