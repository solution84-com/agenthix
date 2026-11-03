---
created: 2026-09-28
description: A container is keyed on the one storage boundary it serves and on who runs in it — a person, or the project for runs with nobody behind them — with the runner taken from hq's signed capability, a private harness home per container kept beside storage, and container paths that mirror the site's disk by id.
---

# ADR-0074: A Container Is Keyed on Its Boundary and Its Runner

**Status:** Accepted

## Context

adr-0057 bound a container to one storage location, so every member of a project runs in the
project's one container. That container has one harness home — the runtime's private state, including
its raw transcripts and the prompts it was given, which carry a person's memory. Agents run as one
non-root user, so nothing inside the container keeps one member's harness state from another. hq never
shows one member another's chat (adr-0041), but an agent with shell and file tools can read it on
disk, whether because a member asks or because untrusted content in the project tells it to.

adr-0057 weighed keying on the storage location and the person, and kept it open as the way to end
residue between people's runs. This record takes it.

A harness also files each conversation under its working directory, so the path at which a container
sees storage has to stay the same for as long as the conversation can be resumed.

## Options considered

- **One container per person, mounting every boundary they can reach.** Rejected: a run in one project
  could reach another project and the person's own files, and one home would hold the person's
  conversations from every boundary side by side.
- **One container per project, with a separate Linux user per person inside it.** Fewer containers.
  Rejected: files one user writes in shared storage must stay editable by every other, git refuses
  repositories owned by another user, and it is weaker than separate containers if an agent reaches
  root.
- **Keep one container per boundary and accept the exposure until after release.** Rejected: it ships
  a privacy promise that a teammate's agent can bypass, and changing the model after release means
  migrating people's data.
- **Container paths by readable name** (today's), **or by a name fixed at creation.** Rejected:
  renaming a project or workspace would end every conversation in it; a name fixed at creation shows a
  name that is no longer true.

## Decision

**A container is keyed on its boundary and its runner.** The runner is a person, or the project itself
for runs that nobody is behind. In a project with two members there are three containers: one per
member and one for the project's own runs. In a person's own storage the only runner is that person, so
nothing changes there.

**A container mounts exactly one boundary's storage**, as adr-0057 decided. Several containers now
mount the same project, but none mounts more than one boundary.

**The runner comes from hq's signed run capability**, never from the unsigned dispatch payload,
because it decides whose private state is mounted. The claim records who is running and grants
nothing: authority stays with the boundary (adr-0060), so a member's run in a project acts as the
project, not as the member.

**Each container has one harness home, kept on the site's disk beside storage, never inside it**, and
grouped under the person it belongs to, so that removing a person removes one folder. Project storage
is mounted by every container in the project, so a home inside it would be readable by all of them. The
project's own home is never mounted into a member's container.

**A container sees storage at the site's own path with the site root removed**, named by id, so a
rename never moves a conversation's working directory.

**The open questions of the container model are settled as follows:**

- **Concurrent writes to shared project storage** are accepted. The platform gives visibility of what
  is running, not locks (adr-0075).
- **One person's container mounts exactly one boundary.** Their other boundaries are their other
  containers.
- **Tasks run in the project's own runner's container.** Heartbeats keep their own per-agent container
  until they are given a boundary.
- **A run's credential is staged in its runner's home** and taken out only when the last run using that
  home ends, since several runs may now share one home.
- **When a person leaves** a project or the organisation, their containers and harness homes there are
  removed. Their member folder, which is project data, and our record of their conversations are
  untouched.

The design, the home layout and the cleanup rules are in the unit's
[design spec](../work/2026-09-28-person-scoped-execution/spec.md).

## What this binds

- **The container name, its mounts, its lifecycle and the idle sweep key on boundary and runner.**
- **Whatever mounts a home trusts only the signed runner claim.** A runner read from anywhere else is
  a way into another person's home.
- **No harness state may be written inside storage**, for any runtime, present or future.
- **Container paths are ids.** A conversation's working directory never contains a name that can
  change.

Undoing it means returning every member of a project to one shared home, and so to the exposure this
record closes.

## Consequences

### Positive

- One person's harness state cannot be read by another person's run, by construction.
- Residue between runs no longer crosses between people.
- Renaming a project or workspace leaves every conversation in it resumable.

### Negative

- Containers per site grow with people: one per person's own storage in use, plus the active members
  and one more for each active project.
- Container paths are ids, not names; the prompt has to tell an agent what each folder is called.

### Risks

- **A wrong runner claim mounts someone else's home.** The claim is signed by hq for that reason; a
  change that lets any other source name the runner reopens the exposure.
- **The reset between runs still happens only when a container is idle.** Runs that overlap in one
  container share scratch, which is acceptable only because they belong to one person in one boundary.

  *(2026-09-28: the reset between runs is removed by adr-0083 — processes belong to the conversation
  that started them and end with it.)*

## References

- adr-0057 — superseded by this record; one boundary per container stands
- adr-0049 — its lifecycle argument and mandatory idle teardown still stand
- adr-0060 — authority comes from the boundary, which the runner does not change
- adr-0041 — chat privacy, which this record extends to the container
- adr-0075 — work in a boundary runs in parallel
- adr-0076 — a conversation whose harness state is gone is closed
- [Design spec — person-scoped execution](../work/2026-09-28-person-scoped-execution/spec.md)

> **Branch copies share the boundary's container.** *(annotated 2026-11-03)* A branch's working copy lives in `clones/<copyId>/` inside the owner's storage the container already binds, so the container stays keyed on its boundary and runner and is shared across runs as before (unit of work [`2026-11-01-live-preview`](../work/2026-11-01-live-preview/plan.md)).
