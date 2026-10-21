---
created: 2026-10-07
description: A task is shared on equal footing within its project. A run a person starts — Run, Run again, or a message into the task's session — is on that person's behalf; the task's person is the default for runs nobody started.
---

# ADR-0095: A Run Is on Behalf of Whoever Started It

**Status:** Accepted

## Context

adr-0089 ties every task to a person, who answers its approvals and is notified. A task's session is shared
with its project: every member can read it, and anyone who may start runs can start one, send into it, stop
it or approve its requests.

So the person who starts a run is often not the task's person. A colleague presses Run, or steps into the
session to tell the agent what to do next. The run was theirs, but the task's person was asked to approve
what it wanted, and a run started by a message had no person behind it at all, so nobody's access was
checked before it ran.

## Options considered

**Every run is on behalf of the task's person.** Rejected: people working on a shared task are on equal
footing, and the task's person would be asked about work they did not start and cannot judge.

**Only the task's person may start or steer its runs.** Rejected: it makes a shared task one person's, and
the rest of the project can only watch.

## Decision

**A run is on behalf of whoever started it. The task's person is the default for runs nobody started.**

- A run a person starts — Run, Run again, Run all, or a message into the task's session — is on their behalf.
  Their access to the project is checked before it starts, and its approval requests notify them.
- A run nobody started — a column, a start time, a routine, the project's automation — is on behalf of the
  task's person, as adr-0089 says.
- A task an agent creates during a run is on behalf of that run's person, so the chain still ends at a
  person: for a run started by a message, the person who sent it.
- Anyone who may start runs in the project may approve or deny a run's request, whoever it is for.

## What this binds

- **Every path that starts a run records whose behalf it is on,** and a start by a person names that person.
- **Approvals and notifications follow the run's person,** not the task's, whenever they differ.
- adr-0089's other rules stand: the task's person is recorded on every task, and a task whose person loses
  access is blocked until an admin reassigns it. A run whose starter has lost access fails instead, because
  anyone else on the project may run it again.

This does not change whose authority a run has: that is still its boundary's (adr-0060).

Undoing it means sending every approval back to the task's person, and dropping the run's own person.

## Consequences

### Positive
- The person asked to approve a request is the one who started the work.
- A shared task can be worked on by anyone on the project without borrowing someone else's name.
- Every run has a person whose access was checked when it started.

### Negative
- A task's runs may be on behalf of several people over its life; reading who answered for what means
  reading each run, not only the task.

### Risks
- A person can start a run on a task whose description someone else wrote, and answers for it. The
  session names who started each run.

## References

- adr-0089 — every task runs on behalf of a person (refined here)
- adr-0060 — authority comes from the boundary, never a union
- adr-0030 — a task keeps one session, resumed on every run

> **Acted on.** *(annotated 2026-10-12)* Carried out by the unit of work `2026-10-06-every-screen-reviewed`, its shared task sessions (phase 2), merged to `main` on 2026-10-12 and verified by
> the full regression and the owner's walkthroughs.
