---
created: 2026-09-27
description: A preview is served from a host name of its own under a preview domain the install's operator sets, never from hq's own origin; hq identifies its viewer by a one-time ticket exchanged for a cookie bound to that host.
---

# ADR-0071: A Preview Is Served from Its Own Host Name

**Status:** Accepted

## Context

A preview is a web app an agent wrote, running as a dev server inside its run's container on a site,
and relayed to the browser through hq (adr-0063). Its script is not trusted: an agent, or a dependency
it installed, wrote it.

hq's browser app keeps a person's sign-in in the browser's storage for hq's origin and sends it as a
bearer header. Anything served from hq's origin can read that storage and call hq as the person. A
preview served at a path under hq's own address could do exactly that, and a person entitled to a
preview is often an administrator.

A preview also has to know who is viewing it, because only people entitled to its storage boundary may
open it. A browser following a link sends no bearer header, and hq sets no cookie of its own.

Each install has its own hq address, whoever runs it — an organisation on its own machines, or a
provider on theirs — so there is no single domain previews could share across installs.

## Options considered

**A path under hq's own address, served with a sandbox policy** (`Content-Security-Policy: sandbox`
without `allow-same-origin`), which gives the page no origin at all. Rejected: the sandboxed page cannot
be told apart by a cookie on its scripts, data calls or live reload, so only its first load could be
checked; the previewed app loses its own storage, cookies and service workers; and every framework has
to be started with a base path known before the preview's address exists.

**A path under hq's own address with no isolation**, the arrangement before this decision. Rejected: the
preview's script reads the viewer's sign-in and acts as them. It was safe only because every preview
request was refused.

**A separate port on hq's host.** Rejected: browsers share cookies across ports, so it does not isolate,
and it adds a second public port against adr-0067.

**A single shared preview host, with previews told apart by path.** Rejected: every preview would share
one origin, so previews could read one another's storage, and the base-path problem remains.

## Decision

**A preview is served from a host name of its own, under a preview domain the install's operator
sets** — for example `p-<id>.preview.example.com`. Nothing else is served there, and a preview is never
served from hq's own origin.

- **The preview domain is a setting of the install.** It may sit under hq's own domain, or be a second
  domain the operator owns, which also stops the browser sending the first domain's cookies with a
  preview's requests. On a developer's machine, `*.localhost` names need no setting.
- **Where a deployed install sets no preview domain, previews are off** and every preview request is
  refused. The rest of hq is unaffected.
- **hq identifies the viewer — the access check.** A request to a preview host with no valid cookie is
  sent to hq, which checks the person is signed in and entitled to the preview's storage boundary, and
  issues a one-time, short-lived ticket. A person already signed in to hq in that browser is not asked to
  sign in again; they pass through hq and back without seeing it. The preview host exchanges it for a cookie bound to that host alone, and every
  later request — scripts, data calls, live reload — carries it.
- **The preview host strips the viewer's cookie and any authorisation header** before the request is
  relayed to the site.

## What this binds

- **The front door routes `*.<preview domain>` to hq's one port** alongside hq's own host, and hq tells
  its app and a preview apart by host name. adr-0067's one port stands; what it forwards is now chosen by
  host as well as path.
- **A deployment that offers previews needs a wildcard DNS entry and a wildcard certificate** for the
  preview domain.
- **Nothing that belongs to hq's sign-in may be readable from a preview host**, and no preview may be
  served from hq's origin.
- **A preview's access is checked by hq**, against the preview's storage boundary, before a cookie is
  issued.

Undoing it means moving previews back onto a shared origin, which reopens the sign-in exposure; that is
why it is recorded.

## Consequences

### Positive

- A preview cannot read or use the viewer's hq sign-in.
- Every request to a preview, live reload included, is checked against the viewer.
- A stock dev server works unchanged: it runs at its own host's root and needs no base path.
- The preview keeps its own storage and service workers.
- Host-based routing lets preview traffic be carried by something other than hq's own process later —
  a separate relay service, or a direct path to a reachable site — with the same addresses and the same
  access check.

### Negative

- A deployment that wants previews needs a wildcard DNS entry and a wildcard certificate, which usually
  means a DNS-provider challenge at the front door.
- Every byte of a preview still passes through hq (adr-0063), so hq's bandwidth grows with preview use.

### Risks

- The design was proven in Chromium only, over plain HTTP, without a real wildcard certificate. Firefox,
  Safari and HTTPS on a real host name are checked when it is built.
- With the preview domain under hq's own domain, the browser still sends that domain's cookies with a
  preview's requests. That is harmless while hq keeps its sign-in out of cookies; if hq ever moves its
  sign-in into a cookie, the preview domain must become a separate domain.

## References

- adr-0063 — preview traffic crosses on its own transport
- adr-0067 — hq ends at one plain-HTTP port
- adr-0042 — hq is the organisation's own
