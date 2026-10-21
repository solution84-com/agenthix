---
created: 2026-10-14
description: When HQ moves without a domain of its own, it tells each connected site and host service its new address, and each switches only after a mutual challenge–response on the credential hash HQ already stores; the credential never crosses the network.
---

# ADR-0113: A Moved HQ's Sites Follow It by Challenge–Response

**Status:** Accepted

## Context

Sites and host services dial out to HQ's address (adr-0065, adr-0109). When HQ moves to a new address — a new machine,
or onto Agenthix Cloud — without a domain of its own, every connection would strand, and each machine would have to be
connected again by hand. A site that simply switched to whatever address it was told could be pointed at a stranger.

## Options considered

**Connect every site again after a move.** Rejected: what host management exists to remove, and impossible for a
machine nobody can reach.

**Trust the new address because the old HQ announced it.** Rejected: whoever could inject an announcement could take
the site over.

**Present the site's credential to the new address.** Rejected: a stranger's address would receive the credential.

## Decision

**HQ tells each connected site and host service its new address before it stops.** Each keeps both addresses and
switches only once the new HQ passes a **mutual challenge–response keyed on the credential hash HQ already stores**:
the new HQ proves it holds the hash, and the site, or the host service with its machine credential, proves it knows its
credential, so the credential never crosses the network. Until then it keeps trying the old address. An HQ with its own
domain keeps it, and sites reconnect to the same address.

## What this binds

- A site or host service never presents its credential to an address it has not verified.
- HQ keeps only hashes of credentials, so the check works from a restored backup.

Undoing it means reconnecting every machine by hand after a move, or trusting an address on someone's word.

## Consequences

### Positive
- A move keeps the fleet connected; a stranger's address learns nothing and takes nothing over.

### Negative
- A machine offline during the move is pointed at the new address by a command on that machine.

### Risks
- The check proves an address holds HQ's stored hashes; whoever holds a copy of HQ's database holds them too,
  so it guards against an address that is not HQ, not against a stolen copy of HQ's data. HQ's database is guarded
  as the organisation's own (adr-0042) and its backups are sealed (adr-0112).

## References

adr-0044 (credential handling), adr-0065, adr-0109.

> **Acted on.** *(annotated 2026-10-16)* Carried out by the unit of work
> [`2026-10-13-host-management`](../work/2026-10-13-host-management/plan.md), plan 1.6 and 3.17–3.18, merged to `main`
> at its close and verified by the close-out regression and the owner's walkthroughs.
