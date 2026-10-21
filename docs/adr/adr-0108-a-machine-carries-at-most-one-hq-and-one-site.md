---
created: 2026-10-14
description: Every machine carries at most one HQ and at most one site; HQ never runs without its default site; the site and its machine are named apart. A second organisation is a second machine.
---

# ADR-0108: A Machine Carries at Most One HQ and One Site

**Status:** Accepted

## Context

With a host service on every machine (adr-0107), each operation names what it acts on. Allowing several sites on one
machine would put a site name on every command, split the machine's capacity between them, and make a moved site or
a lost machine ambiguous. HQ already always comes with its own default site (adr-0070).

## Options considered

**Several sites per machine.** Rejected: nothing it gives that a site's private network per boundary (adr-0066) and
HQ's limits do not already give, at the cost of a site name on every command and a split ceiling. Allowing it later
adds to the design without breaking an install.

**HQ on a machine of its own, without a site.** Rejected: HQ never runs alone; its default site is where its own
agents work, and it upgrades, backs up and moves with HQ.

## Decision

**A machine carries at most one HQ and at most one site; HQ's machine carries HQ and its default site.** A site and
the machine under it are separate things with their own names: when a machine connects, its site's name defaults to
the machine's, after which they are stored apart, and a site that moves to another machine keeps its name.
*(2026-10-16: the naming in this point is superseded by adr-0120 — a site is always named after its machine, and a
move or a restore renames it.)* A second
organisation is a second machine or virtual machine — the machine is the boundary between organisations.

## What this binds

- Host-service operations name the machine, never a site among several.
- Moving a site or HQ goes to a machine that carries no site of its own.
- Screens and records keep the site's name and the machine's apart. *(2026-10-16: superseded by adr-0120.)*

Undoing it means a site name in every operation and a capacity split per site.

## Consequences

### Positive
- One ceiling per machine; a move and a restore each have one obvious target.

### Negative
- A second site needs a second machine or virtual machine.

### Risks
- None beyond the cost above.

## References

adr-0042, adr-0066, adr-0070, adr-0107.

> **Acted on.** *(annotated 2026-10-16)* Carried out by the unit of work
> [`2026-10-13-host-management`](../work/2026-10-13-host-management/plan.md), plan 2.4–2.5 and 3.16, merged to `main` at
> its close and verified by the close-out regression and the owner's walkthroughs. Its naming was superseded by adr-0120
> during the unit.
