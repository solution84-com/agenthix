---
created: 2026-10-15
description: A site's sealed backup carries the credential the site proves itself to HQ with, so restoring it onto a new machine brings back the same site; the credential is renewed at its first connection, and HQ accepts that only while no machine is connected as the site.
---

# ADR-0119: A Site's Backup Carries Its Authority

**Status:** Accepted

## Context

When a site's machine is lost, its backup survives only in the backup location or in an export file, sealed with a
key a person holds. A fleet admin wants a new machine to take the site's place, so the projects placed on it carry on
with their files. Today a site changes machine only in a move, where both machines agree; a lost machine cannot
agree.

## Options considered

**HQ re-attaches the site to a new machine on a fleet admin's word**, while the site has been silent for a waiting
period. Rejected: it gives HQ a new power — pointing a site and its projects' files at a machine of someone's choosing
— which a takeover of HQ could misuse, and the waiting period is a business outage with nothing behind it but time.

**Restore onto a new machine as a new site, and move the projects across by hand.** Rejected: the site's identity and
its projects' placements are lost, and the hand work falls on the organisation at its worst moment.

## Decision

**A site's sealed backup carries the credential the site proves itself to HQ with.** Restoring it on a new machine —
joined to the Host Manager with a one-time code and its fingerprint confirmed, the backup chosen and its key typed on
that machine — brings back the same site, which connects to HQ as itself. **Before the site starts, the new machine's host
service renews its credential, and HQ accepts the renewal only with two proofs** — the site's credential from the
backup, and the machine credential of a machine a fleet admin confirmed for restoring that site (once, within 24
hours) — **and only while neither the site nor the machine it ran on is connected.** The old
credential then stops working, so a machine that comes back is refused, and a stolen backup cannot push out a site
that is running. Before restoring, the person is warned that the site's machine may only be down for a while, that a
restore replaces it, and that anything it did since the backup is lost.

## What this binds

- Whoever holds a site's backup and its key holds the site's authority — no more than the backup already gives, since
  it holds the site's data. The key stays with a person; HQ never sees the backup or the key.
- HQ gains no power to move a site: the authority is the site's own secret, and the fleet admin's confirmation of the
  new machine. A backup taken before a site's last restore can no longer bring it back.

## Consequences

### Positive
- A lost machine's site comes back on a new one as soon as a person is ready, with no waiting period.

### Negative
- Anything the old machine did after its last backup is lost when another machine restores the site.

### Risks
- A backup and its key kept carelessly let someone restore the site while it is down. The warning, the renewal only
  while no machine is connected, and the announcement to every fleet admin and organisation admin bound it.

## References

adr-0107, adr-0115.

> **Acted on.** *(annotated 2026-10-16)* Carried out by the unit of work
> [`2026-10-13-host-management`](../work/2026-10-13-host-management/plan.md), plan phase 4 (a lost site restored onto a
> new machine), merged to `main` at its close and verified by the close-out regression and the owner's walkthroughs.
