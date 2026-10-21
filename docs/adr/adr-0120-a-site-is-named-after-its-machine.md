---
created: 2026-10-16
description: A site is always named after the machine that carries it, HQ's own site after HQ's machine; a move or a restore renames it after its new machine, and two machines of one name cannot both carry a site. Supersedes the naming in adr-0108's decision.
---

# ADR-0120: A Site Is Named After Its Machine

**Status:** Accepted

## Context

adr-0108 made a machine carry at most one site, and named the two apart: a site's name defaulted to its machine's
when it connected, was stored on its own from then on, and stayed when the site moved. In use, the Fleet Console then
showed one box doing one job under two names — *office-server · on new-server* after a move — and a failed move once
left the same site listed on two machines. To the people looking after them, a machine and the one site it carries
are one thing.

## Options considered

**Keep the names apart, as adr-0108 decided.** Rejected: two names for one thing, and a name that, after a move, no
longer matches anything on the hardware, in its terminal or in its status.

**Let a fleet admin rename a site freely.** Rejected: a third name to keep in step, with nothing it gives that the
machine's own name does not.

## Decision

**A site is always named after the machine that carries it**, as that machine's host service reports its name; HQ's
own site is named after HQ's machine. **A move or a restore renames the site after its new machine.** Two machines of
one name, compared without letter case, cannot both carry a site: a machine is turned away when it joins under a name
already in the fleet, unless it takes the place of the machine of that name. The name never carries authority:
nothing is found, matched or allowed by it.

## What this binds

- No screen, command or record asks for a site's name; HQ takes it from the machine it knows.
- A site's name in HQ changes when the site moves or is restored, and the record says so.
- adr-0108's other decisions stand: at most one HQ and one site per machine.

## Consequences

### Positive
- One name for one thing, the one people see on the hardware; a move can no longer leave a misleading name behind.

### Negative
- Projects placed on a site show its new name after a move or restore.

### Risks
- Renaming a machine renames its site in HQ at the next install, move or restore that writes its settings.

## References

adr-0108 (its naming superseded), adr-0115, adr-0119.

> **Acted on.** *(annotated 2026-10-16)* Carried out by the unit of work
> [`2026-10-13-host-management`](../work/2026-10-13-host-management/plan.md), its phase 5, merged to `main` at its close
> and verified by the close-out regression and the owner's walkthroughs. The command line's words still lag the screens.
