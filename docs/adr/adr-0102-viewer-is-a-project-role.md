---
created: 2026-10-09
description: Whether someone may work is decided per project. The organisation's roles are Admin and Member; a project's are Admin, Member and Viewer, and a project Viewer only reads.
---

# ADR-0102: Viewer Is a Project Role

**Status:** Accepted

## Context

There are two sets of roles. The organisation's are Admin, Operator and Viewer; a project's are Admin and Member
(adr-0062). An organisation Viewer reads and never starts or changes work, in every project at once. People read
"Viewer" beside a project as being about that project. Nobody can be read-only in one project and fully involved
in another, and a person can be a project's Admin while unable to talk to its agents because of their organisation
role. All work happens inside a project.

## Options considered

**Keep Viewer an organisation role, renamed to say so.** Rejected: it still cannot vary by project, and the clash
between a project Admin and an organisation Viewer stays.

**Have both.** Rejected: two switches answering one question, read differently in different places.

## Decision

**Whether someone may work is the project's to decide.**

- **The organisation's roles are Admin and Member.** An Admin runs the organisation: its people, agents, projects
  and settings.
- **A project's roles are Admin, Member and Viewer.** An Admin runs the project: its people, agents, permissions and
  settings. A Member works in it: talks to its agents, starts, stops and changes work, comments and approves. A
  **Viewer only reads**: everything a member reads, and nothing else.
- **Joining an open project makes you a Member** (adr-0099). A project that wants newcomers read-only is private,
  with people added as Viewers.

## What this binds

- Every check of "may this person work here" reads their role in that project, in the browser and for every run on
  their behalf (adr-0101). No organisation role grants or withholds work in a project.
- An organisation role decides only what is organisation-wide.

Undoing it means bringing back an organisation-wide switch over work that lives in projects.

## Consequences

- adr-0062's roles are replaced by these; the rest of adr-0062 stands, as amended by adr-0099.
- Nothing has been released, so no stored role is converted: development data is reset.

> **Acted on.** *(annotated 2026-10-12)* Carried out by the unit of work `2026-10-06-every-screen-reviewed`, plan 3.22, merged to `main` on 2026-10-12 and verified by
> the full regression and the owner's walkthroughs.
