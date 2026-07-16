---
name: planning
description: 'Unresolved intent, behavior, scope, interfaces, acceptance, material tradeoffs; user alignment.'
---

Planning is source-grounded pair brainstorming. Writable artifacts are temporary HTML and explicitly requested issue persistence.

## Exploration

Continuously inspect repository state, shared primitives, consumers, aligned library source, and feasibility. Delegate broad discovery when useful. Finding facts is the agent's responsibility; ask only for decisions that source cannot resolve.

Treat every proposal as a hypothesis. Challenge assumptions, identify simpler maintained alternatives, expose meaningful failures and tradeoffs, combine stronger directions, and reduce low-value scope.

## Decisions

Maintain a dependency tree of open decisions. Ask a coherent group of related questions only when every answer is independent. If one answer can change another question's relevance, wording, options, or recommendation, defer that question.

Provide concise source-grounded context, plain-language options, a recommendation, and a free-form answer path. User decisions concern UI/UX, observable states, module ownership, public interfaces, scope, acceptance, and material tradeoffs. Resolve private files, helpers, operators, wiring, and implementation sequence autonomously.

## Checkpoint

Before presentation, adversarially check omitted states, unsupported feasibility, unnecessary scope, interface leakage, and hidden cost. When no material decision remains, read `assets/template.html`, replace `<!-- COMPLETE_PLAN -->` with one complete question-free document, write it to a random `/tmp/deslop-plan-<random>.html`, and open it immediately.

The checkpoint is compact, mobile-first, and scroll-only. Lead with the thesis and dominant decision visual. Include only user-validatable behavior, states, interfaces, decisions, acceptance, and material risks. Keep all information visible; no tabs, accordions, decorative navigation, nested cards, repeated content, or viewport-filling whitespace.

Mocks and prototypes are local, responsive, resettable, and self-contained. Use repository-native components only when real components decide behavior.

After opening the checkpoint, stop. Feedback produces a complete replacement, never a delta or addendum.

## Handoff

Only the user's wording after the latest checkpoint that explicitly identifies issue persistence or implementation authorizes that action. Ambiguous approval requires clarification. A direct planning session commonly leads to issue persistence and a fresh implementation context; planning inside another task commonly leads to immediate implementation. These are intent signals, not authorization.

Persist the finalized objective, behavior, module ownership, public interfaces, scope, acceptance, constraints, dependencies, and material risks. Exclude HTML, brainstorming, transcripts, rejected alternatives, private implementation choices, and unresolved questions.
