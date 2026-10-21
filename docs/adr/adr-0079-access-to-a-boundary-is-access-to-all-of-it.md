---
created: 2026-09-28
description: A container mounts its boundary's folder once, with every workspace in it, and the workspace access policy is removed; inside a project the container is the isolation, and a workspace's own settings are a guardrail for the runs working in it.
---

# ADR-0079: Access to a Boundary Is Access to All of It; a Workspace's Settings Are a Guardrail

**Status:** Accepted

## Context

A run's container mounts one storage boundary, a project or a person's own storage (adr-0074). Inside
a project, the hq/site split added a workspace access policy on 2026-08-10: an operator could block
agents from one workspace, a blocked workspace was never mounted, and a run working in it was refused
before it started. To enforce the policy, a container mounted each workspace separately instead of the
boundary's folder whole. Mounting the folder whole was never weighed against that.

The policy's stated case was a person's own workspace. That case is already covered, because a
person's own storage is a boundary of its own, and no project container mounts it.

The separate mounts became a source of failures once a person's conversations ran side by side in one
container (adr-0075). A container's mounts are fixed when it starts. Creating a workspace therefore
changed the mount set, which forced the container to be rebuilt, and any run still going failed after a
120-second wait.

A workspace also has its own tool settings: the tools it allows, which include whether the shell is allowed at all.
Until now, hq combined every workspace's allowed tools and applied the result to every run in the
project. So a limit on one workspace narrowed work in all of them.

## Options considered

- **Keep the policy, mount the folder once, and cover each blocked workspace with an empty mount.**
  Rejected. It keeps a feature whose only remaining use nobody has asked for: blocking one workspace
  while agents work in the rest of the project. It also keeps a rebuild whenever a workspace is blocked
  or unblocked.
- **Keep one mount per workspace, and start a second container for each different set of mounts.**
  Rejected. It has the most moving parts, all for that same unneeded feature.
- **Drop workspace settings entirely.** Rejected. A project owner would lose any way to lock down one
  workspace.
- **Confine a run to its own workspace by what is mounted.** Rejected. It brings back a different set
  of mounts per run, and with it the rebuild failures above.

## Decision

**A container mounts its boundary's folder once**, `/projects/<project id>/` or `/users/<person id>/`,
with everything in it. That includes files, knowledge, artefacts, every workspace, tasks and member
folders. A workspace created while the container runs appears in it straight away. What a container
mounts is fixed by its key and never changes.

**The workspace access policy is removed.** There is no way left to keep agents out of one workspace of
a project while they work in the rest. Keeping something from agents is a matter of where it lives:

- in a project they are not added to, or
- in someone's personal storage.

**Security inside a project has two layers, of different strength:**

- **Isolation: the project, by its container.** The operating system enforces it, so an agent with a
  shell cannot get around it. Anything that must be truly unreachable goes in a project of its own.
- **A guardrail: a workspace's own settings.** They apply only to runs that work in that workspace. A
  run's tools are the agent's own, narrowed by the project's override (adr-0072), narrowed by the
  list of the one workspace it works in, if that workspace has one. Runs working in the project's
  files, a task folder or any other workspace are not affected by it. The platform's own tool check
  enforces the guardrail, not the operating system, so it is only as strong as its shell rule. With
  the shell allowed freely, it is advisory.

A sandbox enforced by the operating system for a single workspace is queued as later work.

## What this binds

- **A container's storage mount is a function of its key alone.** Nothing may bring back a mount per
  workspace or per run. A second container per set of mounts is excluded for the same reason.
- **No claim or check that keeps agents out of part of a boundary.** Refusing a run over a "blocked"
  workspace is gone, and a design that needs it must supersede this record.
- **A workspace's settings narrow only runs working in that workspace.** They are never combined across
  a project. A workspace whose settings cannot be read still refuses the run working in it, since
  treating that workspace as having no list would hand back the agent's full set of tools.

Undoing it means bringing back a mount per workspace and the rebuild on every workspace change. Those
rebuilds are the ones that failed parallel runs.

## Consequences

### Positive

- Creating, renaming or deleting a workspace never restarts a container, and never fails a run that is
  still going.
- A limit set on one workspace no longer narrows work anywhere else in the project.
- The capability no longer carries per-workspace access claims, and the mint no longer lists every
  workspace in the project to build it.

### Negative

- Every agent in a project can read and write every workspace in it. There is no finer barrier than the
  project itself.
- A workspace's guardrail is not a security boundary. A person who reads "restricted" as "isolated" is
  misled unless the interface says otherwise.

### Risks

- **A project used as a shared space for work that must stay apart.** The remedy is a separate project,
  which people have to know to reach for. Until sandboxed workspaces are built, nothing between that and a whole
  project exists.

## References

- adr-0074: one boundary per container, which this record keeps
- adr-0075: parallel runs in one container, which made the separate mounts fail
- adr-0072: the project's override, which a workspace's list narrows further
- adr-0040: the capability's lifetime, which still bounds how long a change to a workspace's settings
  takes to reach a running session
- [Design spec: person-scoped execution](../work/2026-09-28-person-scoped-execution/spec.md), §1
