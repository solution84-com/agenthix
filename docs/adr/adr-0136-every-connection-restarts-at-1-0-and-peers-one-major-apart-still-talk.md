---
created: 2026-10-21
description: Every connection between separately installed parts restarts its protocol version at 1.0; two sides talk while their majors are at most one apart, the newer speaking the older's major; two or more apart is refused, naming the side to upgrade; a deprecation names the version it stops working in, and nothing is removed without one.
---

# ADR-0136: Every Connection Restarts at 1.0, and Peers One Major Apart Still Talk

**Date:** 2026-10-21
**Status:** Accepted

## Context

Several connections join parts of the platform that are installed and upgraded separately: hq and an Execution
Site; the Fleet Console or Agenthix Cloud and a host service; hq and the mobile app; hq and Agenthix Cloud. A
self-hosted hq, a site on another machine and a phone from an app store are each upgraded in their owner's own time,
so peers on different versions are the normal case.

ADR-0046 versioned only the first of these. Under it the site protocol reached 17.13, and grew 31 minimum-version
checks for older sites, though no site anywhere ran one. The mobile app and Cloud exchanged no version with hq at
all, so when hq removed something the mobile app used, the app failed without saying why. And ADR-0046 refused any
peer on another major, so every breaking change would have cut off every peer that had not yet upgraded.

Nothing outside the team has installed a release, so the history behind those numbers serves no one, and a version
added to a connection after people depend on it would itself be a breaking change.

## Options considered

- **Keep ADR-0046 and its numbering.** The numbers carry no information anyone uses, the checks for older sites
  guard code no peer runs, and two connections would still have no version. Rejected.
- **Refuse any difference of major (ADR-0046's rule).** Simple, but a breaking change then forces every peer to
  upgrade at the same moment, which a self-hoster or a phone cannot be made to do. Rejected.
- **Support every older major for ever.** No peer is ever cut off, but the code for old majors only grows, and
  nothing ever says when something stops working. Rejected.
- **A list of capabilities, negotiated per feature, instead of a version.** Each feature then needs its own check
  on each side; the 31 minimum-version checks were that approach arrived at by accident. Rejected.
- **One major of overlap (chosen).** A peer has a whole major in which to upgrade, the code kept for older peers is
  bounded to one major, and the version at which a thing stops working is known when it is deprecated.

## Decision

- **Every versioned connection's protocol restarts at `1.0`**, named after the party hq or the host service talks
  to: the site, host, client and Cloud protocols. Each moves on its own, and none is the product's release version.
- **A minor version adds; a major version breaks.** Two sides talk while their majors are **at most one apart**,
  the newer side speaking the older side's major. Two or more apart is **refused**, with a message naming both
  versions and the side that must upgrade. Each connection decides this by the one function in core,
  `checkProtocolCompatibility`, never by comparing versions itself.
- **A thing is removed only after it was deprecated** for at least one minor. Its mark names the version it was
  deprecated in, the version it **stops working in** (two majors on, `.0`) and what replaces it:
  `@deprecated since 1.4; stops working in 3.0. Use x instead.` It leaves the current major's code at the next
  major, kept only for peers one major behind, and is deleted at the second.
- **Each connection's shape is snapshotted in core**, and a test classifies every difference from the committed
  snapshot: an addition needs the minor to move, a break the major, and a removal a mark before it.

## What this binds

- Every new connection between separately installed parts carries a version under this rule, through the same
  function.
- A change to anything another part receives is checked against the snapshot; a breaking change cannot be made
  without moving the major, and nothing can be removed without a mark first.
- At the first major change of a connection, the code for its previous major is written, kept apart from the current
  code, with a test that runs it.
- Undoing this means choosing another rule for four connections and the snapshot test at once, after peers depend on
  it.

## Consequences

### Positive

- A peer one major behind keeps working, so a breaking change no longer forces everyone to upgrade at once.
- When a thing stops working is written where every developer sees it, and checked.
- A refusal says which side to upgrade, instead of a connection that half-works.

### Negative

- Each major change carries the previous major's code for a whole major.
- A peer two majors behind is refused and no longer supported, however small the difference it would actually meet.

### Risks

- The snapshot holds only what core declares. A shape a connection uses but core does not declare is not protected,
  so every connection's messages must be declared there.

## Implementation notes

Implemented by the version baseline (2026-10-21) and released in `v0.1.0-alpha.1`: `checkProtocolCompatibility` in `core/src/protocol/compatibility.ts`; the site, host, client and Cloud protocols at 1.0 with their refusal shapes; every connection's shape snapshotted in `core/snapshot/`, with a test that says what the version must become and refuses a removal without a prior deprecation mark. [`versioning.md`](../architecture/versioning.md) describes it as built.

## References

- Supersedes adr-0046.
- adr-0045, the request and response shape of the site's channels.
- adr-0117, the signed images every part is installed from.
- adr-0134, how hq connects to Agenthix Cloud.
- The rule as it stands, and how to move a version: [`docs/architecture/versioning.md`](../architecture/versioning.md).
