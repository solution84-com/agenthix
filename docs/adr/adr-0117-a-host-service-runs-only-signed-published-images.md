---
created: 2026-10-14
description: HQ, the site, the agent image, the host service and the Host Manager are published as versioned images, signed when published; a host service verifies each image's signature before it runs it and refuses an unsigned or wrongly signed one.
---

# ADR-0117: A Host Service Runs Only Signed, Published Images

**Status:** Accepted

## Context

Every machine today clones this repository and builds its images, so a machine's software is whatever its clone held,
and nothing reports a real version. The host service runs HQ and sites on every machine with the Docker socket
(adr-0107); what it runs must be what was released.

## Options considered

**Build on each machine from a clone.** Rejected: a clone and a build on every machine, no version to report, and
nothing to verify.

**Publish images but trust the registry.** Rejected: a compromised registry account or a substituted tag would run on
every machine that pulled it.

## Decision

**HQ's server and browser app, the site, the agent image, the host service and the Host Manager are published as
images labelled with their versions, signed when published, and verified by the host service before it runs one**; an
unsigned or wrongly signed image is refused. Images are still built with only Docker (adr-0069).

## What this binds

- The publishing workflow signs every image it pushes; nothing is pushed unsigned.
- A host service runs no image it has not verified.
- Each image carries its version, and status reports it.

Undoing it means machines running whatever reached them.

## Consequences

### Positive
- Every machine runs exactly what was released, and says which version.

### Negative
- Signing keys or identities to keep, and a verification step on every pull.

### Risks
- A stolen signing identity signs malicious images; the signing identity is tied to the repository's publishing
  workflow.

## References

adr-0069, adr-0107, adr-0111.

> **Acted on.** *(annotated 2026-10-16)* Carried out by the unit of work
> [`2026-10-13-host-management`](../work/2026-10-13-host-management/plan.md), plan 2.8–2.9, merged to `main` at its
> close and verified by the close-out regression and the owner's walkthroughs. Nothing has been published yet: signing,
> and the host service's check of a real signature, are first tested end to end at the first publish.

> **Amended.** *(2026-10-24, by adr-0146)* An image no longer carries its version as a label. Each published image's
> **index** carries its version as an annotation, and its signature names that version's tag; the host service gives
> each container its version, its own taken from the image reference it was started by and checked against that
> version's signature. The tag signs only images whose build attestation it verified. The decision above, that a host
> service runs only signed, published images, is unchanged.
