---
model: github-copilot/gpt-5.4
agent: general
subtask: true
description: Update skills based on user code feedback
---

## Goal

The user has noticed the agent wrote code in a way that doesn't match their preferences. Update the appropriate skill to capture the correct pattern and ensure all skills remain consistent.

## User Feedback

<arguments>
$ARGUMENTS
</arguments>

## Workflow

1. **Understand the feedback**
   - Identify the pattern the user wants (correct way)
   - Identify the pattern the agent used (incorrect way)
   - Determine if this is a new rule or fixing an existing one
   - Use the question tool if the user's intent is unclear

2. **Read all skills**
   Read `.opencode/skills/*/SKILL.md` completely to understand:
   - Which skill(s) should contain this rule
   - If similar rules already exist
   - If there are existing examples that might conflict
   - The naming conventions, imports, and primitives used across skills

3. **Determine placement**
   Place the rule in the narrowest skill that applies:
   - effect-primitives: TypeScript basics, imports, naming, primitives
   - effect-core: Services, layers, streams, Effect runtime
   - effect-schema: Schemas, types, validation
   - effect-atom: React state, atoms, hooks
   - ui-shadcn: UI components, styling
   - refactor: Cleanup, simplification

4. **Check for duplicates and conflicts**
   - If a similar rule exists: update/expand it, don't duplicate
   - If the same pattern appears in multiple skills: keep it in only the narrowest one
   - If rules contradict: replace with the user's preference
   - If one skill has a vague rule and another has precise: consolidate to the precise version

5. **Write the example**
   - Generic names only (MyService, Config, Data, not project-specific)
   - No references to files, classes, or project structure
   - Use Effect primitives consistently (Array.map, String.trim, etc.)
   - One sentence explanation maximum
   - Bad/Good code blocks
   - No decorative comments
   - Must be consistent with all other skill examples

6. **Update and verify**
   - Add the rule to the target skill
   - Remove duplicates from other skills
   - Fix any contradictions
   - Ensure the example follows every other rule in every skill

## Output

Report:
- Which skill was updated and why
- What rule was added/modified
- What was deduplicated/removed (if anything)
- Confirmation of consistency with other skills
