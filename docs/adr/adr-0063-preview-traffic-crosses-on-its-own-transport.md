---
created: 2026-09-16
description: A preview runs on the site and reaches the browser through hq over a transport of its own, because opaque traffic cannot travel on a channel whose safety comes from being typed.
---

# ADR-0063: Preview Traffic Crosses on Its Own Transport

**Status:** Accepted

## Context

A preview serves a person's browser from a development server running against work in progress. hq
runs that container today and proxies the browser to it, which works only because hq and the site
share a machine.

Once they are apart, the files are on the site, so the server must run there. But a site accepts no
inbound connections — the property that lets it sit behind a firewall with no public port — so the
browser cannot reach it directly.

Chat already crosses this gap: a run's output leaves the site on the connection the site opened, and
hq re-emits it to the browser. The difference is that hq validates every frame against a known
vocabulary before it reaches a browser, and that check is what makes relaying safe.
[ADR-0051](adr-0051-live-site-data-crosses-as-typed-events-not-a-generic-relay.md) admits typed events
and refuses a generic relay for exactly that reason. A preview is opaque bytes, and no such check is
possible.

## Options considered

- **Put preview traffic on the control channel.** Rejected: it is precisely the generic relay
  ADR-0051 refuses, and the channel's timeout and text frames suit small typed events rather than a
  continuous stream.
- **Let the browser reach the site directly, always.** Rejected as the default: every site would need
  a reachable address and a certificate, and a site holds everyone's files and authenticates no
  browser of its own.
- **Offer preview only where hq and a site share a machine.** Rejected: the feature would disappear
  for exactly the deployments this architecture exists to enable.

## Decision

**A preview runs on the site, as a process inside the boundary's own container**, so it serves what
the run sees without a second container or a second mount.

**The browser reaches it through hq, over a second outbound connection the site opens** — a transport
of its own, separate from the control channel, so that opaque traffic never travels on the channel
whose guarantee depends on being typed.

**The relay is a separable component**, so it can be given its own process or machine without the
site or this decision changing.

**A direct path is available per site, opt-in and off by default**, for an operator who has measured a
bottleneck and can expose that site.

## What this binds

hq starts no containers. An active preview holds its container against idle teardown. The control
channel keeps its typed-events-only rule intact rather than gaining an exception. Anything else
wanting to move bulk traffic between hq and a site uses this transport rather than widening the
control channel.

Undoing the separate transport means either relaying opaque bytes on the control channel or requiring
every site to be reachable.

## Consequences

### Positive

- A site still listens on nothing, so it can run on a laptop or behind a firewall.
- The control channel's validation rule stays absolute, with no carve-out to reason about.
- One address and one certificate for the org, as today.

### Negative

- A second transport to build, secure and operate.
- Every byte of a preview passes through hq, which is the only traffic that makes hq carry
  machine-scale volume for a person-scale activity.

### Risks

- **The opt-in direct path departs from
  [ADR-0044](adr-0044-execution-site-registration-flow.md) and
  [ADR-0045](adr-0045-request-response-on-the-control-channel.md)**, which state that a site never
  accepts an inbound connection, with no exceptions — ADR-0044 rejected a registration flow on that
  basis as incompatible with the architecture rather than merely inconvenient. An operator enabling it
  takes on a reachable address, a certificate, and a machine holding everyone's files that now
  listens. Accepted deliberately and narrowly: off by default, per site, and taken against a measured
  problem. What would expire the acceptance is it being enabled routinely rather than exceptionally,
  at which point the no-inbound rule is no longer the architecture's rule and should be re-decided
  rather than eroded.

## References

- [ADR-0051](adr-0051-live-site-data-crosses-as-typed-events-not-a-generic-relay.md) — the rule this
  keeps intact by not crossing on that channel
- [ADR-0045](adr-0045-request-response-on-the-control-channel.md) and
  [ADR-0044](adr-0044-execution-site-registration-flow.md) — the no-inbound rule the opt-in departs
  from
- [ADR-0057](adr-0057-a-container-is-bound-to-one-storage-location.md) — the container a preview runs
  inside
- `docs/work/2026-09-15-hq-site-split-close-out/spec.md` §6.6 — the design this is cut from
