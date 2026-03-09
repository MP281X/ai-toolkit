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
- **effect-primitives** - Load for ALL TypeScript code - standard library modules (pipe, flow, Match, Array, etc.) work everywhere
- effect-core - Load when using Effect runtime - services, layers, errors, Effect.gen, fnUntraced, streams
- effect-schema - Load when defining schemas - Classes, TaggedClass, literals, unions, defaults, errors
- effect-atom - Load for React components using Effect Atom - atoms, subscriptions, mutations, hooks
- ui-shadcn - Load when building UI - shadcn primitives, theme tokens, visual language
- refactor - Load for post-implementation cleanup - remove dead code, defensive checks, thin wrappers
- skill-maintenance - Load when adding project-wide patterns or architectural decisions to skills


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
