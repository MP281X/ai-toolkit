---
name: skill-maintenance
description: Load when adding project-wide patterns or architectural decisions to skills
---

## Source files

```
.opencode/skills/*/SKILL.md
```


## When to use this skill

Use when the user indicates:
- "This pattern should be used everywhere"
- "Add this to the skills" 
- "This is how we should do X across the project"
- Repeatedly correcting the same pattern in multiple files
- Architectural decisions that affect coding style broadly

Don't use for:
- One-off mistakes or bugs
- Specific implementation details unique to one feature
- Minor code style preferences
- Things the user corrects only once


## Examples of appropriate skill updates

Generic pattern that should be project-wide:
User says: "Always use Effect.fnUntraced instead of returning Effect.gen from arrow functions."
→ Add to effect-core skill with inline Bad/Good examples.

Architectural decision:
User says: "We don't use classes for services, always use the ServiceMap.Service factory pattern."
→ Add to effect-core skill.

Repeated correction becomes a pattern:
User corrects the same mistake 3+ times. User confirms: "Yes, always use effect/Array instead."
→ Add to effect-primitives skill.


## Process

1. Identify which skill file needs updating based on the pattern domain
2. Read the current skill file from `.opencode/skills/` to understand existing structure
3. Research in `.opencode/resources/` if the pattern involves external APIs
4. Add a new section with inline Bad/Good examples (same code block)
5. Keep explanations brief - code examples are most important
6. After updating the skill, immediately refactor the code that prompted the skill change
7. Report what was added


## Format for new sections

New sections must follow this exact structure — one sentence rule, then a single code block with Bad and Good separated by a blank line:

    ## Brief descriptive title

    One sentence explaining the rule.

    ```typescript
    // Bad - explanation of what's wrong
    const incorrect = ...

    // Good - explanation of correct approach
    const correct = ...
    ```


## Rules

- Only add patterns the user explicitly says should be used everywhere
- Don't add one-off fixes
- Always include inline Bad/Good examples in same code block
- Keep explanations minimal - code examples are most important
- Skill files are always under `.opencode/skills/`
- After editing a skill, update the in-progress code to satisfy the new skill requirements in the same session
