# AGENTS.md

## Intent

- `deslop` is a CLI that identifies structural issues by analyzing TypeScript ASTs with the TypeScript compiler API
- It complements TypeScript, Biome, and other linters; it should catch structural issues they do not already catch
- It runs as a separate post-implementation step after the code already works
- It does not primarily identify bugs; it improves reviewability and future AI maintenance by making code more direct and idiomatic
- It is intentionally hyper-strict and may produce false positives, even though rules should minimize them where practical
- It is not optimized for humans to fix manually; it is used by AI agents as a checklist because agents otherwise ignore structural rules
- Diagnostics are warnings about structure, not mandatory rewrites; reduce them as much as possible without making the code worse

## Rule Philosophy

- Prefer fixes that address the root structural cause, not just the individual syntax node that triggered a diagnostic
- Prefer direct code when indirection hides dataflow, typeflow, or control flow from review
- Prefer TypeScript inference when explicit type syntax only gives agents a workaround for type errors
- Prefer real decode/refinement boundaries over assertions when data crosses an untrusted boundary
- Never create workaround code only to satisfy a rule
- If a refactor would hurt reviewability, preserve the current code and treat the diagnostic as an accepted false positive for that case

## Rule Design

- Rules should target structural causes, not naming conventions
- Rules should produce diagnostics and messages that push agents toward the intended structural direction
- Problem and fix messages are agent instructions, not human explanations; optimize them so agents understand the exact structural problem and the expected rewrite
- Message wording should be specific enough that an agent cannot satisfy the rule with a workaround while preserving the same hidden structure
- Rules can be strict enough to produce false positives if that catches more real slop
- Improve rule messages and precision when agents repeatedly fix diagnostics in the wrong direction
- Rules should not encourage exporting, renaming, wrapping, casting, moving code, or other workaround rewrites to avoid diagnostics
- If a framework or external API requires a shape that looks like slop, document that boundary in the rule behavior or command output

## Tests

- Tests should describe realistic scenarios, not tiny regression fragments
- Never add regression tests
- Add one scenario test for each rule
- Add more than one test for a rule only when the rule is complex or handles important edge cases
- Each test should focus on one rule unless the scenario is intentionally exercising related detections in the same rule
- Include allow cases for important boundaries so future changes do not force workaround code
