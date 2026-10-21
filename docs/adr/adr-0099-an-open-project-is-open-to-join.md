---
created: 2026-10-08
description: An open project is one anyone in the organisation may join in one step; only its members act in it or read its work. Everyone in the organisation is no longer a member of every open project.
---

# ADR-0099: An Open Project Is Open to Join

**Status:** Accepted

## Context

A project is open or private, and open is the default. Under adr-0062 open meant that everyone in the organisation
is a member. The member list, though, holds only the people added to it, usually just the project's admin. So the
list says one thing and the access check another: someone who is not on the list can start runs in an open
project, and those runs can be done on behalf of a person who is on it. Anyone in the organisation can act in any
open project without having chosen to take part, and no screen can say who takes part.

## Options considered

**Keep open as "everyone is a member", and show everyone in the list.** Rejected: the list would name the whole
organisation in every open project. It would then say nothing about who works there, and nobody would have chosen
to be there.

**Drop open projects, and make every project invite-only.** Rejected: a person could not find and join work
without asking an admin. An organisation that wants its work visible to everyone loses that.

**Let a person read an open project's work before joining.** Rejected: every tool would need a version that shows
but does not act. A person deciding whether to join needs to know what the project is, not to read its work.

## Decision

**An open project is one anyone in the organisation may join, in one step, without asking.** Only its members act
in it: talk to its agents, start, stop or change its work, and approve its agents' requests. Before joining, a
person in the organisation sees what the project is (its description, lead, people and agents, and how busy it is),
but not its work.

**A private project is unchanged:** its admins decide who is a member, and it is not shown to anyone else.

**The member list is everyone who can act**, in an open project and in a private one alike.

## What this binds

- Every check of "may act in this project" asks for membership. It does not ask whether the project is open.
- Whether a project is open decides only two things: who may see what the project is, and who may join it. It
  never decides who may act, or who may read its work.
- Anything that lists or counts a project's people reads the member list, including pickers for whom a task is done
  on behalf of, and the project lead.
- Undoing it returns every open project to letting the whole organisation act in it.

## Consequences

### Positive
- A project's people are the people who chose to work in it, and the screens can say so.
- A run in an open project is always started by a member.

### Negative
- One more step, Join, before a person can work in an open project they have just found.

### Risks
- People who were acting in open projects without being listed lose that until they join. Nothing has been
  released yet, so no install carries such people.

## References

- adr-0062 — people are members, agents are assigned; this record replaces its meaning of an open project
- adr-0060 — authority comes from the boundary
- adr-0095 — a run is on behalf of whoever started it

> **Acted on.** *(annotated 2026-10-12)* Carried out by the unit of work `2026-10-06-every-screen-reviewed`, plan 3.17–3.18, merged to `main` on 2026-10-12 and verified by
> the full regression and the owner's walkthroughs.
