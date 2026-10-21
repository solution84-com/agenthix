---
created: 2026-10-10
description: A team of people and agents can be one member of a project, added and removed as a unit. Joining writes each member through, so every access check reads project membership exactly as before.
---

# ADR-0103: A Team Joins a Project as One Member

**Status:** Accepted

## Context

A team is a group of people and agents with a purpose (Marketing, Support). Organisations want a team to work on a
project as a unit: added in one step, removed in one step, and kept in step when the team changes. Today a
project's members are people (`ProjectMember`) and its agents (`ProjectAgent`), and every check of who may see or do
what in a project reads those two tables: 22 files read the first and 12 the second, the access checks among them
(adr-0099, adr-0101, adr-0102).

## Options considered

**Resolve the team at every check.** The team itself is the member, and each check also asks whether the person or
agent is in a team that is in the project. Rejected: it changes every read of membership, the security checks
among them, and each future check must remember the second path.

## Decision

**A team joins a project as one member, written through to its members.**

- **Adding a team** records the team on the project with one project role (Admin, Member or Viewer), and writes
  each of its people and agents into the project's members, marked as being there through that team.
- **Removing a team** removes everyone who is there only through it. Anyone also added in person, or through another
  team, stays. Like removing a person, it first asks what happens to the open tasks of those leaving.
- **A change to the team follows it into every project it is in:** someone added to the team joins them, someone
  taken out leaves those they were in only through the team.
- **A member who is there through a team is changed through the team**, not on their own. A person who is also a
  member in their own right keeps that membership and its role. The higher of the two roles applies.

## What this binds

- Every access check keeps reading the project's members as it does now; no check learns about teams.
- Every write that adds or removes a project member, or changes a team, keeps the written-through members in step
  with the teams they came from.

Undoing it means teaching every access check about teams, or giving up removing a team as a unit.

## Consequences

- A team owns nothing and grants nothing beyond the project memberships it writes.
- Nothing has been released, so no stored membership is converted: development data is reset.

> **Acted on.** *(annotated 2026-10-12)* Carried out by the unit of work `2026-10-06-every-screen-reviewed`, plan 3.30–3.31, merged to `main` on 2026-10-12 and verified by
> the full regression and the owner's walkthroughs.
