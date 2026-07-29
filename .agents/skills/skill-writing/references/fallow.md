# Fallow

## Intent

Report only repository-graph reachability for owned source.

Inspect the installed Fallow schema/help, current workspace graph, package entrypoints, generated sources, and repository reference exclusions.

- Preserve intentionally public package and component exports.
- Exclude generated source and `.agents/repos/*`.
- Keep the validation command non-mutating; repair reachability from the owning source.

Derive the smallest configuration that reports current owned-code deadness without speculative policy. Retain `off` only to override an enabled default; omit default-off entries and severities equal to defaults.
