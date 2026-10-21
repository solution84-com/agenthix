---
name: Documentation Structure Design
created: 2026-04-15
description: Design spec for Documentation Structure Design. Front-matter added during the docs/ migration; body unchanged.
---


# Documentation Structure Design

**Date:** 2026-04-15
**Status:** Approved

---

## Problem

The agenthix monorepo held all documentation in a single `docs/` tree covering the entire product (Site, HQ, Mobile) alongside platform-level strategy. With the site extracted into its own repo, we needed a clear model for where different types of documentation live.

---

## Decision

Three repos, three clear responsibilities:

| Repo | Purpose | Owns |
|------|---------|------|
| the product wiki | Product knowledge — the "why" | Roadmap, ADRs, domain docs, vision, glossary, research |
| the site's repository | Site implementation — the "how right now" | Specs, plans, walkthroughs, worklogs, designs, ideas, backlogs |
| HQ's repository (future) | HQ implementation — same pattern | Its own implementation artifacts |

**Rule of thumb:** If it answers *"why does this exist or work this way?"* → wiki. If it answers *"how are we building this right now?"* → the relevant repo.

---

## Wiki Structure — `wiki/`

Follows the platform's Product wiki standard layout. Evergreen — agents read before every session.

```
wiki/
├── INDEX.md            # Wiki home
├── product/            # What it is, who it's for, north star
│   └── INDEX.md
├── concepts/           # Domain model — what things are
│   └── INDEX.md
├── architecture/       # How the system is built
│   └── INDEX.md
├── decisions/          # ADRs — why things are the way they are
│   └── INDEX.md
└── roadmap/            # Direction, launch targets, story so far
    └── INDEX.md
```

Cross-cutting deferred items (product-level backlog) live in `roadmap/ROADMAP.md` under the **Unplanned** section — not in a separate backlog folder.

---

## Site Docs Structure — `site/docs/`

Development cycle artifacts committed alongside the code. Time-bound — created per feature and resolved over time.

```
docs/
├── specs/          # Design specs — YYYY-MM-DD-<topic>-design.md
├── plans/          # Implementation plans — YYYY-MM-DD-<topic>.md
├── walkthroughs/   # QA walkthroughs produced alongside plans
├── worklogs/       # Development history — timestamped narrative entries
├── designs/        # Visual artifacts — mockups, UI flows, diagrams (HTML, images)
├── ideas/          # Site-specific ideas and scratchpad
└── backlogs/       # Known issues and deferred work scoped to the site
```

Specs reference their companion mockups by relative path. They share the same date-prefix naming:
```
docs/specs/2026-04-15-task-detail-design.md  →  docs/designs/2026-04-15-task-detail-mockup.html
```

UI/UX design work flows through design discussion → spec → plan. The `designs/` folder holds the visual artifacts produced during that process.

---

## Backlog Lifecycle

A backlog item has one of two fates:

1. **Promoted to a plan** — the backlog file is deleted; the plan's front matter records the lineage via `closes-backlog`
2. **Dropped** — the backlog file is deleted; git history is the record

There is no `resolved/` subfolder. A backlog is always open items only.

### Backlog ownership

| Backlog type | Home |
|---|---|
| Site-specific | `site/docs/backlogs/` |
| HQ-specific | `hq/docs/backlogs/` (future) |
| Cross-cutting | `wiki/roadmap/ROADMAP.md` — Unplanned section |

---

## Front Matter Conventions

### Backlog item — `docs/backlogs/<topic>.md`

```yaml
---
date: 2026-04-15
topic: websocket-reconnect-on-mobile
priority: high | medium | low
---
```

No date prefix in filename — backlogs are unordered open issues, not chronological artifacts.

### Plan — `docs/plans/YYYY-MM-DD-<topic>.md`

```yaml
---
date: 2026-04-15
topic: fix-websocket-reconnect
---
```

The first section of every plan is **Origin** — a short paragraph explaining where this plan came from. It may reference a backlog issue, a roadmap item, or both. The backlog file is deleted when the plan is created; the origin section is the record.

```markdown
## Origin

Promoted from backlog: WebSocket connections dropped silently after the app returned from
background on mobile — users had to manually reload to resume.

Roadmap: Phase 2 · Agent memory — reliable connections are a prerequisite for persistent sessions.
```

### Spec — `docs/specs/YYYY-MM-DD-<topic>-design.md`

```yaml
---
date: 2026-04-15
topic: task-detail-redesign
status: draft | approved
---
```

---

## Project Wiki

No project wiki for now. The site repo `docs/` handles project artifacts. Agents commit specs and plans directly to the repo alongside code. The project wiki (platform feature: agent workspace docs surfaced through HQ) becomes relevant when HQ exists and cross-boundary visibility is needed.

---

## Migration Path

Monorepo `docs/` splits as follows:

**→ the product wiki** (when wiki migration is ready):
- `docs/artifacts/roadmaps/` → `roadmap/`
- `docs/adr/` + `docs/archive/adr/` → `decisions/`
- `docs/domains/` → `concepts/` and `architecture/`
- `docs/product/` → `product/`
- `docs/glossary.md`, `docs/research/`, `docs/ddr/`

**→ `site/docs/`** (can happen independently):
- `docs/artifacts/specs/` → `docs/specs/`
- `docs/artifacts/plans/` → `docs/plans/`
- `docs/artifacts/walkthroughs/` → `docs/walkthroughs/`
- `docs/archive/worklogs/` → `docs/worklogs/`
- `docs/artifacts/backlogs/` → `docs/backlogs/`
- `docs/artifacts/ideas/` → `docs/ideas/`
- `docs/artifacts/mockups/` → `docs/designs/`

The monorepo remains the source of truth for product docs until the wiki migration is done.
