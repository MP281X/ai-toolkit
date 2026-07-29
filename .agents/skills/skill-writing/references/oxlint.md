# Oxlint

## Intent

Build one explicit, maintained, high-confidence inventory for syntax, imports, control flow, and generic restrictions.

Inspect the installed Oxlint/Vite Plus version, its rule listing and schemas, configured JS plugins, and relevant maintained source. Do not derive the inventory from memory or a broad preset.

1. Enumerate available rules for each active maintained plugin.
2. Group candidates by invariant rather than plugin category.
3. Remove rules owned by TypeScript, Effect, or Fallow.
4. Evaluate repository hits for correctness, false positives, generated-source boundaries, and overlap.
5. Enable rules explicitly; document concrete repository evidence for any disabled otherwise-applicable rule.
6. Keep suppressions inline, narrow, and reasoned.

Reject rules that prescribe a mechanical shape without proving an invalid state, broad preset ownership, formatter overlap, and diagnostics that encourage wrapper or alias laundering.
