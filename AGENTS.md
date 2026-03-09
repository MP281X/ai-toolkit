# AGENTS.md

Global rules for all agents.


## Research Required

Always search `.opencode/resources/{reponame}/` before implementing.

```
.opencode/resources/ is the ONLY source of truth for package APIs
NEVER rely on training data
NEVER research in node_modules
Use explore agent for parallel research across packages
Critical for Effect v4: training data only covers v3
```


## Skill Loading

Agents MUST load relevant skills before work.

Load with: "Load skill: {name}"

Available skills:
- effect-core - Effect runtime, services, layers, errors, streams
- effect-primitives - Predicate, Match, Array, Record, String, Number, Boolean, Option
- effect-schema - Schema.Class, TaggedClass, literals, unions, defaults
- effect-atom - Atom and RPC patterns for React
- ui-shadcn - shadcn UI primitives and composition
- refactor - Post-implementation cleanup
- skill-maintenance - Update skills when recurring patterns emerge


## Skill Maintenance

When the user indicates a pattern should apply across the project:

```
User says: "This should be used everywhere" 
User says: "Add this to the skills"
Repeated same correction 3+ times
```

Load `skill-maintenance` and update the appropriate skill file.

DON'T add one-off fixes to skills.


## Validation

Run after every implementation:

```bash
bun run fix
bun run check
```
