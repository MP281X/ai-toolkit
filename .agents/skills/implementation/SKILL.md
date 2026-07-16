---
name: implementation
description: 'Requested code or repository changes through verified delivery; evaluator scheduling, isolated handoffs, and convergence orchestration; medium and large features; cross-cutting refactors; issue or accepted-plan implementation; materially risky behavior or architecture changes.'
---

Implementation carries accepted authority to one verified candidate and a ready pull request. Exploration, prototyping, construction, and early testing interleave as source reality requires. Delegate broad discovery and bounded writable slices with clear integration boundaries while retaining authority for reconciliation and completion.

## Authority

Read the accepted direct user task, issue, or plan, current behavior, consumers, tests, branch, and authority-relative diff. Current source decides private implementation details. Stop only when source reality requires changing accepted UI/UX, observable behavior, public interfaces, module ownership, scope, or material risk.

Preserve accepted behavior outside scope. Prefer maintained foundations. Remove issue-owned temporary paths, compatibility layers, superseded variants, stale exports, and dead tests. Report material unrelated defects without expanding scope.

Return an existing pull request to draft whenever implementation resumes.

## Candidate

Produce one coherent implementation path. Delegated writers never publish or own integration. Integrate their work against the complete candidate and resolve candidate-owned failures before evaluation.

Small explicit copy, color, documentation, configuration, or obvious one-line changes use the lightweight gate: baseline verification, commit, push, and ready pull request.

## Convergence

For all other work:

1. Run `vp run fix && vp run check && vp run test`; every command must pass. Any failure that prevents proof blocks publication even when unrelated.
2. Launch fresh read-only test evaluators dynamically for every material behavior surface.
3. Fix every candidate-owned failure and restart from step 1.
4. Launch at least two fresh full-scope adversarial reviewers. One emphasizes desired-state completeness, behavior, failure modes, regressions, and proof. The other emphasizes architecture, interfaces, simplicity, repository policy, stale paths, and code quality.
5. Add fresh full-scope risk reviewers for each materially distinct UI, accessibility, security, lifecycle, policy, or other concern.
6. Resolve every evidence-backed candidate-owned finding. Report material unrelated defects separately. After any repository change, restart from step 1 with new evaluators.
7. Complete only when every required evaluator reports no actionable candidate-owned finding on the same unchanged candidate. Preserve separately reported unrelated findings.

Evaluators receive accepted task authority and repository access, but no rationale, changed-file hints, prior findings, fixes, or completion claims. They discover relevant state independently and never edit. Test evaluators derive cases and exercise real public behavior: backend or protocol tests, the real rendered browser origin, or clean skill-agent contexts as applicable.

If an evaluator or required real surface is unavailable, implementation is blocked and must not commit.

## Publication

After convergence, commit all intentional changes, push, create or update the pull request, align its body with the accepted state and proof, and mark it ready. Only the human merges.

Report the outcome briefly, including important decisions, improvement opportunities, residual risks, and unrelated findings.
