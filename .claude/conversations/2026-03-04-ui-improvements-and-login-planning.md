# Session — 2026-03-04: UI Improvements & Login Planning

## What was discussed

### 1. Tool assessment
- Reviewed Code Constellation v1.0 (Electron + React + TypeScript)
- Core engine (tree-sitter AST parsing, 3-index system, ReactFlow constellation) confirmed solid
- User goal: get comfortable with unfamiliar codebases as quickly as possible

### 2. Constellation graph UI improvements (IMPLEMENTED)
Problems identified in the old UI:
- All nodes the same gray/dark — no visual distinction between callers and callees
- 3 tiny sliders (2px height) for zoom/pan X/pan Y — nearly invisible and awkward
- Small corner zoom control tucked away
- Solid line grid background was visually busy
- Tiers too close together (200px gap), felt cluttered

Changes made in this session:

**`src/components/GraphView.tsx`**
- Node color coding: **green** = callers, **blue** = selected/center, **purple** = callees
- Small role badge on every node (`CALLER` / `SELECTED` / `CALLEE`)
- Edge colors match the node roles (green edges up, purple edges down)
- Removed all 3 sliders and corner zoom widget entirely
- Added ReactFlow built-in `Controls` (zoom in/out/fit) — bottom-left, proper size buttons
- Added `MiniMap` — bottom-right, color-coded to match node roles
- Added `Panel` legend — top-right, shows the 3 color meanings
- Background changed from line grid to dot grid (cleaner)
- Tier spacing increased: callers at y=60, center at y=300, callees at y=540 (was 80/280/480)
- `BackgroundVariant.Dots` from reactflow v11

**`src/App.css`**
- Removed all `.edge-slider-*` and `.zoom-corner-control` dead styles
- Added `.graph-legend` and `.graph-legend-item` styles
- Updated `.react-flow__controls` to vertical layout, 36×36 buttons, dark themed
- Added `.react-flow__minimap` positioning styles

### 3. Login / Auth — planning discussion (NOT YET IMPLEMENTED)

User wants:
- Real Google OAuth (not fake/mock)
- Email + password fallback
- Eventually: subscription-based metering for distribution

**Google Cloud setup** (5 min, free):
1. console.cloud.google.com → New project
2. APIs & Services → OAuth consent screen → fill name + email
3. Credentials → OAuth 2.0 Client ID → Desktop app → copy client_id
4. No secret needed — uses PKCE flow for Electron

**Key architectural point flagged:**
- Code Constellation is an Electron desktop app — Vercel cannot host it directly
- Core value (scanning local codebases) requires filesystem access → desktop only
- "Vercel deployment" should mean: landing page + backend API (auth/subscription validation)
- Electron app itself is distributed as .exe/.dmg installer download

**Recommended phased approach:**
- Phase 1 (when ready): Login screen in Electron — Google OAuth PKCE + email/password fallback, tokens stored locally
- Phase 2 (distribution): Supabase (free tier) for auth + user records + subscription flags, Stripe for payments, Vercel for landing page + API

**Decision**: User chose to test the app first, implement login later when ready to distribute.

## Commits in this session
- Branch `claude/determined-chandrasekhar` → merged to `main`
- Commit: "Improve constellation UI — role-coded nodes, replace sliders with Controls/MiniMap/Legend"

## Files changed
- `src/components/GraphView.tsx`
- `src/App.css`
