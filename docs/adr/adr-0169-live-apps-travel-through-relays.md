---
created: 2026-11-02
description: Every byte of a live app, and of a branch carried to another site, travels through a relay, never through hq. hq decides and signs single-use tickets; the site checks them itself. A live app has an address of its own, built from a pattern, and is entered by a request from HQ's page for a host-only cookie.
---

# ADR-0169: Live Apps Travel Through Relays

**Date:** 2026-11-02
**Status:** Accepted

## Context

A preview of a running app reached the browser through hq, which proxied every request (adr-0063, adr-0071). Files
already travel through relays (adr-0153). A live app loads many files and holds WebSockets open, and a branch carried
to another site for its live preview is a whole repository. Carried through hq, both would load the control plane with
traffic it never needs to read.

## Options considered

- **hq proxies live apps, as before.** Rejected: heavy traffic on the control plane, and a wider surface for bytes hq
  never reads.
- **Sites accept browsers directly.** Rejected: every site would need a public address and certificates of its own.
- **A domain per organisation, or preview domains on the Public Suffix List.** Rejected: the remaining risk, one
  person's apps reaching each other, is met by the relay's request rules and host-only cookies.
- **Relays carry every byte; hq signs tickets; sites check them (chosen).**

## Decision

1. **hq decides, relays carry, sites hold**, extended from files to live apps and to branches carried between sites.
   hq carries none of those bytes.
2. **A ticket is single use** and names one person, one live preview, one app (or one bundle), and one relay. The site
   checks it on every new stream.
3. **A browser enters a live app by a request sent from HQ's page,** never by a ticket in a link, for a short-lived
   host-only cookie, renewed through HQ.
4. **The relay refuses a request to an app made from any other page,** and a WebSocket opened by any page but the
   app's own, failing closed when the browser's fetch headers are missing. It removes any `Domain=` from the cookies an
   app sets.
5. **A bundle names its content's hash,** which the receiving site checks before using it.
6. **A live app's address is built from a pattern** with an id of at least 128 bits, given once per app and branch.

## What this binds

- Previews leave hq's proxy and host routing (adr-0063 and adr-0071 are revisited by this record).
- Every new kind of byte between a browser and a site, or between sites, goes through a relay on a ticket.

Undoing it puts heavy traffic back on hq, or gives every site a public address.

## Consequences

### Positive

- Heavy traffic never loads hq, and a relay can move to a machine of its own with nothing changed in sites or browsers.
- One path, one set of checks, for files, apps and bundles.

### Negative

- Live previews need a preview domain with certificates, or `localhost`; an install reached only by a bare address has
  none.

### Risks

- **One person's live apps share a registered domain in their browser,** so one app could set cookies for another.
  Accepted, with the relay blocking requests between them.
- **A relay holds app cookies** for their short life. Accepted: bounded by the live preview's sandbox and the cookies'
  scope.

## References

adr-0153 (relays carry every file byte), adr-0154 (a machine carries a site or a relay), adr-0063 and adr-0071
(revisited), adr-0167 (only the organisation's machines).
