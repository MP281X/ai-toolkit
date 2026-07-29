# Fallow

## Intent

Report only repository-graph reachability for owned source.

Inspect the installed Fallow schema/help, current workspace graph, package entrypoints, generated sources, and repository reference exclusions.

- Own dead files, exports, types, fake exports, and unique reachability only.
- Preserve intentionally public package and component exports.
- Exclude generated source and `.agents/repos/*`.
- Disable security, style, dependency-policy, cycle, duplication, and type checks owned elsewhere.
- Keep the validation command non-mutating; repair reachability from the owning source.

Derive the smallest configuration that reports current owned-code deadness without speculative policy.
