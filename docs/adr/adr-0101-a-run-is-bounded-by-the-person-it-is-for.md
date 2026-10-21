---
created: 2026-10-09
description: A run may do in hq only what both its boundary and the person it is on behalf of may do. Each platform tool is checked against that person, as if they had done it themselves. An agent's permissions limit what it attempts; they never stand in for authority.
---

# ADR-0101: A Run Is Bounded by the Person It Is For

**Status:** Accepted

## Context

Every run is on behalf of one person (adr-0095): whoever started it, or the task's person for a run nobody started.
That person is signed into the run's capability. Under adr-0060, though, a run in a project "acts as the project":
it carries no person's role, and hq only checks that it stays inside its project. So a tool that needs a role, such
as deleting or archiving a task or finishing a sprint, never checks one. Someone whose organisation role is Viewer
could step into a task's conversation and have the agent delete tasks they could not delete themselves.

An agent's permissions (Always, Ask, Never) used to hide this, because they set those tools to Never by default. An
agent's approval can now be Bypassed, which switches its own permissions off. Permissions say what an agent may
attempt. They were never meant to be the authority check.

## Options considered

**Keep adr-0060, and keep relying on the agent's permissions.** Rejected: that makes an agent's settings the
authority, and Bypassed would turn it off.

**Give a project run its own fixed role.** Rejected: the same run would be allowed more for one person than they
may do themselves, and less for another.

## Decision

**A run may do in hq only what both its boundary and the person it is for may do.**

- **The boundary still confines it.** A run in a project reaches only that project, and its credentials are the
  boundary's (adr-0060 stands on this).
- **The person bounds it.** Each platform tool a run uses is checked against the person it is on behalf of: their
  organisation role, their membership of the project, and the same rules the browser applies when they do it
  themselves.
- **A run that is on behalf of nobody** does nothing that needs a person's authority.
- **An agent's permissions only limit what it attempts.** Bypassed never widens what a run may do in hq.

This is an intersection of the boundary's reach and the person's authority, never a union, so adr-0060's reason
for rejecting a union still holds.

## What this binds

- Every control-plane operation checks the run's person as its browser twin checks the signed-in person. An
  operation whose browser twin needs a role or membership needs the same of the run's person.
- A capability names its person. A new kind of run must say who it is on behalf of, or be treated as on behalf of
  nobody.
- Nothing grants a run authority because of the agent it runs.

Undoing it means a run in a project could again do what the person behind it may not.

## Consequences

- adr-0060's sentence "a run in a project acts as the project" is replaced: a run in a project acts within the
  project, for its person. The rest of adr-0060 stands.
- A person who loses a role or leaves a project loses it for their runs too, from their next tool call.

> **Acted on.** *(annotated 2026-10-12)* Carried out by the unit of work `2026-10-06-every-screen-reviewed`, plan 3.19–3.22, merged to `main` on 2026-10-12 and verified by
> the full regression and the owner's walkthroughs.
