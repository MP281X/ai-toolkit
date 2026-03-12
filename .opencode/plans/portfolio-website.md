# Goal

Transform `apps/template/` into a real-time, interactive portfolio website for Matteo Paludgnach (Full-Stack TypeScript Developer). The portfolio itself demonstrates the technical skills it describes: real-time WebSocket collaboration, Effect-TS patterns, React 19, and polished interactive UI.

The main route (`/`) is a single-page scroll with 6 sections. Existing demo pages (diff, input, realtime canvas) remain accessible on separate routes under `/(playground)/`.

## Decisions

### App Setup
- Rename `@ai-toolkit/template` → `@ai-toolkit/portfolio` in package.json
- Keep all existing infrastructure: vite.config, tsconfig, server/client entry points, existing RPC groups
- Move existing demo routes under `/(playground)/` layout with sidebar nav (preserves diff viewer, input showcase, realtime canvas)
- New portfolio page at `src/routes/index.tsx` (single-page scroll, default route)

### Route Structure
```
src/routes/
  __root.tsx               # Root: cursor overlay + scroll container
  index.tsx                # Portfolio: single-page scroll (all 6 sections)
  (playground)/
    route.tsx              # Sidebar layout (adapted from current (home)/route.tsx)
    diff/index.tsx         # Keep existing
    input/index.tsx        # Keep existing
    realtime/index.tsx     # Keep existing
```

Root redirect changes from `/chat` → `/` (portfolio is the default).

### Real-Time Architecture

New RPC group `PortfolioContracts` alongside existing groups:

```
src/rpcs/portfolio/
  contracts.ts     # Schema + RPC definitions
  handlers.ts      # Server-side SubscriptionRef state
```

**Data model:**
```
PortfolioVisitor: { id, name, color, x, y, scrollY, section, at }
  - x, y: viewport-relative (0-1 normalized)
  - scrollY: pixels from document top (for trail placement)
  - section: which section the visitor is viewing

PortfolioTrail: { x, pageY, color, at }
  - pageY: absolute page position (scrollY + viewport y * viewportHeight)
  - Trails accumulate, server keeps last ~500 points, evicts oldest

PortfolioState: { visitors: PortfolioVisitor[], trails: PortfolioTrail[], at }
```

**RPCs:**
- `portfolio.join` (stream) — register visitor, stream state updates, cleanup on disconnect
- `portfolio.move` — update cursor position + append trail point
- `portfolio.leave` — explicit disconnect (complementing stream cleanup)

**Client overlay (root layout):**
- Fixed-position layer renders other visitors' cursors as floating `<MousePointer2>` icons with name labels
- Background `<canvas>` element (position: absolute, full page height) paints trail dots at low opacity (~5-10%), scrolls with page
- Canvas repaints from `PortfolioState.trails` on each state update
- Own cursor sends position via `portfolio.move` throttled at 16ms (60fps)
- Visitor identity stored in `sessionStorage` (random name + color on first visit)

### Portfolio Sections (index.tsx)

Each section is a full-viewport (`min-h-dvh`) block. All share a `data-section` attribute for scroll tracking.

**1. Hero + Presence**
- ASCII art of "MATTEO" rendered in a monospace grid (each character = a cell)
- Ripple/wave displacement: characters offset from their rest position based on distance to cursor. Uses `requestAnimationFrame` loop, reads cursor position, applies spring-like displacement that decays with distance
- Below ASCII art: "Full-Stack TypeScript Developer" subtitle + location
- Visitor presence indicator: "N people viewing right now" with colored dots

**2. About Me**
- Professional summary text from CV
- Key highlights extracted as animated badges that fade in on scroll: "Real-time apps", "Type-safe E2E", "AI-assisted workflow"

**3. Technical Skills**
- CSS grid of skill cards grouped by category (Frontend, Backend, Data & Real-Time, DevOps, Testing, AI Tooling)
- Each card: icon + skill name + subtle proficiency indicator
- Hover: card lifts (translateY), shows brief description
- Cards stagger-animate in on scroll (each card delayed by index × 50ms)

**4. Work Experience**
- Vertical timeline with alternating left/right cards (or stacked on mobile)
- Each entry: company name, role, location, date range, expandable bullet points
- Timeline line draws itself on scroll (CSS `scaleY` animated by scroll progress)
- Cards slide in from left/right as they enter viewport
- Tech stack badges on each card (TypeScript, React, Docker, etc.)

**5. Education & Languages**
- Two cards side by side: Education (ITS + ISIS) and Languages (IT native, EN C1, ES basic)
- Simple fade-in on scroll
- Diploma scores shown as animated counters (95/100)

**6. Contact / Footer**
- Email, phone, GitHub, portfolio URL as icon links
- Small "Built with Effect-TS, React 19, WebSockets" tech credit
- GDPR note from CV

### Scroll Animations
- Custom `useInView` utility using `IntersectionObserver` (no external lib)
- Each section wrapper checks visibility and applies CSS classes: `opacity-0 translate-y-4` → `opacity-100 translate-y-0`
- Transition: `transition-all duration-700 ease-out`
- Stagger children using `transition-delay` based on child index
- Timeline progress tracked via scroll position for the timeline line animation

### Keyboard Navigation
- `j` / `k` or `↓` / `↑`: scroll to next/previous section
- `1-6`: jump to section by number
- `?`: toggle keyboard shortcut hint overlay
- `d`: toggle dark/light mode
- Small floating hint in bottom-right: "Press ? for shortcuts"
- Implemented as a root-level keydown listener with section refs

### ASCII Art Implementation
- Pre-computed ASCII art string for "MATTEO" using a blocky font (built at compile time, stored as constant)
- Rendered as a grid of `<span>` elements, each containing one character
- Each character has a rest position (grid cell)
- On every animation frame: compute distance from cursor to each character, apply displacement `offset = strength / (1 + distance²)` in the direction away from cursor
- Characters use `transform: translate(dx, dy)` for smooth sub-pixel movement
- Only characters within a radius threshold are displaced (performance optimization)
- Transition back to rest position with CSS `transition: transform 150ms ease-out` when cursor moves away

### Theme
- Keep existing JetBrains Mono + orange primary (`oklch(0.646 0.222 41.116)`)
- Dark/light mode via `prefers-color-scheme` (already supported by theme.css)
- Add `d` keyboard shortcut to toggle manually (class on `<html>`)

### Server Changes
- Add `PortfolioContracts` + `PortfolioLive` to the merged RPC group in `main.server.tsx`
- Add `PortfolioLive` layer to `serverRuntime.ts`
- Add `PortfolioContracts` to `atomRuntime.ts` RPC client group
- Trail eviction: server keeps max 500 trail points, drops oldest when exceeded
- Visitor cleanup: remove visitor from state when their stream ends (same pattern as existing `realtime.session`)

### Implementation Order
1. Restructure routes: move existing pages to `/(playground)/`, create empty `index.tsx`
2. Rename package, update imports
3. Add `PortfolioContracts` + `PortfolioLive` RPCs
4. Wire RPCs into server/client runtimes
5. Build cursor overlay in `__root.tsx` (floating cursors + trail canvas)
6. Build Hero section with ASCII art + ripple effect + presence counter
7. Build About Me section
8. Build Technical Skills grid
9. Build Work Experience timeline
10. Build Education & Languages section
11. Build Contact / Footer
12. Add scroll animations (`useInView` utility + CSS transitions)
13. Add keyboard navigation
14. Polish: responsive design, performance optimization, trail canvas rendering
