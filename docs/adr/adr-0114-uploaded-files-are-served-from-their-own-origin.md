---
created: 2026-10-14
description: Files people upload are served from an origin of their own by short-lived signed links, so HQ's own address never serves arbitrary content; without a subdomain for files, HQ serves them only as downloads.
---

# ADR-0114: Uploaded Files Are Served From Their Own Origin

**Status:** Accepted

## Context

People upload task attachments and images to HQ. Content anyone can upload, served from the same origin as HQ's app,
runs with that origin's trust in a browser. Previews already have a host name of their own for the same reason
(adr-0071).

## Options considered

**Serve uploads from HQ's origin with strict content types and download headers.** Rejected as the only guard: one
wrong type or a browser's sniffing turns an upload into active content on HQ's origin.

**A wildcard host name per file.** Rejected: a certificate and DNS burden every self-hosted organisation would carry.

## Decision

**Uploaded files are served from an origin of their own, `FILES_ORIGIN`**, reached by short-lived signed links that HQ
makes for one file and one person; the files origin shares no session or cookie with HQ. Where HQ has no subdomain for
files — a bare address — HQ serves uploads only as downloads, and its settings page says so.

## What this binds

- Nothing on HQ's own origin serves an uploaded file inline.
- A new kind of upload is served through the files origin's signed links.
- The front door and the deployment guide carry the files origin beside HQ's.

Undoing it means arbitrary content on HQ's origin.

## Consequences

### Positive
- An uploaded file cannot act with HQ's trust in a browser.

### Negative
- A second host name for a self-hosted organisation to point at its machine.

### Risks
- A bare-address install shows downloads only, which is less convenient; said on screen.

## References

adr-0067, adr-0071.

> **Acted on.** *(annotated 2026-10-16)* Carried out by the unit of work
> [`2026-10-13-host-management`](../work/2026-10-13-host-management/plan.md), plan 2.28–2.29, merged to `main` at its
> close and verified by the close-out regression and the owner's walkthroughs.
