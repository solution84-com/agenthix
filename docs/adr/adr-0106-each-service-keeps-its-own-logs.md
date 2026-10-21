---
created: 2026-10-11
description: HQ and each Execution Site keep their own structured, rolling logs on their own disk, with secrets removed before a line is written; HQ reads a site's logs over the channel it already has, only when an admin asks, and never copies them into its database. Public health checks answer status only.
---

# ADR-0106: Each Service Keeps Its Own Logs

**Status:** Accepted

## Context

HQ and the site print undated lines to standard output and keep nothing. Reading why something failed needs a
terminal on that machine, which an organisation's admin often does not have for a remote site. The logs and
diagnostics design (the unit *Every screen reviewed*, `spec/diagnostics.md`) gives admins logs, recent errors and a
support bundle in HQ, so where log lines live, and who may read them, needs deciding once for every service.

## Options considered

**Sites send their logs to HQ, which stores them.** Rejected: HQ's database would grow with every site's chatter,
and a site's operational detail would move into the organisation's data store whether or not anyone reads it.

**HQ shows only its own logs; a site's are read on its machine.** Rejected: an admin who cannot reach a site's
machine still cannot see why it fails.

## Decision

**Each service keeps its own logs on its own disk; HQ reads a site's only when an admin asks.**

- A log line carries a date and time, a level, its source and its message. Tokens, keys, passwords and model logins
  are removed **before** the line is written.
- Each service rolls its own file: 7 days or 100 MB, whichever comes first, oldest dropped first.
- HQ reads a site's logs over the HQ–site channel when an admin opens them or builds a support bundle, and never
  stores them. Reading is not authority over the site's machine.
- A public health check (`GET /health`, HQ's and the site's) answers status only. Versions are shown to admins and
  to HQ's own machine (`./agenthix status`).

## What this binds

- A new service, or a new kind of log, follows the same line format, redaction and retention.
- Nothing forwards logs from a site into HQ's database; a central log store, if ever wanted, is a new decision.
- A support bundle is assembled from these logs on request and sent nowhere by the app (adr-0042).

Undoing it means either secrets reachable in log files or admins blind to remote sites.

> **Acted on.** *(annotated 2026-10-12)* Carried out by the unit of work `2026-10-06-every-screen-reviewed`, plan 3.40, merged to `main` on 2026-10-12 and verified by
> the full regression and the owner's walkthroughs.
