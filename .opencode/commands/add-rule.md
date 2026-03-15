---
description: Add a new linting rule via Biome GritQL plugin or skill update
agent: development
---

## User Feedback

<arguments>
$ARGUMENTS
</arguments>

## CRITICAL: Clarify First

**Ask clarifying questions using the question tool when ANYTHING is unclear:**
- What specific code pattern should be flagged?
- What should the developer do instead (the correct pattern)?
- Examples of incorrect code that should trigger the rule

**Do not stop at the surface request. Ask until you understand the intent behind the rule:**
- Why is this pattern bad in this codebase?
- What failure mode is the rule trying to prevent?
- Is the goal readability, consistency, stronger inference, avoiding AI workarounds, or architectural correctness?
- Should the message teach a replacement, a design rewrite, or both?

**You can ask questions at ANY point in the workflow, not just at the start.**

## Workflow

1. **Explore existing rules first**
   Check `packages/linter/src/*.grit` and `.opencode/skills/*/SKILL.md` to:
   - See if a plugin already covers the reported pattern
   - See if two existing plugins are similar enough to merge
   - Identify whether a skill entry already exists and can be removed or simplified
   - Avoid duplicate guidance across plugins and skills

   Also inspect `AGENTS.md` and relevant source files in `.opencode/resources/` so the new rule matches the actual repo philosophy and package APIs.
   When researching APIs, do not stop at the first viable helper - compare the nearby alternatives and choose the simplest, most idiomatic pattern before encoding it into a rule or skill.

2. **Choose the implementation source of truth**

   **Biome plugin wins whenever possible.**

   If the requested pattern can be expressed in GritQL, keep the rule in a Biome plugin even if the plugin is broader or slightly less strict than the user's exact request.

   **Do not add or expand a skill when a plugin already covers the behavior well enough.**
   Skills should only carry guidance that cannot be enforced by a plugin.

   **There must be no overlap between plugins and skills.**
   If a plugin already enforces the behavior, delete or simplify the matching skill guidance instead of repeating it.

   **If two plugins are similar, prefer merging them** instead of creating a near-duplicate rule.

   Use a skill update only if the rule cannot reasonably be enforced with GritQL, for example when it requires:
   - Cross-scope semantic understanding
   - Type-flow reasoning
   - External or architectural knowledge

   **Important: Prefer a plugin with some acceptable false positives over skill-only guidance.** Code is written by AI agents, so enforceable rules are more valuable than perfect coverage.

3. **Implement the rule**

   **For Biome plugins:**
   - Prefer updating or merging an existing `.grit` file before creating a new one
   - Create `packages/linter/src/{descriptive-name}.grit` only when no existing plugin is a good home
   - Keep diagnostics clear and actionable, focused on what to do instead
   - Diagnostic text should explain the replacement and, when useful, the likely design mistake
   - Prefer rules that push the agent toward simpler code rather than clever workarounds
   - If a rule is noisy, brittle, or hard to suppress correctly, simplify or remove it instead of keeping a misleading rule

   ```grit
   engine biome(1.0)
   language js(typescript,jsx)

   `pattern` as $match where {
     register_diagnostic(span=$match, message="Clear, actionable message saying what to do instead")
   }
   ```

   **For skill updates:**
   - Only add guidance that is not already enforced by a plugin
   - Remove duplicated skill guidance when a plugin now covers it
   - Keep skills short and source-driven
   - Point to the relevant files in `.opencode/resources/...`
   - Do not try to document whole APIs; teach patterns, boundaries, and best practices only
   - Keep each topic in this exact structure:

   ```md
   ## {topic}

   {description: one short sentence}

   ```typescript
   // Bad
   {minimal bad example}

   // Good
   {minimal good example}
   ```
   ```

   - Use generic and reusable identifiers only
   - Do not reference app-specific files, services, routes, RPCs, codebase details, other skills, or plugin names inside the example block
   - Keep examples extremely small and focused so they show only the rule itself and nothing else
   - Avoid imports, setup, surrounding context, and extra helper code unless absolutely required to understand the rule
   - Every topic needs an example; do not leave guidance as bare text only

4. **Add or update tests for every plugin rule**
   In `packages/linter/src/-test.tsx`:
   - Add a minimal generic example that triggers the rule
   - Use a short suppression comment
   - Do not paste codebase-specific examples from the user directly into tests
   - Simplify names and surrounding code so the test demonstrates only the pattern being linted
   - If Biome says a suppression comment has no effect, the rule/test hookup is wrong and must be fixed
   - Keep `packages/linter/src/-test.tsx` as the source of truth unless explicitly told otherwise

   ```typescript
   // biome-ignore lint/plugin: short reason
   const value = thing.length === 0
   ```

5. **Register the plugin** (if applicable)
   Add or update the path in the `biome.json` plugins array

6. **Verify**
   Biome rules must always be tested.
   Assume the command starts from a clean state with no validation errors.
   Run:
   - `bun run fix`
   - `bun run check`

   If either command reports errors or warnings, fix all issues introduced by the rule change, merged plugin, tests, or skill edits, then run both commands again.

   Do not stop at the first failure. Keep iterating until both commands pass cleanly with no warnings before finishing.

## Suppression Format

**Use simplified suppression comments throughout the codebase:**

- **Custom plugin rules:** `// biome-ignore lint/plugin: <short reason>`
  - Keep reason to 1-5 words
  - Examples: `testing`, `dynamic color`, `type assertion`, `setting ref`

- **Built-in Biome rules:** `// biome-ignore lint/<group>/<rule>: <short reason>`
  - Example: `// biome-ignore lint/style/noParameterAssign: setting ref`

**NOT allowed:**
- Full file paths like `packages/linter/src/no-rule.grit`
- Long explanations (keep it short!)
- Copy-pasting full error messages into suppressions

## Output

Report:
- Rule name and implementation type (plugin or skill)
- Whether similar rules were found and how they were handled
- Whether an existing plugin was reused or multiple plugins were merged
- Files created/modified
- The error message used
- How the plugin was tested
- Whether validation required follow-up fixes
- Verification status
