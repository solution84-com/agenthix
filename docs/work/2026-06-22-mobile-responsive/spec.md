---
created: 2026-06-22
description: Make the site web app usable from a mobile browser — responsive shell (drawer + bottom sheet), card-stacked tables, operator-first scope. Roadmap Phase 7.
---


# Make the Site Mobile-Friendly — Design

## Summary

**Goal:** the site web app is usable from a mobile browser, so the operator can reach and direct their agent from a phone while away (the native mobile app isn't launched).

**Scope (operator-first):** the responsive shell applies everywhere (nothing overflows on a phone); deep mobile polish + verification on the screens used remotely — chat, task board/kanban, project & task detail, sessions, agents. Rarely-used admin/settings screens only need to not break. Roadmap Phase 7.

**Approach:** mobile-first, in-place. Keep the existing shell components; convert their fixed-width/always-on layout to mobile-first Tailwind (base = single-column phone; `lg:` restores the desktop multi-column). No duplicate mobile components — one render tree, no drift.

**Out of scope:** the native mobile app; `hq/client` (separate app); agent live preview / deploy (Phase 8); any `ui/` layout components (the shell is site-local — confirmed, the only `@agenthix/ui` import in the shell is the brand mark).

## Decisions

| Decision | Choice |
|---|---|
| Screen scope | Operator-first — shell everywhere, deep polish on remote-use screens |
| Mobile nav | Left nav → off-canvas **drawer** (☰); right rail/panels → **bottom sheet** (chosen for scalability as panel types grow) |
| Wide tables | **Stack into cards** by default below `lg`; per-table override to horizontal-scroll for genuinely dense ones |
| Implementation | Mobile-first responsive in-place; shared layout-chrome state for drawer/sheet |
| Breakpoint | Two states only — mobile `< lg` (1024px, down to 360px), desktop `≥ lg`; tablets get the mobile layout |

## Architecture & components

One render tree, mobile-first Tailwind. New shared piece: a **layout-chrome context** holding `navDrawerOpen: boolean` and `activeSheet: null | 'notifications' | 'chat' | 'agent'`, so the top bar, drawer, and bottom sheet coordinate without prop-drilling.

Files touched (all `site/src`):
- `shared/layouts/AppLayout.tsx` — responsive grid; mounts drawer + bottom sheet; provides the layout-chrome context
- `shared/components/AppSidebar.tsx` — renders inline at `lg`, as the off-canvas drawer below `lg`
- `shared/components/RightSidebar/RightNavRail.tsx` + `RightSidebarPanel.tsx` — inline rail at `lg`, bottom sheet below `lg`
- `shared/components/TopAppBar.tsx` — gains ☰ (left) and panel triggers (right) below `lg`
- `shared/layouts/ProjectLayout.tsx`, `pages/settings/SettingsLayout.tsx` — same treatment for their secondary sidebars
- per-screen sweep: fixed-width panels (`w-[900px]`, `w-72/80`) and `px-8` padding get mobile-first variants; table list views adopt the card-stack pattern

## Responsive behavior

- **Desktop (`lg`, ≥1024px):** today's multi-column shell, unchanged.
- **Mobile (< `lg`, down to 360px):** single column, full-width content. Left nav hidden → slide-in drawer via ☰; selecting a destination navigates and closes the drawer. Right rail hidden → top-bar triggers open the relevant panel as a bottom sheet; dismissable.
- Drawer/sheet are CSS transforms driven by the layout-chrome context; the breakpoint switch is Tailwind utilities, not a JS media query in the render path.

## Tables & per-screen sweep

- Default below `lg`: each row stacks into a card (label:value pairs), tappable, no sideways scroll.
- Per-table override to a horizontal-scroll wrapper for genuinely dense/tabular screens not worth carding.
- Deep polish + verification on the operator-use screens; other screens just must not overflow.

## Viewport & base

Confirm/add `<meta name="viewport" content="width=device-width, initial-scale=1">` (Wasp head config); ensure no root container forces a desktop min-width.

## Testing

- **Unit/component:** the layout-chrome context (open/close/active-sheet transitions); a card-stacked table renders rows below `lg`.
- **E2E (Playwright, mobile viewport 375px):** the operator flow — drawer nav, bottom-sheet chat, view a board, open a card-stacked table/list. Each test cites its scenario with `@SC-NNN`.
- **Manual:** verify on a real phone before the phase closes.
- TDD throughout (test first, watch fail).

## Acceptance criteria

These become the Phase 7 user story + scenarios in the QA contract (authored at plan time — see QA-contract coordination below).

- **AC1:** below `lg`, the site renders single-column with no horizontal overflow at 360–414px width.
- **AC2:** ☰ opens/closes the nav drawer; selecting a destination navigates and closes it.
- **AC3:** top-bar triggers open the right panels as a bottom sheet (chat, notifications, agent activity); each is dismissable.
- **AC4:** table list views render as stacked cards below `lg`; desktop tables are unchanged at `lg+`.
- **AC5:** the operator flow — open chat → message agent → view a board → open a task — is fully usable at 375px.
- **AC6:** at `lg+`, the desktop shell is visually unchanged (no regression).

## QA-contract coordination (monorepo note)

This is the first dev cycle under the QA framework, and it spans two repos:
- **this repository** (`feature/mobile-responsive`): code, tests (`@SC`-tagged), this spec, the plan.
- **parent repo**: the scenarios/stories contracts live at `docs/work/qa/{scenarios,stories}/site.md`.

At plan time, author the Phase 7 user story (`stories/site.md`, bump `next-us`) and scenarios (`scenarios/site.md`, bump `next-sc`) from the ACs above, with `· fulfils AC-NNN` traces on the scenarios. The site tests cite those `SC-NNN`. At finish, the contract edits and the site code land together.

## Deviations

_Filled in when the branch is finished. If nothing changed, write "None."_
