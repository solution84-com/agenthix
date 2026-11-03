---
created: 2026-11-01
description: Agenthix starts agents and live previews only on machines the organisation runs as its sites, never on a person's own computer. A laptop may hold workspaces only by being one of the organisation's sites.
---

# ADR-0167: Agenthix Acts Only on Machines the Organisation Runs

**Date:** 2026-11-01
**Status:** Accepted

## Context

Live previews need an agent's app to run somewhere and be reachable from wherever the person is. A design was built in
which a person could add their own laptop from HQ, and HQ would open Rooms on it: HQ dispatched the agent's work to a
site on the laptop, which ran the agent and its apps in a container there.

That inverts who starts the work. A tool such as a coding agent's own command-line client runs on a person's computer
because the person started it there; other devices only watch or steer it. Here a server reached into a personal
machine and started an agent on it. Every safeguard that inversion needs had to be built and then lived with by the
person: a passkey to add the computer, to connect each project and to open each Room; a machine check before adding;
firewall rules closed around the laptop's containers; IPv6 turned off; Docker Desktop's file sharing narrowed to one
folder; a sandbox whose folder sat seven levels deep; Rooms that pause when unused; a lock and *Stop everything*.

Walking it as a first-time person showed the cost. Adding a computer and working in a Room went through sixteen
separate problems, most of them caused by those safeguards rather than by mistakes in them, and the result still felt
unsafe, because the platform was acting with authority it does not have. Building it also produced a string of
security defects in the seams between HQ, the laptop's host service and its site: rules written for the wrong kind of
machine, a check that could pass on weaker protections, a wait the person's own yes could end.

Meanwhile the same feature on the organisation's own site, a machine the organisation runs, needed none of
that: one click, HQ's own checks, an app at its own address.

## Options considered

- **Rooms on a person's own computer, started by HQ.** Rejected: it gives the platform authority over a machine the
  organisation does not run. The safeguards it needs make it hard to use, and each seam between HQ and the computer is
  a place for a security defect.
- **Make it easier while keeping it.** Rejected: the friction comes from the safeguards, and the safeguards come from
  the inversion. Smoothing them weakens them.
- **Only the organisation's machines, chosen.** A laptop can still hold workspaces and run live previews, by being one of the
  organisation's sites, added by a fleet admin like any other site.

## Decision

**Agenthix starts agents and live previews only on machines the organisation runs as its sites.** HQ's own machine,
whether a VPS or a laptop, and any other site a fleet admin added are such machines. HQ never adds, connects to or
starts work on a person's own computer.

If a person's own computer is ever supported, the work starts from the person: their own agent, which they started,
connects out to HQ, and HQ and other devices watch and steer it. That is a separate design, not an extension of this
one.

## What this binds

- No feature makes HQ, a site or the host service start work on a machine outside the organisation's sites.
- Live previews are built for the organisation's sites, and must work fully on a one-machine install.
- The person's-computer parts built before this decision are removed, not left dormant.

Undoing it means designing again everything listed in the context above, with the same costs.

## Consequences

### Positive

- One trust boundary: HQ and the sites it runs. HQ's own checks decide.
- Live previews need no passkeys, machine checks or narrowed file sharing.
- Far less code that sits across a boundary, and so fewer places for security defects.

### Negative

- A person can't use their own laptop's files or hardware for an agent unless the laptop becomes one of the
  organisation's sites.

### Risks

- An organisation that wants agents on people's laptops may add those laptops as sites. That is the organisation's
  choice about its own machines, and the site's protections apply as on any site.

## References

adr-0042 (HQ is the organisation's own).

> **Acted on.** *(annotated 2026-11-03)* By the unit of work [`2026-11-01-live-preview`](../work/2026-11-01-live-preview/plan.md): code work on branches and live previews run only on the organisation's own sites, and nothing reaches into a person's computer.
