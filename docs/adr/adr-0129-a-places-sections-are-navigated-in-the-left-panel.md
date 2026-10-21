---
created: 2026-10-18
description: Inside a project, your space or an agent's page, the left panel drills into the place and lists its sections; the main navigation is one step back, behind ‹, and the page area holds only the chosen section, with no tab row or place header.
---

# ADR-0129: A Place's Sections Are Navigated in the Left Panel

**Status:** Accepted

## Context

A project has fourteen sections, your space eleven, an agent's page nine, and every one is in daily use. With the
open conversation docked beside the page (adr-0128), the page is narrower, and the Tools panel that used to list a
place's sections beside its conversation is gone. The sections need a home that shows all of them, at every width,
without taking room from the work.

## Options considered

**Tabs across the page, folding into ⋯.** Built and used first. Rejected by the owner after using both: a row of
fourteen folds most of them away at the widths that matter, and the tab row and a place header above every section
take height from the work.

**Grouping the sections** (Work, Files, and so on, as menus). Rejected: every section is important, and a group hides
the one the person wants behind a second click.

**A breadcrumb menu alone.** Rejected as the only way: the sections become invisible until opened. It is kept as a
second way, beside the panel.

## Decision

- **Inside a place, the left panel becomes the place**: its name, then every section with its count, under group
  labels, the current one marked. The page area holds only the chosen section, with no tab row and no place header.
- **The main navigation is one step back, behind ‹**, shown over the panel; dismissing it moves nothing.
- **The breadcrumb's parts open lists** of the places and of the sections.
- **The foot never moves**: Pinned as one row, and the person's menu.
- A section's address is unchanged (`?tool=`).

## What this binds

- A new section of a place is added to the place's section list, with a count, a group and an icon, and appears in the
  panel; nothing draws its own navigation for a place.
- The left panel's top part depends on where the person is; anything that assumes it is always the main navigation is
  wrong inside a place.
- Undoing it means bringing back a tab row or a header on every place's page, and redrawing the panel at every width.

## Consequences

### Positive

- Every section is visible at once, at every width that shows the panel, and the page area is the section alone.
- The person stays in the place they are working in; the rest of hq is one step away.

### Negative

- Going from one place to another is two steps (‹, then the place) instead of one, though the breadcrumb and Pinned
  shorten it.

### Risks

- A place with many more sections would scroll in the panel; group labels are what keep it readable.

## References

adr-0128 (the docked conversation), adr-0096 (a conversation belongs to a place).
