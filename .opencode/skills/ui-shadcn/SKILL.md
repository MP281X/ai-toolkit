---
name: ui-shadcn
description: UI composition with shadcn primitives - theme tokens, component usage, visual language
---

## Source files

```
Read repo's theme.css for design tokens
Check local components package in repo
```


## Overview

Build UI by composing shadcn primitives. Check existing patterns and theme before creating custom components.


## Before writing UI

Always check three things before writing UI code:

1. Read the repo's theme.css to understand available design tokens
2. Examine existing screens to understand the visual language
3. Check what shadcn primitives are available


### DO: Check available primitives

```bash
bun shadcn list @shadcn
```


### DO: Add missing primitives

```bash
bun shadcn add <name> --yes --overwrite
```


### DON'T: Create custom components without checking primitives

```typescript
// Bad - writing custom card component
export function MyCard({ children }) {
  return <div className="border rounded p-4">{children}</div>
}

// Good - use shadcn Card primitive
import { Card, CardContent } from '@components/ui/card'

<Card>
  <CardContent>{children}</CardContent>
</Card>
```


## Prefer shadcn primitives

Before writing a custom component, check whether an existing shadcn primitive already solves the problem.

Prioritize these primitives: Card, Dialog, Popover, Tabs, Table, Tooltip, DropdownMenu, ScrollArea, Sheet, Separator, Resizable, and form primitives.


### DO: Compose primitives

```tsx
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


## Compose do not fork

Do not edit or fork shadcn internals just to tweak one screen. Compose primitives locally and keep screen-specific structure close to the screen.

If you need different behavior, wrap the primitive in your own component at the screen level, not by modifying the primitive source.


### DO: Wrap at screen level

```typescript
// In your screen component
function UserScreen() {
  return (
    <Card className="custom-layout">
      <CardContent>Screen-specific content</CardContent>
    </Card>
  )
}
```


### DON'T: Fork shadcn components

```typescript
// Bad - modifying node_modules or copying component source
// to make a small change. Use composition instead.
```


## Theme usage

When styling is needed, read theme.css and use existing tokens. Do not hardcode ad-hoc styling decisions without checking the theme first.


### DO: Use theme tokens

```typescript
// Read theme.css first, then use tokens
<div className="bg-primary text-primary-foreground">
```


### DON'T: Hardcode arbitrary values

```typescript
// Bad - without checking theme
<div style={{ backgroundColor: '#3b82f6' }}>

// Good - use theme token after reading theme.css
<div className="bg-primary">
```


## Arrays in UI code

Outside JSX, prefer effect/Array. Native map is allowed only in JSX render lists.


### DO: Use effect/Array outside JSX

```typescript
const names = Array.map(items, item => item.name)
const valid = Array.filter(items, item => item.active)
if (Array.isReadonlyArrayEmpty(items)) return
```


### DON'T: Use native array methods outside JSX

```typescript
// Bad - outside JSX
const names = items.map(item => item.name)

// Good - outside JSX
const names = Array.map(items, item => item.name)

// Good - inside JSX
{items.map(item => <div key={item.id}>{item.name}</div>)}
```


## Layout and interaction

- Prefer existing layout primitives before creating custom wrappers
- Use meaningful motion only when the surrounding product already uses animation
- Keep mobile and desktop layouts equally intentional
- Reach for custom components only after checking the shadcn registry and existing local patterns


### DO: Check existing patterns first

```typescript
// Before creating a new layout component,
// check if the repo already has similar screens
// and follow their patterns.
```


## Icons

Use the icon set already present in the repository. Add a new icon package only when the repo already depends on it or the task explicitly requires it.


### DO: Use existing icon set

```typescript
import { SomeIcon } from 'existing-icon-library'

<SomeIcon />
```


### DON'T: Add new icon dependencies

```typescript
// Bad - adding lucide-react if repo uses heroicons
import { Icon } from 'lucide-react'

// Good - use what's already there
import { Icon } from '@heroicons/react'
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
