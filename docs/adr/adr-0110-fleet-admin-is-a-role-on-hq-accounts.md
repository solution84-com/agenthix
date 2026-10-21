---
created: 2026-10-14
description: Fleet admin is a role on HQ accounts, granted only by a fleet admin or a machine admin of HQ's machine, never by an organisation admin; it is named the same on Agenthix Cloud, and HQ stays its authority when the organisation is connected.
---

# ADR-0110: Fleet Admin Is a Role on HQ Accounts

**Status:** Accepted

## Context

Looking after machines and looking after the organisation's people and work are different jobs, often held by
different people, and the second must not imply the first (adr-0107). The Host Manager needs to know who may sign in
(adr-0109), and Agenthix Cloud has the same job for the machines it runs.

## Options considered

**The Host Manager keeps its own accounts.** Rejected: a second set of passwords to set up, recover and lose, for the
same people HQ already knows.

**Organisation admins look after machines too.** Rejected: whoever takes over an organisation admin's account would
hold the machines; the roles are separate jobs.

**Cloud grants the role in HQ when the organisation is connected.** Rejected: a takeover of Cloud would then make
fleet admins in every connected organisation, and reach their machines.

## Decision

**Fleet admin is a role on an HQ account.** People sign in to the Host Manager with their HQ login, and only accounts
holding the role are let in. The role is granted only by a fleet admin, in the Host Manager, or by a machine admin of
HQ's machine at the command line, which is also how it is recovered when nobody holds it — **never by an organisation
admin**; every grant and removal is announced. **The role has the same name on Agenthix Cloud**, for the machines
Cloud runs. When an organisation is connected, its fleet admins on Cloud are listed in the Host Manager, but **HQ stays
the authority**: someone on that list holds the role in HQ only once it is granted there by the usual routes.

## What this binds

- HQ refuses a grant of the role from anyone but a fleet admin or the machine.
- The Host Manager has no accounts or passwords of its own.
- Cloud never writes HQ's roles; anything Cloud lists is a suggestion.

Undoing it means either a second account store, or machine authority reachable from an organisation admin or from
Cloud.

## Consequences

### Positive
- One login per person; a takeover of HQ or of Cloud cannot by itself make someone able to act on machines.

### Negative
- Signing in to the Host Manager needs HQ to answer; the CLI on each machine remains when it does not.

### Risks
- A takeover of HQ could grant the role, but cannot reach the Host Manager's screen or make a signed command
  (adr-0109).

## References

adr-0042, adr-0107, adr-0109, adr-0115.

> **Acted on.** *(annotated 2026-10-16)* Carried out by the unit of work
> [`2026-10-13-host-management`](../work/2026-10-13-host-management/plan.md), plan 3.1, 3.8, 4.13 and 4.15, merged to
> `main` at its close and verified by the close-out regression and the owner's walkthroughs.
