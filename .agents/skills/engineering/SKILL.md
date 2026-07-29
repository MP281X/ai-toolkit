---
name: engineering
description: 'Strict repository engineering for code, configuration, Effect, React, tests, and product UI implementation or review.'
---

Route only to the changed surface:

- General TypeScript/JavaScript shape, naming, identity, control flow, or abstraction: `references/code.md`.
- Manifests, dependencies, package boundaries, exports, scripts, generated files, lockfiles, or Vite Plus: `references/workspace.md`.
- Effect services, schemas, errors, resources, streams, tracing, and native boundaries: `references/effect.md`.
- Backend, Atom, and local React state ownership: `references/react.md`.
- Automated-test design, placement, or Effect test mechanics: `references/testing.md`.
- Layout, interaction, feedback, responsiveness, components, styling, or copy: `references/ui-design.md`.

Every loaded rule is a strict invariant, equivalent to a static diagnostic. Correct its owning boundary, inference, lifecycle, or dataflow problem; never add suppressions or indirection merely to silence a signal.
