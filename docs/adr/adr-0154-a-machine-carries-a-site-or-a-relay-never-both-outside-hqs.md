---
created: 2026-10-26
description: Outside hq's machine, a fleet machine carries a site or a relay, never both; hq's machine carries hq, hq's site and hq's relay behind hq's one door. More relay capacity is a relay on another machine near the sites it serves.
---

# ADR-0154: A Machine Carries a Site or a Relay, Never Both, Outside hq's

**Date:** 2026-10-26
**Status:** Accepted

## Context

Relays carry every file byte (adr-0153). A relay needs a public front door; a site must never have one, because it
holds every file of its places and runs agents. adr-0108 already limited a machine to one hq and one site. With
relays, an organisation needing more file capacity has to put the next relay somewhere.

## Options considered

- **Let a site's machine run a relay beside it.** Rejected: it opens a door on the machine holding the files, and buys
  almost no speed. The bytes leave the site's network once either way, and distance is what costs time.
- **Any mix, chosen per machine.** Rejected: the same exposure, plus a choice every admin must reason about.
- **A site or a relay, never both, outside hq's machine (chosen).**

## Decision

**Outside hq's machine, a machine carries a site or a relay, never both.** hq's machine carries hq, hq's site and
hq's relay, behind the one door hq already has. When hq's relay isn't enough, an organisation adds a relay on another
machine, near the sites it will serve. Adding a machine asks whether it is a site or a relay, with no option for both.

## What this binds

- The host service, the Fleet Console and the install treat site and relay as exclusive roles of a machine other than
  hq's.
- Only a relay machine is asked for a public address.

Undoing it means a door on machines that hold files, and every placement and enrolment path handling both roles at
once.

## Consequences

### Positive

- No machine that holds files has a door, except hq's, which already has one.
- One rule for admins: capacity is a relay near the sites.

### Negative

- More capacity takes another machine.

## Implementation notes

Built in part by the unit of work [`2026-10-26-seeing-the-work`](../work/2026-10-26-seeing-the-work/plan.md) (2026-10-27): hq's machine carries hq's relay in hq's compose set, behind hq-web, beside hq and hq's site (`host/src/compose/projects.ts`). Adding a machine as a relay, and so the choice between a site and a relay, is not built yet; today no machine but hq's carries a relay. How it fits together: [`files-and-relays.md`](../architecture/files-and-relays.md#hqs-relay).

## References

- adr-0108 — extended: a machine carries at most one hq, one site and one relay, and outside hq's machine not a site
  and a relay together.
- adr-0153 — relays carry every file byte.
- adr-0115 — a site takes part when a fleet admin adds it. A relay is added the same way.
