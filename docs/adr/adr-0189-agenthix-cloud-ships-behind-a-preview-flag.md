---
created: 2026-11-14
description: Every part of the product that offers or uses Agenthix Cloud is behind one flag, `cloud`, at preview, so a released build shows no Cloud until a release moves the flag. Supersedes ADR-0130.
---

# ADR-0189: Agenthix Cloud Ships Behind a Preview Flag

**Date:** 2026-11-14
**Status:** Accepted

## Context

ADR-0130 removed the flag that held back all of Agenthix Cloud and let every Cloud feature ship, each gated only by
its own condition (the machine enrolled, hq connected, the person's account linked). Under it, a released build would
name and offer Cloud's parts — connecting HQ to Cloud, Cloud's models and voice, signing in with an Agenthix account —
in every installation, whether or not anyone could use them from there.

## Options considered

- **Keep ADR-0130 and word each Cloud place as not available.** Rejected: the product would still name and describe
  Cloud in every release.
- **A flag at beta.** Rejected: every organisation's admin would see Cloud listed on the *Features* screen.
- **One flag, `cloud`, at preview** (ADR-0172: built, waiting on something outside it). Chosen.

## Decision

**Every part of the product that offers or uses Agenthix Cloud is behind one flag, `cloud`, at preview**: in hq, the
site, the host service and its command line, the Fleet Console and its screens. In a released build it is off and
cannot be switched on, so nothing names, offers or calls Cloud; in development it is on, and its tests block like any
other. The conditions of ADR-0130 still gate each Cloud feature inside the flag. `usageBilling` stays a flag of its
own. The flag moves forward only in a release.

## What this binds

- Every Cloud entry point checks `cloud` first, as `docs/architecture/feature-flags.md` says, with a test per entry
  point that it is hidden while off.
- The user guide leaves Cloud out while the flag is off.

## Consequences

### Positive

- A release shows no Cloud while the flag is off, and turning it on is a release decision in one place.

### Negative

- Cloud's own staging cannot use Cloud on a published build while the flag is off there; it tests on development
  builds.

## References

ADR-0130 (superseded), ADR-0172.
