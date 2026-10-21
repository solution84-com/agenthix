---
created: 2026-10-18
description: On a machine Agenthix Cloud runs, and only there, Cloud's controller may turn remote access to the Fleet Console on — direct, with TLS ending at the Fleet Console, to the addresses it allows, until a time it sets; on an organisation's own machine Cloud still never can.
---

# ADR-0132: Cloud May Turn Remote Access On for a Machine It Runs

**Status:** Accepted

## Context

Host management holds that Cloud can never turn remote access to a Fleet Console on: only the Fleet Console's own
machine can. On a machine Cloud runs for an organisation, the people who need the Fleet Console have no way onto
that machine, and Agenthix is its machine admin.

## Decision

**On a machine enrolled with Cloud, Cloud's controller may turn remote access on, and only there.** The browser
reaches the Fleet Console directly at a name Cloud gives; TLS ends at the Fleet Console with a key made on the
machine that never leaves it; only the addresses Cloud allows (at most 20) are answered; it stops by itself at the
time Cloud set; turning it on is announced in hq to the organisation's admins and fleet admins. Every remote session
still needs a fleet admin's hq sign-in and an authenticator code. **On an organisation's own machine nothing
changes:** Cloud can never turn it on.

## What this binds

- The remote-access operations are refused from anyone but Cloud's pinned controller, on any machine not enrolled
  with Cloud.
- Host management's spec, §7, says this exception.

## Consequences

### Positive
- People in an organisation Cloud hosts can reach their Fleet Console.

### Negative
- One more way in to a machine Cloud runs, bounded by the allow list, the end time and the sign-in with a code.

## References

ADR-0115, ADR-0117.
