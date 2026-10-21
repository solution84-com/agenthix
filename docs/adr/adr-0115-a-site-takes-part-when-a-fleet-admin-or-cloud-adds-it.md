---
created: 2026-10-14
description: Organisation admins look after the business's operations and fleet admins the machines, so a site takes part in HQ when a fleet admin adds it in the Host Manager or Cloud adds one it runs — not by an organisation admin's approval; HQ's site pages are read-only.
---

# ADR-0115: A Site Takes Part When a Fleet Admin or Cloud Adds It

**Status:** Accepted

## Context

Under adr-0064 a site registered with its installer's consent and an organisation admin's approval in HQ. Host
management separates the jobs: organisation admins look after people, projects, agents and policy; fleet admins look
after machines and how they connect (adr-0110). Approving a machine into the fleet is the second job, and HQ holds no
machine authority (adr-0107).

## Options considered

**Keep the organisation admin's approval** (adr-0064). Rejected: it puts a machine decision with the business role,
and an organisation admin's session could admit a machine.

**Approval in both places.** Rejected: two people for one decision that is only one of theirs.

## Decision

**A site takes part when a fleet admin adds it in the Host Manager** — a one-time code, the machine's fingerprint
confirmed — **or when Agenthix Cloud adds a site it runs; it stops when it is disconnected there.** HQ accepts and
removes a site's credential only from the Host Manager over its connection, or from the Cloud controller for Cloud's
sites. A site cannot ask to join from a machine the Host Manager does not know. HQ shows each site's status read-only
to organisation admins, who see the cause and who acts, and contact the fleet admins. The default site still joins by
its pairing secret (adr-0070).

## What this binds

- HQ has no approval screen and no route that admits a site on an organisation admin's word.
- The registration-token route, which nothing issues, is removed.

Undoing it means machine decisions back with the business role.

## Consequences

### Positive
- One person, the right one, decides which machines take part.

### Negative
- An organisation without a fleet admin cannot add a site until one is given the role at HQ's machine.

### Risks
- None beyond adr-0110's.

## References

Supersedes adr-0064. adr-0044, adr-0070, adr-0107, adr-0109, adr-0110.

> **Acted on.** *(annotated 2026-10-16)* Carried out by the unit of work
> [`2026-10-13-host-management`](../work/2026-10-13-host-management/plan.md), plan 2.30, 3.4–3.5 and 3.10, merged to
> `main` at its close and verified by the close-out regression and the owner's walkthroughs.
