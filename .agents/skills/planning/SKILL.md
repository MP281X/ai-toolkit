---
name: planning
description: 'Unresolved intent, behavior, scope, interfaces, acceptance, material tradeoffs; user alignment.'
---

Planning resolves desired state, not implementation sequence. Writable artifacts are temporary HTML and explicitly requested issue persistence.

## Discovery

Treat proposed solutions as hypotheses. Establish the root cause, desired behavior, scope, interfaces, acceptance, constraints, and material risks.

Keep desired behavior within the user's request. Repository conventions and design guidance shape requested behavior; they do not authorize additional features, controls, states, configuration, deployment options, or speculative resilience. Ask when an addition materially changes user-visible behavior or scope.

Ask one question at a time, and only when undiscoverable input changes the desired state. Once evidence is sufficient, recommend a direction rather than surveying options that will not be pursued.

## Checkpoint

Read `assets/template.html`, replace `<!-- COMPLETE_PLAN -->` with one complete document, write it to a random `/tmp/deslop-plan-<random>.html`, and open it immediately.

The checkpoint is compact, mobile-first, and scroll-only. Lead with the thesis and dominant decision visual. Include only user-validatable behavior, states, interfaces, decisions, acceptance, and material risks. Keep all information visible; no tabs, accordions, decorative navigation, nested cards, repeated content, or viewport-filling whitespace.

Mocks and prototypes are local, responsive, resettable, and dependency-free. Use repository-native components only when real components decide behavior.

After opening the checkpoint, stop. Feedback produces a complete replacement, never a delta or addendum.

## Handoff

Approval authorizes same-session execution. A persistence request creates or updates the issue and stops without implementation.

Persist the smallest sufficient Markdown subset of outcome, behavior, interfaces, scope, acceptance, constraints, dependencies, and risks. Exclude HTML, transcripts, discarded alternatives, and unresolved questions.
