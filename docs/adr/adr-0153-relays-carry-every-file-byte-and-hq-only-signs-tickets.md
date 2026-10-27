---
created: 2026-10-26
description: No byte of a file a person opens or downloads passes through hq-server. hq checks access and signs a short-lived ticket for one file and one person; a relay, a fleet member sites dial out to, carries the bytes; the site verifies the ticket and serves only what it names. There is no fallback through hq.
---

# ADR-0153: Relays Carry Every File Byte, and hq Only Signs Tickets

**Date:** 2026-10-26
**Status:** Accepted

## Context

People must be able to open and download every file an agent produces. When this was decided, hq read each file from
its site over the content channel, held it whole in memory and sent it to the browser as JSON, and served uploads
itself on the files address. An organisation's people and agents work the same hours, and hq already relays every
agent's messages: carrying file bytes as well makes it the bottleneck. Most sites can't be reached from outside — they
listen on nothing (adr-0044, adr-0063) — and a site, which holds every file of its places, is the last machine to
expose.

## Options considered

- **Stream through hq-server.** Rejected: hq carries every byte at the hours it is busiest with agents' messages.
- **A tunnel service per site, or a site's own front door.** Rejected: another vendor and cost, a second concept, and
  a door on the machine holding the files, for no gain over a relay.
- **Copy each opened file to object storage.** Rejected: a second copy of the organisation's files, a wait on first
  open, copies going stale, and it reverses adr-0026.
- **Relays carry, with a fallback through hq when a relay is down.** Rejected: a second byte path to build, secure and
  test, with its own caps and a second input for every renderer, for an outage that is hq's machine's own, since hq's
  relay runs there.
- **Relays carry every byte, and nothing else does (chosen).**

## Decision

1. **A relay carries file bytes between browsers and the sites assigned to it, and decides nothing.** A relay is a
   fleet member. Every site dials out to the relay hq assigns it and keeps a line open, on the content channel's
   stream multiplexer, with the site as the server.
2. **hq decides.** It checks access, chooses the relay and signs a **ticket** — one purpose, one file at one version,
   one person, minutes long — with a private key only it holds. Sites verify with hq's public key, so neither a site
   nor a relay can make one. The ticket travels in the link, so a frame or a download can use it.
3. **The site serves only what a ticket names**, inside the place's storage, at the version the ticket carries.
4. **hq's relay is always there**: in hq's compose set, connected by configuration as hq's site is (adr-0070), reached
   through `hq-web` (adr-0067), answering on the files address (adr-0114). It also serves the uploads hq keeps
   itself, and hq-server serves no bytes at all.
5. **There is no fallback through hq.** When a relay isn't answering, opening a file says so.
6. **A stream is opened for a purpose**, files first. The relay carries streams, not only files, so later traffic of
   other kinds arrives without a new door.
7. **What counts as a file here is a file a person opens or downloads.** A file hq keeps as one of its own records —
   a knowledge page, a place's instruction files — is read and written by hq, as its database rows are: hq checks its
   rules, versions it and serves it to agents, and a person reads it in hq's own screens, never as a file on a ticket.
   Anything such a record embeds is a file, and comes through a relay.

## What this binds

- Any feature that moves the bytes of a file a person opens or downloads to a browser goes through a relay on a
  ticket, never through hq-server. A new kind of record hq keeps in a file is decided against point 7, not added to it
  by default.
- Every ticket is made in one place in hq and verified in one place in core.
- Every read of a file on a site for a browser goes through the ticket-checked reader.
- A new client, such as the mobile app, uses the same tickets and relays.

Undoing it means a second byte path and a second security surface, or hq carrying the organisation's file traffic
again.

## Consequences

### Positive

- hq's load does not grow with the number of files people open.
- Every file byte gets the protection the files address gives: a separate origin, sandbox headers, no session.
- A site still listens on nothing.

### Negative

- A new service, its image and its line from every site.
- Without a files address, only downloads and text work. Nothing is served inline on hq's own address, so PDF preview
  needs a files address.

### Risks

- **A relay sees the bytes it carries**, as a site sees the files it holds. Accepted: both are fleet members, enrolled
  and trusted alike. Blinding the relay would ask more of it than of the site.
- **A ticket in a link can be copied** for its few minutes of life. Accepted in place of revocation, as the files
  address's signed links already are. It names one file and one person, and hq records every ticket it signs.

## Implementation notes

Built by the unit of work [`2026-10-26-seeing-the-work`](../work/2026-10-26-seeing-the-work/plan.md) (2026-10-27): the relay is `relay/`; tickets and passes are signed in `hq/src/relays/relayTokens.ts`, recorded before they leave by `issueFileTicket`, and verified by core's `verifyRelayToken`; the site's ticket-checked reader is `site/src/server/relay/filesServe.ts`; hq's relay runs in hq's compose set with `HQ_RELAY_SECRET` and serves hq's uploads from its storage mounted read-only, and hq-server serves no file. How it fits together: [`files-and-relays.md`](../architecture/files-and-relays.md). Where the build departs from the design:

- **Flow control per stream** was added to the content multiplexer: the relay grants each stream a window and credit as the browser reads, so a slow reader holds back its own stream and never a site's whole line. It came in site protocol 1.8 and relay protocol 1.0.
- **hq's relay dials hq-server directly** on hq's private network for its link; `/relay-link` has no route through hq-web while hq's relay is the only relay. In development, `HQ_RELAY_LINE_URL` gives sites an absolute address for its line, since there is no hq-web to route `/relay-line`.
- **A file with more than one hard link is refused** by the site and by hq's relay, wherever the other link is, rather than only one leading out of the place.
- **A relay's identity is checked only by TLS today**: a site dials only the address hq gave it, with the pass as its credential, and checks no enrolled identity of the relay's beyond that address's certificate. Further relays, which would need one, are not built yet.

## References

- adr-0063 — revisited: bulk traffic to a browser no longer only crosses hq. Its separable relay is now a fleet member.
- adr-0114 — the files address, now served by hq's relay rather than hq-server.
- adr-0026 — the last file route moves off hq.
- adr-0044, adr-0067, adr-0070.
- adr-0154 — a machine outside hq's carries a site or a relay, never both.
