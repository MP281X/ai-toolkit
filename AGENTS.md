## Meta Rules

- Analyze step-by-step before implementation
- Sacrifice grammar for concision
- Be autonomous—continue to completion
- Use `question` tool for blocking questions (never ask in response)
- Never rely on training data—fetch up-to-date docs via context7

## Code Style

### Principles
- Functional: flat, pipeable, side-effect free
- Prefer duplication over premature abstractions
- Follow existing codebase patterns
- Maximize shadcn usage over custom components

### TypeScript
- Rely on type inference
- No type casts
- `any` banned

### React
- React Compiler enabled—never manually memoize

### Naming & Structure
- No abbreviated variable/argument names
- No comments—code must be self-documenting
- No prop destructuring—use dot notation
- Use early returns
- Inline 1-2 line functions—no named functions for short snippets

## Ui Style (Minimal Brutalist)

- Vibe: minimal brutalist / neobrutalist—raw + content-first, “unpolished” on purpose, still usable; high contrast, blocky layout, thick borders/dividers, bold type, minimal decoration.
- Layout: strong structure (simple columns/sections), visible separators, big whitespace + strict spacing rhythm, scroll-first pages, avoid soft cards/gradients/glass.
- Typography: typography does the heavy lifting—oversized headings, clear hierarchy via size/weight/spacing, readable body, tight copy.
- Components: shadcn theme stays; win via composition (alignment, spacing, dividers), not custom visuals; keep UI primitives obvious.
- Motion: minimal/functional only; no “smooth for the sake of smooth”.

## shadcn/ui Commands

```bash
# List all available components
bun shadcn list

# View component source
bun shadcn view button

# Add single component
bun shadcn add button

# Add multiple components
bun shadcn add button card dialog
```
