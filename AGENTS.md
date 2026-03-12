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


## Validation

Run after every implementation:

```bash
bun run fix
bun run check
```
