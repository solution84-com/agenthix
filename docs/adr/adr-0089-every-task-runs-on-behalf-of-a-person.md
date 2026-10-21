---
created: 2026-10-03
description: Every task records the person its work is done for, followed up the chain when an agent created it. That person answers its approvals and is notified, and if they lose access to the project, the task is blocked until an admin reassigns it.
---

# ADR-0089: Every Task Runs on Behalf of a Person

**Status:** Accepted

## Context

An agent holds no authority of its own (adr-0060), and from adr-0087 it starts no work of its own.
Yet much of the work that runs was not started by the person watching: an agent creates tasks during
a run, a stage queues them, a schedule or a pulse starts them.

When such a run asks for a tool it was not allowed, the request becomes a comment on the task and
the task stops. Nobody in particular is asked, and nobody is told. And nothing ties a task to a
person, so when someone leaves a project, work they set in motion keeps running there under the
project's authority with nobody answering for it.

## Options considered

**Project admins answer every approval.** Rejected: admins learn of work they did not cause and
cannot judge, and the person who set it running is never asked.

**The agent's owner answers.** Rejected: an agent has no authority to own on anyone's behalf, and
one agent works for many people.

**Record the creator only.** Rejected: when an agent created the task, the creator is the agent, and
the chain to a person is lost one step in.

**On loss of access, hand the task to another person automatically.** Rejected: it would put work in
front of someone who did not choose it, under their name.

## Decision

**Every task is done on behalf of a person, and that person answers for it.**

- **The person is recorded on the task.** A task a person creates is on their behalf. A task an agent
  creates during a run is on behalf of the person that run was on behalf of, so the chain always
  ends at a person. A scheduled task is on behalf of the person who set the schedule, or who asked the
  agent that set it.
- **That person answers its approvals** and is notified when one is waiting. Anyone who could approve
  before still can.
  > **Superseded by adr-0095** *(2026-10-07)*: a run a person starts is on that person's behalf, and its
  > approvals notify them; the task's person is the default for runs nobody started.
- **If that person loses access to the project, the task is blocked** with a reason that says so,
  until a project admin assigns it to someone else. It is never reassigned automatically.

## What this binds

- **Every path that creates a task must set the person**, including agent tools, stages, templates
  and schedules; a task with no person is a defect.
- **Every future approval, notification and audit design starts from this person**, not from the
  agent, the project or its admins.
- **Removing a person from a project must reach the tasks done on their behalf there.**

This does not change whose authority a run has: that is still its boundary's (adr-0060). The person
answers for the work; the boundary bounds it.

Undoing it means finding another answer to who approves unattended work, and dropping a field every
creation path sets.

## Consequences

### Positive
- An approval reaches a person who knows why the work exists.
- Every piece of automated work traces back to a person.
- Work stops when the person behind it leaves, rather than carrying on unowned.

### Negative
- Removing someone from a project can block a large amount of work at once, which an admin has to
  reassign.

### Risks
- **A person can approve requests from work an agent chained from theirs** without having seen the
  intermediate tasks. The trail of who queued what is recorded so they can read it back.

## References

- adr-0060 — authority comes from the boundary, never a union
- adr-0087 — work starts on its own only from a boundary's automation
