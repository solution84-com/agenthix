---
created: 2026-10-23
description: hq replaces its Agenthix Cloud identity key every 90 days, or when an admin asks, proving the new key with the old one; the client id stays the first key's thumbprint and each key is named by kid.
---

# ADR-0143: hq's Cloud Key Rolls Over Without Approval

**Date:** 2026-10-23
**Status:** Accepted

## Context

adr-0134 gives hq one Ed25519 key for its connection to Agenthix Cloud, made at approval and kept until disconnect.
Once Cloud carries the organisation's model and voice calls, a key that never changes is a long-lived credential on
the path of every call, and replacing it by disconnecting and approving again interrupts the organisation's AI.

## Options considered

- **Keep one key until disconnect.** Simplest; a leaked key stays valid indefinitely. Rejected.
- **Rotate by approving again.** Uses the existing flow, but needs a person at Cloud for every rotation and breaks
  calls meanwhile. Rejected.
- **Roll over automatically, the old key proving the new (chosen).**

## Decision

**hq replaces its Cloud key every 90 days, or at once when an organisation admin asks**, with no person approving it
at Cloud: it signs the new public key's proof with the old key, and Cloud accepts the new key in its place. **The
client id stays the thumbprint of the first key**; each assertion names its key by `kid`. A refusal during a rollover
is a disconnection, and connecting again makes a new identity as before.

## What this binds

Cloud's side must accept a rollover proved by the current key and resolve keys by `kid`. hq's other signed requests
are unchanged. Undoing it returns to keys that live as long as the connection.

## Consequences

### Positive
- No key older than 90 days on the path of every call, and no interruption to rotate one.

### Negative
- The client id no longer equals the current key's thumbprint, so both sides keep the mapping.

## References
adr-0134, adr-0135, adr-0144.
