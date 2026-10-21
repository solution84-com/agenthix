---
created: 2026-08-11
description: The lifetimes and renewal rules for every token HQ issues.
---

# HQ-Issued Token Lifetimes

**Status:** Accepted

## Context

Under the platform-wide decision on HQ / Execution Site ownership, recorded outside this repository, an org's **HQ** is the source of truth for its data and an **Execution Site** is the execution layer only, holding no independent identity store. A site therefore cannot authenticate anyone itself: hq signs short-lived tokens, and the site verifies them **locally** against hq's published public key, with no per-request round trip to hq.

Two sibling tokens exist, deliberately not merged into one because they have different lifetimes and different minting triggers:

- an **identity token**, minted once when a user logs into hq, proving who the user is;
- a **capability**, minted per agent run, carrying what that specific run is authorized to touch — user, agent, project, workspace, task, and the pre-resolved effective tool permissions plus the workspace access policy (§2a, §2b).

Local verification has one unavoidable consequence, accepted in the spec: **revocation only takes effect when a token expires.** Removing a user from the org does not invalidate a token already in a site's hands. The lifetime is therefore a direct trade-off — short enough to bound that window, long enough to avoid pointless re-auth traffic. The spec left this as "a tuning parameter for a later pass" and named the later pass; this is it.

A second consequence surfaced while designing §2b: because the workspace access policy rides *inside* the capability, the capability's lifetime also bounds how long a **policy change** takes to reach a session that is already running.

## Decision

| | Lifetime | Renewal |
|---|---|---|
| Identity token | **60 minutes** | Re-minted from the user's live hq session, transparently |
| Capability | **15 minutes** | Proactively renewed at **80% of TTL** (12 minutes) |

The three values live in `core/src/protocol/capability.ts` (`IDENTITY_TOKEN_TTL_SECONDS`, `CAPABILITY_TTL_SECONDS`, `CAPABILITY_RENEWAL_FRACTION`) as the single source of truth, shared by both apps. They are pinned by a test so a change is deliberate rather than incidental.

**Capabilities are minted per run**, not per session — stricter than the spec's "per dispatch or per interactive session start". A new run always mints fresh, so renewal is only needed by a single long-running run (voice, a long task), which is exactly what the renewal path covers.

**Renewal failure honours the existing capability.** If hq is unreachable at renewal time, the current capability keeps being honoured until it actually expires, while renewal retries in the background. An outage longer than the remaining lifetime degrades into the "hq is down" mode §6 already describes — it is not a new failure path, and in particular the runtime must not drop or invalidate a still-valid capability early.

### Why these numbers

**60 minutes for identity** bounds the revocation window for a removed user to at most an hour while costing nothing in user experience: the browser holds a live Wasp session, so re-minting is invisible.

**15 minutes for capability** was chosen against three pressures at once:
- Typical runs finish in minutes, so the overwhelming majority never renew at all.
- A workspace access policy change reaches an already-running session within one TTL, and every *new* run picks it up immediately. Fifteen minutes is a defensible upper bound on "I blocked this workspace, when does it take effect."
- The accepted "hq down mid-run" tolerance becomes 15 minutes past the last successful renewal. Longer TTLs buy more outage tolerance but weaken both of the above.

Renewal at 80% leaves a full retry window (retries run every 60 seconds) before expiry, so a brief hq blip costs nothing.

## Consequences

### Positive
- Revocation is bounded and stated, rather than unbounded and implicit.
- Policy changes propagate without any live permission check during a run — the property §2a exists to protect.
- Both apps read the same constants, so the two sides cannot drift.

### Negative
- A user removed from the org may retain access for up to an hour. Immediate revocation would require exactly the per-request round trip to hq that this design exists to avoid. If it is ever needed, it should be added as a targeted revocation list, not by shortening the TTL toward zero.
- A very long-running task will stall if hq is unreachable for longer than a capability's remaining lifetime. Accepted, and unchanged from the spec.
- Renewal traffic is one call per active long-running run per ~12 minutes. Negligible at any realistic scale.

### Follow-on, not decided here
- **Key rotation.** Tokens carry a `kid` (an RFC 7638 thumbprint) and the site's verifier uses a remote key set that refetches on an unknown `kid`, so rotation is *possible* — but no rotation flow exists, and hq's key-provisioning path deliberately refuses to overwrite a live key.

## Revision — 2026-08-11: the `aud` claim, decided

The follow-on this ADR named is now settled, as part of the Execution Site
registry, because a registry is exactly the point at which an org can hold more
than one site.

**Both token types carry `aud`, set to the stable `siteId` of the Execution Site
they were minted for, and a site pins its own on every verification.** A token
minted for one site is refused by another.

The target is resolved from where the work's storage lives: a project-scoped run
uses the project's Execution Site, a project-less chat the user's home site, and
— while the execution runtime still lives on hq — hq's own installation id as
the fallback.

Leaving tokens audience-free, so any site accepts any of them, would make one
compromised or malicious site able to replay every token it sees against its
siblings. That is a poor trade for a claim that costs one line at mint time.
