---
created: 2026-09-16
description: A run acts with the authority of the one boundary it is for — never the person's, never both — and external credentials belong to that boundary.
---

# ADR-0060: Authority Comes from the Boundary, Never a Union

**Status:** Accepted

## Context

An agent is reusable: the same one works for different people and different projects. If authority
follows the agent, it accumulates across everyone the agent works for, and an agent that has touched
many contexts ends up able to reach all of them.

A run started by a person inside a project has two actors in the room. Combining their permissions
creates an implicit union — the project gaining the person's own access, and the person gaining the
project's. Treating the initiating person as the authority lets project work inherit access that
belongs only to them.

External systems make it sharper. Each provider has its own permission model, and subdividing one
org-wide credential inside Agenthix would mean reproducing those semantics in a second authorization
layer that drifts from the provider's own.

## Options considered

- **The agent's own authority.** Standing credentials held by the agent. Rejected: authority
  accumulates across contexts, which is the problem this record exists to close.
- **The initiating person's authority.** A run does what the person could do. Rejected: project work
  then reaches a person's private access, and an unattended run has no person to act as.
- **The union of both.** Convenient, and refused: it grants each side the other's reach, and nothing
  afterwards can say which of the two justified a given action.

## Decision

**A run's authority comes from the boundary it is for.** A run in a project acts as the project; a run
in a person's own storage acts as that person; a task acts as its project; a heartbeat acts as nobody.
Never a union.

> *(Annotated 2026-10-09.)* **Refined by adr-0101.** A run in a project is still confined to the project and uses its
> credentials, but each platform tool it uses is also checked against the person the run is on behalf of
> (adr-0095): the intersection of the two, never a union.

**Membership is the gate, and the boundary is the authority.** Being entitled to a boundary is what
lets someone start a run in it. What the run may then do is the boundary's, and identical for every
member.

**External credentials belong to the boundary.** A repository is reachable because the boundary owns
the attachment, not because the caller is signed in. The same holds for whatever integration follows.

**An agent holds no standing credential of its own**, including for model access, which is supplied
per run.

## What this binds

Every server-side write path resolves the resource's boundary and checks entitlement to it, rather
than checking that a caller is signed in. Capability minting attaches the boundary's authority, not
the invoker's role. Integration credentials are held against a boundary. Nothing may be granted to an
agent that persists between the runs it does for different owners.

Undoing it means either giving agents standing credentials or accepting a union of two actors'
permissions.

## Consequences

### Positive

- An agent's reach does not grow with the contexts it has worked in.
- What a run may do can be stated in one sentence and checked in one place.
- Provider permissions stay the provider's to model, rather than being reproduced inside Agenthix.

### Negative

- Everyone entitled to a project can do what that project's agent can do; a reader class would need
  its own container and is deliberately not offered yet.
- A person's own access cannot be used to help a project run, even where they hold it.

### Risks

- **A project's authority is as strong as its weakest member's judgement**, since every member wields
  it in full. Accepted: the alternative is per-person authority inside a shared boundary, which
  reintroduces the union.

## References

- [ADR-0057](adr-0057-a-container-is-bound-to-one-storage-location.md) — the same boundary, for what a
  run may read
- [ADR-0059](adr-0059-an-agent-is-a-versioned-package.md) — why an agent has nothing of its own to
  carry authority with
- [ADR-0061](adr-0061-a-product-and-a-programme-group-work-and-own-nothing.md) — which things are
  boundaries at all
- `docs/work/2026-09-15-hq-site-split-close-out/spec.md` §6.3 — the design this is cut from
