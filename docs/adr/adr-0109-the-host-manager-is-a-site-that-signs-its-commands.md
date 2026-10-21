---
created: 2026-10-14
description: The organisation's Host Manager is a site of its own kind that dials out to HQ, exposes nothing on the network and signs every command, so HQ relays commands to host services that it can neither read nor make.
---

# ADR-0109: The Host Manager Is a Site That Signs Its Commands

> *(2026-10-16)* The Host Manager is now called the Fleet Console.

**Status:** Accepted

## Context

Fleet admins need one place to look after the organisation's machines, local or remote. Those machines publish no
port (adr-0065): their host services, like their sites, only dial out. Something must reach them, and whatever does
becomes a target: if HQ could issue machine commands, a takeover of HQ would reach every machine (adr-0107).

## Options considered

**The Host Manager listens on the network, and host services dial it.** Rejected: a second public listener to
secure, beside HQ's port.

**HQ issues the commands.** Rejected: puts machine authority back inside HQ.

**The Host Manager reaches each host service directly over a tunnel per machine.** Rejected: one inbound path per
machine, which is what the no-inbound rule exists to prevent.

## Decision

**The Host Manager is a site of its own kind — the manager site.** It dials out to HQ's port like every site, runs no
agents, and exposes nothing: its screens listen on `127.0.0.1` of its own machine. Host services dial out to HQ's port
too. **Every command the Host Manager sends is signed with its own key, which each host service pinned when it
connected, and sealed to that host service**, so HQ relays it and can drop it, but cannot read it or make one. It runs
on HQ's machine by default and may move to another; it has no accounts of its own (adr-0110).

## What this binds

- Nothing dials a host service or the Host Manager from the network; HQ's port is the only listener.
- Every command to a host service carries the Host Manager's signature, checked against the pinned key before it acts.
- HQ's relay carries sealed messages and never interprets them.

Undoing it means either a second public listener or machine authority inside HQ.

## Consequences

### Positive
- A takeover of HQ cannot act on a machine: it cannot make a command, open the Host Manager or reach a host service.

### Negative
- While HQ does not answer, the Host Manager reaches no other machine; each machine's CLI still works.

### Risks
- The Host Manager's key is the machine authority over the fleet; it lives only on the Host Manager's machine and is
  backed up with the site it runs on.

## References

adr-0065, adr-0107, adr-0110.

> **Acted on.** *(annotated 2026-10-16)* Carried out by the unit of work
> [`2026-10-13-host-management`](../work/2026-10-13-host-management/plan.md), plan 3.2–3.3 and 3.7–3.12, merged to
> `main` at its close and verified by the close-out regression and the owner's walkthroughs.
