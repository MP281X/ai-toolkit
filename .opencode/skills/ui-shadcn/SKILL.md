---
name: ui-shadcn
description: UI components and styling
metadata:
  patterns: shadcn primitives, theme tokens, density, icons
---

## Source files

```
**/src/**/theme.css
**/src/components/ui/**
apps/*/components.json
```

## Purpose

- Preserve and reuse the existing shadcn components, tokens, and theme
- Research the local files above before building custom UI
- Prefer dense, information-rich layouts and avoid decorative filler
- Prefer icons for repeated actions when clarity is still preserved

## Existing primitives

- Check existing primitives before building custom components
- List the installed shadcn components first so you do not rebuild or reinstall something that already exists

```bash
bunx --bun shadcn@latest list
```

```typescript
// Bad
export function MyCard(props: {content: React.ReactNode}) {
  return <div className="border p-4">{props.content}</div>
}

// Good
<Card>
  <CardContent>{content}</CardContent>
</Card>
```

## Add missing primitives

- If the component you need is not installed, add it with the shadcn CLI instead of hand-copying source

```bash
# List available components
bunx --bun shadcn@latest list

# Add one component
bunx --bun shadcn@latest add button

# Add multiple components
bunx --bun shadcn@latest add dialog card input
```

```typescript
// Bad
export function MyDialog(props: {children: React.ReactNode}) {
  return <div className="border p-4">{props.children}</div>
}

// Good
<Dialog>
  <DialogContent>{children}</DialogContent>
</Dialog>
```

## Wrap, don't fork

- Wrap existing UI primitives at screen level instead of forking them

```typescript
function UserScreen() {
  return <Card className="p-2"><CardContent>content</CardContent></Card>
}
```

## Dense actions

- Prefer icons for repeated actions when clarity is still preserved

```typescript
// Bad
<Button>Delete</Button>

// Good
<Button size="icon" title="Delete"><Trash2 className="size-4" /></Button>
```

## Theme consistency

- Keep styling consistent with the existing app theme

```typescript
// Good
<div className="border-border bg-background text-foreground" />
```

## Visual defaults

- Squared, hard edges; avoid rounded pills and soft cards
- High contrast with visible borders on containers
- No gradients, glass effects, blur, or shadows
- Minimal functional motion only
- Monospace-first typography
- Dense first: optimize for information density

```typescript
// Bad
<div className="rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-300 shadow-xl" />

// Good
<div className="border border-border bg-background font-mono text-foreground" />
```
