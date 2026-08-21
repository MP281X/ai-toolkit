## Validation

| Candidate                     | Exact command                               |
| ----------------------------- | ------------------------------------------- |
| Only Markdown files changed   | `vp run fix`                                |
| Any non-Markdown file changed | `vp run fix && vp run check && vp run test` |

Use no flags, paths, partials, underlying tools, builds, or substitutes.

Standard validation is supplemented, not replaced, by applicable global checks.

## Product scope

| Lead     | Requirement                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Optimize | Serve only the user's actual personal-software workflow.                                                                         |
| Minimize | Use the simplest Construction that solves the root problem. Keep unnecessary additions outside scope.                            |
| Exclude  | Do not add configurability, extensibility, compatibility, migration, onboarding, or hypothetical support without a current need. |
| Break    | Preserve backward or forward compatibility only when the Contract requires it.                                                   |
| Replace  | Keep one current path per behavior. Remove a superseded path across its Coupled path.                                            |
