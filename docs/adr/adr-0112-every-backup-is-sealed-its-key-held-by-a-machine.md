---
created: 2026-10-14
description: Every site is backed up nightly on its own machine, always sealed; the key is held by that machine's host service, or by the person who set a backup location or made an export. A backup location is a folder set only on the machine.
---

# ADR-0112: Every Backup Is Sealed, Its Key Held by a Machine

**Status:** Accepted

## Context

Today backups are `pg_dump` and `tar` commands run by hand, unsealed, and HQ's secrets are unreadable after a restore
without `SECRETS_MASTER_KEY`. Backups hold the organisation's people, projects, secrets and workspaces, and copies
leave the machine — to a folder, an export, another machine during a move.

## Options considered

**Unsealed backups, protected by where they are kept.** Rejected: a copy on a NAS, a synced drive or a downloaded
export would be readable by anyone who reaches it.

**One backup of the whole fleet.** Rejected: machines fail apart, and a combined backup would need every machine
answering at once.

**A backup location changeable from the Host Manager.** Rejected: a stolen session or a takeover of HQ could then send
copies somewhere of its choosing.

## Decision

**Every site is backed up nightly by its machine's host service, each machine on its own, and every backup is
sealed.** HQ's site's backup holds HQ too. The key of a nightly backup is held by that machine's host service; a copy in
a **backup location** — a folder the machine can write to, **set and changed only on the machine itself** — is sealed
to a key shown once to whoever set it; an export is sealed to a key made for it. Agenthix Cloud backs up the machines
it runs; it is not a backup location for a self-hosted organisation.

## What this binds

- Nothing writes an unsealed backup or export.
- The backup location is set only through the machine's own command line.
- A restore checks the key before it changes anything, and backs up the current state first.

Undoing it means readable copies of the organisation's data wherever they land.

## Consequences

### Positive
- A copy that leaves the machine is useless to whoever finds it without its key.

### Negative
- A lost key is a lost copy; the screens say so plainly.

### Risks
- Backups on the same machine die with it until a backup location is set; the machine's page says when the last
  export is old.

## References

adr-0042, adr-0107, adr-0108.

> **Acted on.** *(annotated 2026-10-16)* Carried out by the unit of work
> [`2026-10-13-host-management`](../work/2026-10-13-host-management/plan.md), plan 2.15–2.19 and 4.11, merged to `main`
> at its close and verified by the close-out regression and the owner's walkthroughs. A site moved away still leaves its
> backups in the old machine's folder.
