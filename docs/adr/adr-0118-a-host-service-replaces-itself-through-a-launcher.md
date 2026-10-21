---
created: 2026-10-14
description: A host service moves to a new version of itself through a small launcher in its own image, which swaps its container for the new, signed one and puts the old one back if the new one does not come up; it can be switched off, leaving the machine admin to switch the host service by hand.
---

# ADR-0118: A Host Service Replaces Itself Through a Launcher

**Status:** Accepted

## Context

A host service runs HQ and sites of its own major and minor version, so a new minor or major version of HQ or a site
needs the host service on that machine moved first. A container cannot replace itself: whatever stops it must
outlive it and hold the Docker socket. Without that, a person must log in to every machine for every minor release,
and a machine nobody can reach falls behind.

## Options considered

**The machine admin switches the host service by hand.** The host service checks and fetches its new image and
prints the two commands. Rejected as the only way: every minor release needs a person on every machine, which a
fleet of machines in different places cannot keep up with, and the Host Manager's upgrade would stop at "log in to
this machine first". It remains the fallback.

**A separate helper container, started by the host service, swaps it.** Rejected: a second long-lived holder of the
Docker socket, with its own image to publish, sign and keep compatible.

## Decision

**The host service's image carries a small launcher that replaces the host service with a new version of itself.**
The host service checks the new image's signature (adr-0117) and fetches it by digest, then starts the launcher from
its own current image as a short-lived container with the Docker socket. The launcher starts the new host service
with the same mounts and settings, waits for it to answer on its owner socket, and only then removes the old one; if
the new one does not answer, it removes it and starts the old one again. It runs only images the host service
already checked, and only forward. **It can be switched off on the machine**, and then the machine admin switches
the host service by hand, as the fallback above.

## What this binds

- The launcher runs only an image whose signature the host service has checked, pinned by digest, and never an
  older version than the one running.
- The host service's container is started from settings the host service records in its state folder, so the
  launcher can start the same container again from either image.

Undoing it means every minor release needs a person on every machine.

## Consequences

### Positive
- A fleet admin can move every machine, including ones nobody can reach, to a new version from the Host Manager.

### Negative
- One more part that must keep working across every version it upgrades from.

### Risks
- A swap that fails and cannot put the old host service back leaves the machine without one until a person reaches
  it — the same position as a machine without the launcher. If keeping the launcher working costs more than it
  saves, it is switched off by default and the manual switch stays.

## References

adr-0107, adr-0109, adr-0117.

> **Acted on.** *(annotated 2026-10-16)* Carried out by the unit of work
> [`2026-10-13-host-management`](../work/2026-10-13-host-management/plan.md), plan 2.38, merged to `main` at its close
> and verified by the close-out regression and the owner's walkthroughs.
