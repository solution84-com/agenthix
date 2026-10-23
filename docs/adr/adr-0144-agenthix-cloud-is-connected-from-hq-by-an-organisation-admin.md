---
created: 2026-10-23
description: An organisation admin connects HQ to Agenthix Cloud from HQ itself, in setup or the admin area; the Fleet Console only shows the connection.
---

# ADR-0144: Agenthix Cloud Is Connected From HQ by an Organisation Admin

**Date:** 2026-10-23
**Status:** Accepted

## Context

adr-0134 put connecting and disconnecting Cloud in the Fleet Console, for a fleet admin who is also an organisation
admin. Once Cloud is a provider of the organisation's models and voice, connecting it is a choice about the
organisation's AI, made in setup and on the providers page, by people who may not be fleet admins.

## Options considered

- **Keep it in the Fleet Console.** The fleet admin, whose job is machines, then decides the organisation's AI, and
  setup has to send its admin to another tool. Rejected.
- **Allow it in both.** Two places to explain and keep in step. Rejected.
- **Connect from HQ (chosen).**

## Decision

**An organisation admin connects HQ to Agenthix Cloud from HQ**, in setup and in the admin area, by the same device
approval and signed tokens as adr-0134. Connecting adds Cloud as a provider; disconnecting marks it disconnected.
**The Fleet Console only shows the connection** and says where it is made. adr-0135, Cloud connecting an HQ it runs,
is unchanged.

## What this binds

Every screen and command that connects or disconnects Cloud is HQ's and checks for an organisation admin. Undoing it
moves the flow back to the Fleet Console.

## Consequences

### Positive
- One place, with the people who choose the organisation's AI.

### Negative
- A fleet admin who is not an organisation admin can no longer connect Cloud.

## References
Supersedes adr-0134-s-1. adr-0135, adr-0138, adr-0143.
