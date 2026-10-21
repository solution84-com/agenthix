---
created: 2026-10-14
description: One host service per machine is the only thing that installs, upgrades, backs up, restores, configures and erases HQ and sites on that machine; HQ holds the organisation's authority and none over machines.
---

# ADR-0107: The Host Service Alone Holds a Machine's Authority

**Status:** Accepted

## Context

Today a machine is administered by whoever runs `docker compose` and the `./agenthix` script on it, and HQ's
Execution Sites pages carry controls and figures that read as machine administration — approving a site, a capacity
editor, disk and Docker versions. Nothing separates administering the machine from administering the organisation,
and a hosted service could only run an HQ by reaching round the product. Host management needs one place that holds a
machine's authority, which every interface — the command line, the organisation's Host Manager and Agenthix Cloud's
controller — asks to act.

## Options considered

**HQ administers its machines.** Rejected: whoever takes over HQ, or holds an organisation admin's session, would hold
every machine; and HQ's people and work would sit in the same trust as its infrastructure.

**Each interface acts on Docker itself** — the CLI, the Host Manager and Cloud each with their own code. Rejected:
three implementations of every operation, and three places to get a refusal wrong.

## Decision

**One host service per machine holds that machine's authority, and nothing else does.** It runs as a container with
the Docker socket and a state folder, and acts only through a closed set of operations: read figures and logs;
install, start, stop and remove an HQ or a site; upgrade to a published version; take, export, store, fetch and
restore backups; set capacity; set the address and the front door; schedule and cancel changes; suspend, resume,
erase; move. It refuses anything else — no shell, no arbitrary Docker command, no file access. The CLI, the Host
Manager and the Cloud controller are its clients. **HQ holds the organisation's authority and none over machines**:
assigning a site work and setting policy over it give no power to add, remove, restart, upgrade, inspect or
reconfigure it or the machine it runs on.

## What this binds

- Every machine operation is one of the host service's, reached through it; no other program drives Docker for HQ or
  a site.
- HQ shows a site's status and capacity, and a cause in words, never a machine's figures or a control over it.
- A new operation is added to the closed set deliberately, never by passing a command through.

Undoing it means machine authority back inside HQ, and a takeover of HQ that reaches every machine.

## Consequences

### Positive
- One implementation of every operation; the CLI, the Host Manager and Cloud cannot disagree.
- A takeover of HQ is contained to the organisation's data.

### Negative
- A new container on every machine, and the CLI moves inside its image.

### Risks
- The host service holds the Docker socket: a flaw in it is a flaw in the machine. Mitigated by the closed set and by
  its clients being able to ask only for those operations.

## References

adr-0042, adr-0069, adr-0108, adr-0109.

> **Acted on.** *(annotated 2026-10-16)* Carried out by the unit of work
> [`2026-10-13-host-management`](../work/2026-10-13-host-management/plan.md), plan 2.1–2.7 and 2.34, merged to `main` at
> its close and verified by the close-out regression and the owner's walkthroughs.
