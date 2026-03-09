---
name: skill-maintenance
description: Update skill files when recurring patterns emerge. Add generic intentions, architectural patterns, or repeated corrections that should apply across the project.
---

## Source files

```
.opencode/skills/*/SKILL.md
```


## Overview

This skill updates skill files when the user indicates patterns that should apply across the entire project. It captures generic intentions, architectural decisions, and recurring patterns - NOT one-off fixes.


## When to use this skill

### DO use when the user indicates:

- "This pattern should be used everywhere"
- "Add this to the skills" 
- "This is how we should do X across the project"
- Repeatedly correcting the same pattern in multiple files
- Architectural decisions that affect coding style broadly

### DON'T use for:

- One-off mistakes or bugs
- Specific implementation details unique to one feature
- Minor code style preferences
- Things the user corrects only once


## Examples of appropriate skill updates

### Generic pattern that should be project-wide

User says: "Always use Effect.fnUntraced instead of returning Effect.gen from arrow functions. This should be the standard everywhere."

This should be added to effect-core skill.


### Architectural decision

User says: "We don't use classes for services, always use the ServiceMap.Service factory pattern. Add this to the skills."

This should be added to effect-core skill.


### Repeated correction becomes a pattern

Agent notices user corrects the same mistake 3+ times (e.g., "Don't use native array methods outside JSX"). User confirms: "Yes, always use effect/Array instead."

This should be added to effect-primitives skill.


## Process

1. Identify which skill file needs updating based on the pattern domain
2. Read the current skill file to understand existing structure
3. Research in `.opencode/resources/` if the pattern involves external APIs
4. Add a new section with clear DO/DON'T examples
5. Keep explanations brief but specific
7. Report what was added


## Format for new sections

```
## Brief descriptive title

One sentence explaining the rule or pattern.


### DO: Positive example

```typescript
// Good code example showing the correct pattern
const correct = ...
```


### DON'T: Negative example

```typescript
// Bad code example showing what to avoid
const incorrect = ...

// Good - corrected version
const correct = ...
```

## Rules

- Only add patterns the user explicitly says should be used everywhere
- Don't add one-off fixes
- Always include both DO and DON'T examples
- Keep explanations minimal - code examples are most important
- Update only ONE skill file per session unless patterns span multiple domains
