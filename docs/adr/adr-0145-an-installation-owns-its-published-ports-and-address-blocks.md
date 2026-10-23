---
created: 2026-10-24
description: Each installation — one host service with its own namespace and state folder — records the ports it publishes, chosen by the machine admin, and its own agent address slice, and checks them against everything else on the machine; several installations may share a machine, while one per machine stays what is supported.
---

# ADR-0145: An Installation Owns Its Published Ports and Address Blocks

**Date:** 2026-10-24
**Status:** Accepted

## Context

Every install published the same fixed ports, and every install's agents shared one address block, so a machine could
hold only one. An installed hq's default address was also dev's hq port. Tests that must be real installations (the
install test, the host's container tests, a test hq for the mobile app) could not run beside an installed copy, and
dev could not run beside a default install. The product does not own the machine it runs on: any port may already be
taken by other software. adr-0108 settles what is supported, one hq and one site per machine, but not the mechanism.

## Options considered

- **Fixed published ports, moved out of the way.** Clashes become rarer but a machine still holds one install, and a
  machine whose other software takes the port has no way out. Rejected.
- **One port prefix per installation**, every port derived from it. An installation publishes only two ports; one
  taken port would move a whole hundred, and an http address names its own port. Rejected.
- **Ports taken at random when something starts.** An installed hq's address is what people type and phones store; it
  cannot move between starts. Kept only for test runs that start their own servers. Rejected for installations.
- **One machine-wide authority for every installation's ports and blocks.** A second service to run and keep in step
  with the host services it would coordinate. Rejected: each host service reads the others' labels instead.
- **Each installation records and checks its own (chosen).**

## Decision

**An installation — one host service, its namespace and its state folder — owns what it publishes and the addresses
its agents use.** The ports it publishes are the machine admin's choice at install, from quiet defaults; they are
recorded in the installation's state, carried as labels on its containers, kept across upgrades, and changed only by
a command. Its agents get an address slice of their own, picked free and recorded the same way, and its firewall
rules cover only that slice. Before anything is published, the host service checks every port and block against this
installation's own, other installations' labels and what is held on the machine now, and refuses naming the holder.
So several installations may run on one machine; **what is supported for people stays one hq and one site per
machine (adr-0108)**, and several are for testing. The current numbers are in `docs/architecture/ports.md`.

## What this binds

- No published port or agent block is fixed in code; whatever publishes reads it from the installation.
- Every operation that publishes goes through the one check first; the refusal "another HQ runs here" does not return.
- Every container an installation runs carries its labels, since other installations' checks rely on them.
- Undoing it means a single install per machine again, and tests that refuse beside an installed copy.

## Consequences

### Positive
- Dev, every test and test installations run beside an installed copy.
- A machine whose other software holds a default still installs, on a port its admin chooses.

### Negative
- Two more install options, and a command to change the console's port.
- A label left stale until its container is recreated after a port change.

### Risks
- Two installations installing a site at the same moment could pick the same slice before either is labelled.
  Accepted while several installations per machine are for testing only; it would need a lock if that changed.

## References

adr-0107, adr-0108, adr-0035.

> **Acted on.** *(annotated 2026-10-24)* Carried out by the unit of work
> [`2026-10-23-one-port-plan`](../work/2026-10-23-one-port-plan/plan.md), verified by its full regression and the
> owner's walkthrough.
