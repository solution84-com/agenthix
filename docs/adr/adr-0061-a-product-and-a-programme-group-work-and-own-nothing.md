---
created: 2026-09-16
description: A product and a programme group projects for reporting and own no storage, no members and no runs, so a person and a project are the only owners.
---

# ADR-0061: A Product and a Programme Group Work and Own Nothing

**Status:** Accepted

## Context

Four kinds of thing own storage: a person, a project, a product and a programme. Products and
programmes acquired it before workspaces existed, when grouping repositories that belonged together
meant giving the grouping a files home of its own. A project with workspaces now does that job.

Each additional owner kind costs more than it looks. It is another thing a run can be placed against,
another set of access rules, another membership model, and another path through every check. The
product-level content this was supposed to enable was never built: the helper returning a product's
directory has no callers and keys on a slug rather than an id, against the rule every other path
follows.

## Options considered

- **Keep all four as owners and give each a membership model.** Rejected: it multiplies the rules for
  a capability nothing uses, and every check has to handle four cases for the life of the system.
- **Keep product storage, drop programme storage.** Rejected: the same question with a smaller
  number, and it leaves the awkward case — a product's files — exactly where it is.
- **Remove products and programmes entirely.** Rejected: grouping is genuinely useful for reporting
  and for navigating an org's work; it is only ownership that it does not need.

## Decision

**A person and a project own storage, carry authority and are what a run is bound to.**

**A product and a programme group projects, for reports and lookups.** They own no files, no
workspaces, no members and no runs. Filing a project under one grants nobody anything, and a grouping
is never consulted by an access check.

Filing a project under a product or a programme is an org-level act, taken at a role floor.

## What this binds

Storage, placement, access checks and membership handle two owner kinds, not four. Any workspace
owned by a product or a programme moves under a project. Reporting may read groupings freely, because
nothing about them is load-bearing for access.

Undoing it means reintroducing storage and an access model for grouping constructs, and re-answering
what it would mean to run against a product.

## Consequences

### Positive

- One rule covers ownership, and every check has two cases rather than four.
- A grouping can be reorganised at will, because nothing's access depends on it.

### Negative

- Anything genuinely product-level — content spanning several projects — must live in one of them, or
  wait for a decision that gives it a home.

### Risks

- **Reorganising groupings is now free, which invites churn** in reports built on them. Accepted:
  cheap reorganisation is the point, and a report is easier to correct than an access boundary.

## References

- [ADR-0062](adr-0062-people-are-members-agents-are-assigned.md) — who belongs to a project, now that
  only projects have members
- [ADR-0060](adr-0060-authority-comes-from-the-boundary.md) — what a boundary confers
- [ADR-0039](adr-0039-files-and-workspaces.md) — the storage model this narrows
- `docs/work/2026-09-15-hq-site-split-close-out/spec.md` §6.4 — the design this is cut from
