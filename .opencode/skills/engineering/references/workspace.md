# Workspace

Use Vite+ as the package-manager interface. Preserve the repository's selected tools for linting, formatting, testing, building, and application generation.

| Topology             | Requirement                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any repository       | Inspect the active manifest, scripts, aliases, exports, and generated-file owners before changing them.                                                  |
| Single package       | Keep dependencies and scripts in its manifest. Do not introduce workspace abstractions.                                                                  |
| Multiple packages    | Put a dependency in the highest manifest shared by every direct consumer. Keep repository orchestration at the root and package behavior in the package. |
| Cross-package import | Use an explicit package export.                                                                                                                          |
| Intra-package import | Use the configured alias for parent modules and relative paths for siblings.                                                                             |
| Generated file       | Change reproducible output through its generator.                                                                                                        |

After a dependency or topology change, run `vp install` before validation or execution. Preserve manifest grouping and established export conventions.
