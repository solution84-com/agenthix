---
created: 2026-10-18
description: While the image packages are private, a host service pulls them with a read-only registry credential from its start-up settings, kept in a Docker configuration of its own and used only for the pull and the signature check; on staging machines only, and revoked when the packages go public.
---

# ADR-0131: A Machine May Pull Private Images With Registry Credentials

**Status:** Accepted

## Context

A host service runs only published, signed images (ADR-0117) and pulls them with no login, which works only for
public images. Until the first release the image packages stay private, and machines the hosted service starts for
staging must still pull them. The host service image is pulled by the machine's start-up settings, before any sealed
channel to a controller exists.

## Options considered

**Make the packages public now.** Rejected by the owner: the built code stays closed until the first release.

**Send the credential sealed after enrolment.** Not enough: the host service image itself must be pulled first.

**Copy the images to a registry the hosted service controls.** Rejected: more moving parts for a few weeks.

## Decision

**When `AGENTHIX_REGISTRY_USERNAME` and `AGENTHIX_REGISTRY_TOKEN` are set, the host service pulls with them.** It
writes a Docker client configuration of its own, readable by it alone, and uses it for the image pull and for the
signature check. They are never logged, never put in an envelope, and never reach hq, a site or an agent. The
credential is read-only and reaches only the images. **It is for staging machines only**: start-up settings stay
readable on a machine for its lifetime, so a credential there must reach nothing that will not be public. It is
revoked when the packages go public at the first release.

## What this binds

- No other secret goes into start-up settings beyond the enrolment code and this credential.
- The account behind the credential holds read access to the image packages and nothing else.

## Consequences

### Positive
- Staging runs the real images, signed, before they are public.

### Negative
- A credential readable on staging machines for their lifetime; acceptable only because what it reaches will be public.

## Implementation notes

The version baseline (2026-10-21) renamed the two settings to `REGISTRY_USERNAME` and `REGISTRY_TOKEN`, so no setting carries the product's name; the decision is unchanged. First used to install `v0.1.0-alpha.1` from its published images.

## References

ADR-0117.
