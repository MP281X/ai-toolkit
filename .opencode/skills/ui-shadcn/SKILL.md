---
name: ui-shadcn
description: UI components and styling
metadata:
  patterns: shadcn primitives, theme tokens, cn(), layout, brutalist, density
---

## Source files

```
**/src/**/theme.css
**/src/components/ui/
```


## Check primitives

Always check available primitives before building custom.

```bash
bun shadcn list @shadcn
bun shadcn add <name> --yes --overwrite
```


## Use primitives

Never create custom components without checking first.

```typescript
// Bad - custom card
export function MyCard({ children }) {
  return <div className="border rounded p-4">{children}</div>
}

// Good - use shadcn Card
import { Card, CardContent } from '@components/ui/card'

<Card>
  <CardContent>{children}</CardContent>
</Card>
```


## Compose primitives

Use Dialog instead of custom modals.

```tsx
// Bad - custom modal
function UserModal({open}) {
  if (!open) return
  return (
    <div className="fixed inset-0 bg-black/50">
      <div className="bg-white p-4">...</div>
    </div>
  )
}

// Good - Dialog primitive
<Dialog>
  <DialogTrigger>Open</DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
  </DialogContent>
</Dialog>
```


## Don't fork components

Wrap at screen level. Never edit shadcn source.

```typescript
// Bad - editing src/components/ui/card.tsx

// Good - wrap at screen level
function UserScreen() {
  return (
    <Card className="custom-layout">
      <CardContent>Content</CardContent>
    </Card>
  )
}
```


## Theme tokens

Always use theme tokens. Never hardcode.

```typescript
// Bad
<div style={{ backgroundColor: '#3b82f6' }}>
<div className="p-[13px]">

// Good
<div className="bg-primary">
<div className="p-2">
```

Prefer existing tokens before arbitrary values.

```typescript
// Bad - arbitrary when token fits
<span className="text-[#f97316]">Warning</span>

// Good - theme token
<span className="text-destructive">Error</span>

// Acceptable - truly one-off
<span className="text-[#4ade80]">Passing</span>
```


## Icons

Prefer icons over text labels.

```typescript
// Bad - text buttons
<Button>Delete</Button>
<Button>Settings</Button>

// Good - icon-only
<Button size="icon" title="Delete"><Trash2 className="size-4" /></Button>
<Button size="icon" title="Settings"><Settings className="size-4" /></Button>
```

Use the icon library in repo dependencies.

```typescript
// Bad
import {SomeIcon} from 'new-icon-library'

// Good
import {SomeIcon} from 'existing-library'
```


## Layout density

Build compact, information-dense layouts.

```typescript
// Bad - generous padding
<div className="p-8 space-y-6">
  <div className="mb-6">...</div>
</div>

// Good - tight spacing
<div className="p-2 space-y-1">
  <div>...</div>
</div>
```

For dense data, minimal padding and borders for separation:

```typescript
// Bad
<div className="py-4 px-3 border-b">...</div>

// Good
<div className="py-1 px-2 border-b">...</div>
```


## Remove redundancy

Every element must serve a distinct purpose.

```typescript
// Bad - header only labels content
<div>
  <h3>Users</h3>
  <p className="text-muted-foreground">Manage your users here.</p>
  <UserList />
</div>

// Good
<UserList />
```

One trigger per action.

```typescript
// Bad - delete in row and detail panel
<TableRow>
  <TableCell>{user.name}</TableCell>
  <TableCell><Button size="icon"><Trash2 /></Button></TableCell>
</TableRow>
// ...and in detail panel
<Button variant="destructive">Delete user</Button>

// Good
<TableRow>
  <TableCell>{user.name}</TableCell>
  <TableCell><Button size="icon"><Trash2 /></Button></TableCell>
</TableRow>
```


## Component-scoped constants

Keep constants inside components.

```typescript
// Bad - module-level constant
const filtered = Array.filter(items, item => item.active)

export function ItemList(props) {
  // uses filtered
}

// Good
export function ItemList(props) {
  const filtered = Array.filter(items, item => item.active)
}
```


## Visual design

- Squared, hard edges — `--radius: 0`. Never `rounded-full` or `rounded-[*]`
- High contrast, visible borders on all containers
- NO gradients, glass effects, blur, or shadows
- Minimal, functional motion only
- Monospace font throughout
- Dense first: optimize for information density
