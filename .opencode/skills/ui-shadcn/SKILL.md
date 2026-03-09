---
name: ui-shadcn
description: Load when building UI - shadcn primitives, theme tokens, visual language
---

## Source files

```
src/**/theme.css     (design tokens — read before styling anything)
src/components/ui/   (local shadcn components — check before building new ones)
```


### Check available primitives

```bash
bun shadcn list @shadcn
```


### Add missing primitives

```bash
bun shadcn add <name> --yes --overwrite
```


### Don't create custom components without checking primitives

```typescript
// Bad - custom card component
export function MyCard({ children }) {
  return <div className="border rounded p-4">{children}</div>
}

// Good - use shadcn Card primitive
import { Card, CardContent } from '@components/ui/card'

<Card>
  <CardContent>{children}</CardContent>
</Card>
```


### Compose primitives

```tsx
// Bad - custom modal with manual backdrop/positioning
function UserModal({open}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/50">
      <div className="bg-white p-4 rounded">...</div>
    </div>
  )
}

// Good - Dialog primitive handles accessibility, positioning, and backdrop
<Dialog>
  <DialogTrigger>Open</DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    <div>Content</div>
  </DialogContent>
</Dialog>
```


### Don't fork shadcn components

```typescript
// Bad - editing src/components/ui/card.tsx to tweak a detail for one screen

// Good - wrap at screen level, leave the primitive untouched
function UserScreen() {
  return (
    <Card className="custom-layout">
      <CardContent>Screen-specific content</CardContent>
    </Card>
  )
}
```


### Don't hardcode arbitrary values

```typescript
// Bad - arbitrary color or spacing not from the theme
<div style={{ backgroundColor: '#3b82f6' }}>
<div className="p-[13px]">

// Good - use theme tokens from theme.css
<div className="bg-primary">
<div className="bg-primary text-primary-foreground">
```


## Layout and interaction

- Prefer existing layout primitives before creating custom wrappers
- Use meaningful motion only when the surrounding product already uses animation
- Keep mobile and desktop layouts equally intentional
- Reach for custom components only after checking the shadcn registry and existing local patterns

## Icons

Use the icon set already present in the repository. Add a new icon package only when the repo already depends on it or the task explicitly requires it.

```typescript
// Bad - importing from an icon library not used in this repo
import {SomeIcon} from 'new-icon-library'

// Good - use the icon library already in the repo's dependencies
import {SomeIcon} from 'existing-icon-library-in-package-json'
```


## Visual design rules

### Theme

- High contrast, visible borders
- NO gradients, glass, decorative blur, or marketing cards
- Existing design tokens ONLY
- NEVER invent colors, tokens, or animations

### Styling

- Use `cn()` for ALL conditional `className` values
- Icons over text where possible
- Use the most recognizable icon from the existing icon library
- NEVER edit the shadcn component source files

### Components

- Compose shadcn primitives, NEVER reimplement them
- Minimal, functional motion only
- Follow existing patterns in the codebase
