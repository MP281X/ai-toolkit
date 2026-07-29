# Effect

## Intent

Use maintained type-aware diagnostics for Effect-specific invalid states and native Effect replacements.

Inspect the installed `@effect/tsgo` package, `.agents/repos/effect-lsp`, its diagnostic definitions/defaults, and version compatibility with current Effect and TypeScript.

1. Enumerate the current diagnostic keys from maintained source.
2. Enable strict diagnostics first.
3. Disable a diagnostic only from concrete repository or boundary evidence.
4. Keep `importFromBarrel` disabled.
5. Integrate diagnostics once at the repository root; do not patch TypeScript or duplicate package commands.
6. Assign Effect-specific replacements here and leave semantic architecture to the Effect domain guidance.

Record every non-strict severity and its evidence. Do not preserve stale diagnostic snapshots across package upgrades.
