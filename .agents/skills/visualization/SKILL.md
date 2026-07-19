---
name: visualization
description: 'Stable-theme HTML plans and visual explanations for user validation.'
slash: false
---

Turn a completed, question-free plan or requested visual explanation into one self-contained HTML document and open it immediately. For implementation planning this checkpoint is automatic and precedes approval.

Read `assets/template.html` and replace `<!-- COMPLETE_PLAN -->` with the complete document. Write to a random `/tmp/deslop-plan-<random>.html` for plans or `/tmp/deslop-visual-<random>.html` for explanations. Keep the template's explicit theme stable across refreshes and replacement documents; never derive it from system theme or time.

Use a compact, mobile-first, scroll-only composition. Lead with the thesis and dominant decision visual. Include only user-validatable behavior, states, interfaces, decisions, acceptance, constraints, and material risks. Keep all information visible: no tabs, accordions, decorative navigation, nested cards, repeated content, or viewport-filling whitespace.

Mocks are local, responsive, resettable, and self-contained. Use repository-native components only when real components decide behavior. A revised plan replaces the complete document rather than adding a delta.

After opening a plan checkpoint, stop for explicit user approval. Approval applies only to that exact task, candidate plan, and base.
