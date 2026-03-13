---
description: Add a new linting rule via Biome GritQL plugin or skill update
agent: general
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

**You can ask questions at ANY point in the workflow, not just at the start.**

## Workflow

1. **Explore existing rules**
   Check `packages/linter/src/*.grit` and `.opencode/skills/*/SKILL.md` to:
   - See if a similar rule already exists
   - Identify if this should update an existing rule or create a new one
   - Ensure no duplication

2. **Determine implementation type**

   **PREFERENCE: Create a Biome plugin first** if the rule can be expressed with GritQL pattern matching:
   - Syntax matching
   - Import/export patterns
   - Function/method call patterns
   - JSX/CSS attribute patterns
   - AST-based patterns

   **Use a skill update ONLY if** the rule absolutely cannot be expressed with GritQL:
   - Requires semantic analysis across scopes
   - Needs type-flow understanding
   - Requires external knowledge

   **Important: Prefer strict rules with potential false positives over no rule at all.** Code is written by AI agents - it's better to flag edge cases (which can be suppressed) than miss actual errors. When in doubt, create a plugin.

   Ask the user if you're unsure which to use.

3. **Implement the rule**

   **For Biome plugins:**
   Create `packages/linter/src/{descriptive-name}.grit`:
   ```grit
   engine biome(1.0)
   language js(typescript,jsx)

   `pattern` as $match where {
     register_diagnostic(span=$match, message="Clear, actionable message saying what to do instead")
   }
   ```

   Reference existing `.grit` files for pattern syntax.

   **For skill updates:**
   - Read the appropriate skill file in `.opencode/skills/`
   - Add rule with Bad/Good examples following the existing format
   - Use generic names (MyService, Config, Data)
   - One sentence explanation maximum
   - No file or project references

4. **Add test case**
   In `packages/linter/src/-test.tsx`:
   ```typescript
   // biome-ignore lint/plugin: <short reason>
   const badCode = "code that triggers the rule"
   ```

5. **Register the plugin** (if applicable)
   Add path to `biome.json` plugins array

6. **Verify**
   Run `bun run check` - should pass without errors

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
- Files created/modified
- The error message used
- Verification status
