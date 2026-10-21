---
created: 2026-08-10
description: How an Execution Site registers with HQ, and how the resulting credential is issued and handled.
---

# ADR-0044: Execution Site Registration Flow

**Status:** Accepted

## Context

Under the platform-wide decision on HQ / Execution Site ownership, recorded outside this repository, an org's **HQ** is the source of truth for its data and an **Execution Site** is the execution layer: the machine that runs agent containers and holds workspace storage. An org may register more than one, and hq and a site may run on separate machines.

For that to mean anything, hq needs a registry — and a new machine needs a way to join it. The design spec describes this as an admin issuing a one-time registration token, an operator supplying it to a new site's setup, and the site exchanging it for a persistent machine credential. It also flags the flow in its Risks section: whoever holds a valid registration token can register a machine into the org, so it needs the scrutiny of any credential-issuance path rather than treatment as routine CRUD.

Two variants had real code in the tree, both inherited from the pre-split world in which a central service linked to a customer's site — `hq/` is the renamed former site app, so it carried the *site side* of that old flow:

1. **Browser approval** — `initiateHqConnect` generated a nonce and opened `<targetHq>/sites/authorize` for a human to approve; the remote hq then called **inbound into** the site at `POST /api/v1/hq/connect` (`hqConnectCallbackHandler`) to deliver the result.
2. **Token upfront** — `redeemHqInvite` took a pasted payload and posted it to the remote hq, receiving a connection token in the same response.

The spec deferred the choice, recording only that `hqConnectCallbackHandler`'s fate depended on it.

## Decision

> ⚠️ **Superseded by adr-0064 — the registration flow only (this opening decision and *Why not browser approval*).** A site now registers with its installer's and an admin's consent, by a device approval started on the machine; the site polls, so the no-inbound rule this section defended still holds. *How the credentials are handled* below still stands and binds the new flow's secrets, and *Placement* is amended by adr-0047 as noted there.

**Registration is token-upfront.** An admin issues a one-time token from hq; the operator supplies it to a fresh site by environment variable or by pasting it into the site's own localhost console; the site posts it to `POST /api/v1/sites/register` along with its stable installation id, and receives a persistent machine credential in the same response.

### Why not browser approval

Not because it is less convenient — because it is incompatible with the architecture. Delivering the credential after a human clicks approve requires hq to open an **inbound** connection to the site. The spec states that a site never accepts inbound connections, no exceptions, and that constraint is the entire reason the transport dials outbound: it is what lets a self-hosted site sit behind NAT or a firewall with no public port.

The consequence is that `hqConnectCallbackHandler` has no role, and it is deleted. `hqProvisionUserHandler` and `hqCreateSessionHandler` go with it: they provision a local shadow `User`/`UserSettings` and mint a Wasp `Session`, and under ADR-0042 a site holds no `User`/`Session`/`Auth` tables to provision into. Their only caller was the pre-split central service, which now lives in a separate, parked repository.

### How the credentials are handled

Both secrets — the one-time registration token and the persistent machine credential — are stored as SHA-256 hashes and shown exactly once, at the moment they are issued.

This deliberately differs from the secrets hq re-displays to an operator on demand, which must remain recoverable. These are issued once and never re-shown, so keeping them recoverable buys nothing and loses a database dump.

Three properties bind anything built on this path, and none of them may be relaxed for convenience:

- **Redemption is single-use under concurrency**, settled by the database rather than by a read followed by a write, and claimed before the site row is created — so a partial failure leaves a spent token rather than a live token and a registered site.
- **Every refusal is identical.** Unknown, expired, already-redeemed and lost-the-race are indistinguishable to the caller. An attacker guessing tokens learns only that the guess failed.
- **Verification is exact and timing-safe.** A digest comparison accepts only a well-formed digest; lenient decoding that tolerates trailing input is a defect, not a convenience.

### Placement

> ⚠️ **Amended by [adr-0047](adr-0047-where-a-run-may-execute.md) — this section only.** The project half stands. **The person half was reversed:** a person is not assigned a site at all. Their `files/` home exists on every site they work on, created when first needed, and the prompt described below was removed along with the field behind it.

A project's workspace is real bytes on one machine's disk, so the machine is part of what a project is. Project creation requires choosing a registered site, and the project records it. A user's personal `files/` was given the same treatment — assigned lazily on their first project-less chat, silently when the org has exactly one site and by prompt when it has several.

## Consequences

### Positive
- A machine can join an org without anyone opening a port on it, which is what makes self-hosting behind NAT work.
- The headless path (`HQ_URL` + `HQ_REGISTRATION_TOKEN` at boot) means a site can be provisioned by configuration management with nobody at a browser.
- The registry makes an audience claim on hq-issued tokens reachable and meaningful; ADR-0040's revision records that decision.
- Deleting the browser-approval flow removed two unauthenticated API endpoints that could provision a user and mint a session — a real surface, not just dead weight.

### Negative
- **A leaked registration token registers a rogue machine into the org, within its lifetime.** This is the spec's own named risk and it is not eliminated, only bounded: the token expires in one hour, works once, is stored hashed, and records which admin issued it. There is no approval step and no out-of-band confirmation. An org that needs those will need a design that this one does not provide.
- **A lost token is unrecoverable** — it is never re-displayed and hq holds only its hash. The admin issues another. This is deliberate, and it is a real inconvenience.
- **Re-registering an existing installation silently rotates its credential.** A rebuilt machine reusing its installation id gets a new credential and keeps its registry row, which is what keeps projects pointing at it from being orphaned — but an operator who registers a machine twice by mistake will have invalidated the first credential without being told.
- **A site's own console is unauthenticated.** *(2026-09-24: resolved by adr-0065 — the site has no operator page, and the localhost binding this relied on was never in place.)* The registration form sits on it, so possession of a valid one-time token is the only credential in play. That is acceptable only because the console binds to localhost and the module holds no identity store; authenticating it against hq-issued tokens is undesigned work.
- **The registration endpoint has no rate limiting.** It is unauthenticated by necessity — a machine registering for the first time has no credential — so it is reachable by anyone who can reach hq. Nothing throttles it. The defence is entropy alone: a token carries 24 random bytes, so guessing one is not a realistic attack, and every failure is indistinguishable so a guesser learns nothing from the responses. That is judged sufficient and the absence is deliberate, but it is the one part of this flow with no defence in depth behind it — a caller can attempt as fast as the server will answer. If hq ever gains general request throttling, this endpoint should be among the first behind it.

### Neutral, worth stating
- No site can report itself connected yet. The machine credential is issued and verifiable, but nothing consumes it until the control channel exists, so `status` carries only `REGISTERED` and `REVOKED`. The registry deliberately says "Registered — not yet connected" rather than implying a connection it cannot observe.

## Follow-on, not decided here
- **Decommissioning a site**, and migrating a user's or project's data off it. Revocation stops a credential authenticating; it does nothing about the workspaces on that machine's disk. The schema uses `Restrict` on the placement relations so a hard delete fails loudly rather than silently blanking which machine holds a project's workspace, but that is a guard, not a migration path.
- **Rotating a machine credential** without re-registering.
- **Whether re-registering an existing installation should require an admin's confirmation** rather than silently rotating, given the negative consequence above.
- **Revoking a site that still holds projects** warns the admin with a count and proceeds. Refusing outright was rejected — an admin must be able to decommission a compromised or dead machine even when work is still placed on it — but nothing yet helps them move that work first.

## References
- [ADR-0047](adr-0047-where-a-run-may-execute.md) — **amends the Placement section above**: a person has no site, and their files home exists per site
- ADR-0040 (this repo) — hq-issued token lifetimes, and its revision deciding the `aud` claim, which this registry made reachable.
- the platform-wide decision on HQ / Execution Site ownership, recorded outside this repository — HQ / Execution Site ownership. **Not this repo's ADR-0042**; see `README.md` in this directory for why 0042 and 0043 are unused here.
