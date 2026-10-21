---
created: 2026-10-14
description: hq-web is built once with a placeholder address and takes HQ's real address when it starts, so its image can be published and shared; changing HQ's address is a restart.
---

# ADR-0111: HQ's Browser App Takes Its Address When It Starts

**Status:** Accepted

## Context

Wasp fixes the browser app's server address at build time, so adr-0068 built hq-web on each machine for that
machine's address and shared no image of it. Host management publishes signed images that every machine pulls
(adr-0117) and moves HQ between addresses; an image built for one address can be neither.

## Options considered

**Keep building hq-web on each machine** (adr-0068). Rejected: no published, signed image of hq-web, and a rebuild on
every address change.

**Leave Wasp.** Rejected again, as adr-0068 found: the cost is the whole app for one setting.

**Serve a configuration file the app fetches at start.** Rejected: Wasp's client reads the address at build, so the
fetched value would not reach it without changing Wasp's generated code.

## Decision

**hq-web is built once, with an unmistakable placeholder that is a valid address** (for example
`https://hq-address.invalid`) as `REACT_APP_API_URL`. Its start script replaces the placeholder with `HQ_URL` in the
built files, refuses to start if `HQ_URL` is missing or malformed or the placeholder is not found, and checks that
none is left. A test builds the image, starts it with an address and checks the app reaches its server. Changing HQ's
address is a restart.

## What this binds

- hq-web's image is the same on every machine; its address is configuration.
- Anything else built into the browser bundle that varies by machine follows the same placeholder-and-check rule.

Undoing it means building hq-web per machine again.

## Consequences

### Positive
- hq-web is published and signed like every other image; moving HQ is a restart, not a rebuild.

### Negative
- A start script rewrites built files; it must fail loudly rather than serve a half-rewritten app.

### Risks
- A Wasp upgrade that changes how the address is embedded would break the replacement; the build test catches it.

## References

Supersedes adr-0068. adr-0067, adr-0117.

> **Acted on.** *(annotated 2026-10-16)* Carried out by the unit of work
> [`2026-10-13-host-management`](../work/2026-10-13-host-management/plan.md), plan 2.10, merged to `main` at its close
> and verified by the close-out regression and the owner's walkthroughs.
