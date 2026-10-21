---
created: 2026-08-09
description: An organisation's HQ is its own — one per org, self-hostable, holding that org's data — and site splits into hq and site modules to put that role in the open-source product.
---

# ADR-0042: An org's HQ is its own — `site` splits into `hq` and `site`

**Status:** Accepted
**Deciders:** the maintainers
**Date:** 2026-08-09

## Context

**HQ began as a service we hosted.** To have an HQ, an organisation federated into ours.
Every organisation's projects, agents, sessions and the index over all of it lived in one
central service that we ran.

**That shape makes us the bottleneck, and it does so structurally rather than by accident.**
We become the custodian of every organisation's indexed data. Every org's availability
becomes our availability. Every org's scale becomes our scale. And an organisation that
wants its own data on its own hardware cannot have it at all — the one thing a self-hostable
product exists to offer.

**It also concentrates failure.** One hosted service falling over takes every organisation
with it, and there is no version of that an organisation can insulate itself from.

## Decision

**An organisation's HQ is its own.** One per org, self-hostable, and the single source of
truth for that organisation's data — indices, aggregate views, org orchestration.

**`site` splits into `hq` and `site` modules**, so the HQ role lives in the open-source
product rather than in a service only we can run.

**Execution Sites are the execution layer only.** They host agent containers and hold
Workspaces, and they hold no independent identity store — a site verifies HQ-issued tokens
rather than keeping its own users.

**The small-org case must keep working with zero configuration.** One Site that is also its
own HQ, self-hosted and single-tenant, is the shape most installations will have, and it is
not a degraded mode.

## Why this and not federation

**Inverting the ownership is what makes the open-source product whole rather than a demo.**
A self-hoster runs their own HQ and holds their own data. Nothing about their organisation
has to pass through us, and nothing about our availability constrains theirs.

**What this leaves for a centrally-hosted service is a real question, not a leftover.** Once
an organisation's HQ is its own, anything running centrally has to justify itself on what it
adds — discovery, billing, work that genuinely crosses organisations — rather than on holding
the data. That scope is deliberately not settled here and is not this record's to settle.

## Consequences

- **`hq/` is the former `site/` module, renamed on 2026-08-11** (`c326c9e`), keeping its
  history, schema and code. `site/` was built new alongside it.
- **`site/` has no Wasp `auth:` block** and no `User`/`Session`/`Auth` tables. It verifies
  HQ-issued tokens, pinning its own `siteId` as the audience so a token minted for a sibling
  site is refused.
- **All browser-facing UI belongs to `hq`.** `site`'s only browser surface is a local
  operator console.
- **No failover or election in this iteration.** If the HQ Site is down, the organisation's
  traffic is down. A deliberate v1 simplification, and the reason it is acceptable is that
  the organisation owns the recovery rather than waiting on us.
- ADR-0044, ADR-0045, ADR-0046, ADR-0049, ADR-0050 and ADR-0051 all build on this topology.

> **Acted on, and one consequence that no longer holds.** *(annotated 2026-09-26)* The split this
> record decides was carried out by the unit of work `2026-08-14-hq-site-split` (the renamed `hq`, the
> new `site`, and the runtime moved onto the Execution Site, merged 2026-08-18) and finished by its
> successor `2026-09-15-hq-site-split-close-out`, which put hq and a site on separate machines with
> their own images, moved hq's reading and writing of a site's disk onto the control channel and ended hq's starting of
> containers, and kept a site free of any independent identity. **The third consequence above is no longer true:** `site` has no browser surface at all,
> not even a local operator console — [ADR-0065](adr-0065-a-site-serves-no-web-page.md) removed it. The
> decision itself is unchanged.

## On this record's number

**`adr-0042` was allocated in this codebase, before the line was split.** It was written in
the pre-split monorepo and moved out on 2026-08-09 to the repository that holds decisions
about the product line as a whole, which is why this register skips from `adr-0041` to
`adr-0044`.

**This restores the number to the register it was allocated in, for the half of the decision
that binds this codebase** — what HQ is, what a Site is, and how they divide. The other half
— how many repositories the product line has and which is which — binds more than this
codebase and is recorded where decisions of that scope belong. A reader here needs the first
half and is not missing anything by not having the second.
