---
created: 2026-10-23
description: Managing the organisation happens in a separate area of HQ, /admin, for organisation admins only, with its own frame and checked on screen and on the server; the organisation's page stays every member's.
---

# ADR-0142: The Organisation's Admin Area Is Separate From Its Page

**Date:** 2026-10-23
**Status:** Accepted

## Context

The organisation's page mixed what every member reads (its identity, its workplace) with what only admins change
(people, agents' settings, models, billing, infrastructure). It grew cramped as each feature added a section, and a
member saw controls they could not use.

## Options considered

- **Keep admin sections on the organisation's page, hidden from members.** No new frame, but the page keeps growing
  and every section checks the role on its own. Rejected.
- **Spread admin settings into each feature's own pages.** Close to what they govern, but there is no one place an
  admin goes, and every feature carries its own guard. Rejected.
- **A separate admin area (chosen).**

## Decision

**Managing the organisation happens at `/admin`**, for organisation admins only, in its own frame: its own menu, a
way back to the organisation, and no docked conversation. **It is protected twice**: every page checks the role
before drawing and tells anyone else who to ask, and every operation behind it refuses anyone but an organisation
admin. The organisation's page stays every member's. Admins reach the area from the account menu and from the
organisation's page.

## What this binds

A feature's organisation-wide settings go in the admin area, behind both checks, not on member-facing pages. Undoing
it means moving every admin page back and repeating its guard in place.

## Consequences

### Positive
- Room for each setting, and one place for an admin to look.

### Negative
- Two frames in HQ's shell to keep consistent.

## References
adr-0110, adr-0138, adr-0141.
