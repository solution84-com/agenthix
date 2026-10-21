---
created: 2026-08-11
description: Carrying request/response over the existing control-channel protocol rather than opening a second one.
---

# ADR-0045: Request/Response on the Existing Control-Channel Protocol

**Status:** Accepted

## Context

An Execution Site dials hq and holds one outbound WebSocket open. It never accepts an inbound connection — that is what lets a self-hosted site sit behind NAT or a firewall with no public port. The envelope on that socket — `{ version, type, siteId, payload }` — carried ping, pong, detach and revoke, all fire-and-forget.

That is not enough. hq stores no transcript content, so rendering a session's history means asking the site that owns it and waiting for the answer. The envelope had no way to match an answer to the question that prompted it.

The fork is whether that becomes a second channel — a separate RPC connection, or a request/response protocol beside the existing one — or an extension of the one already open.

## Decision

Extend the existing envelope. It gains two optional fields, `requestId` on a message expecting an answer and `replyTo` on the answer, plus three message types: `channel.request`, `channel.response`, `channel.error`.

Everything rides the one socket the site dialled: dispatch, status, chat relay, and transcript reads. There is no second connection and no second protocol.

Correlation ids are per-connection, not global. Each socket owns its own sequence, so a late answer arriving from a previous connection cannot settle a request on the current one.

## Consequences

### Positive

- One authenticated connection, one liveness mechanism, one reconnect path. A second channel would need its own handshake, its own credential check and its own backoff.
- The chat relay and transcript reads still to be built extend a working mechanism rather than inventing one.
- The site's inbound surface stays exactly zero, which the outbound-only design requires without exception.

### Negative

- **Head-of-line blocking.** WebSocket messages are framed and ordered, so one large response — a long transcript read — delays everything queued behind it on the same socket, including a dispatch that is otherwise urgent. Acceptable while traffic is light; if it bites, the answer is chunking large responses across several frames, not a second connection.
- Every feature riding the channel shares one failure domain: the socket dropping takes all of them at once.

### Risks

- The request/response primitive is symmetric, but only hq → site has a consumer: a site reaching hq has no NAT problem to solve, so it calls hq over ordinary outbound HTTPS instead. A future contributor may read the symmetry as an invitation. hq answers a site's `channel.request` with an explicit `unknown_method` rather than silence, so the refusal is legible at the point of use.

## References

- [ADR-0044](adr-0044-execution-site-registration-flow.md) — Execution Site registration, which issues the credential this channel authenticates
- [ADR-0046](adr-0046-protocol-compatibility-between-hq-and-sites.md) — how the two ends agree on which version of this protocol they speak
