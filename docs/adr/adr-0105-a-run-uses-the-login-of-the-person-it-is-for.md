---
created: 2026-10-11
description: A run uses the model access of the person it is for, in a project as in their own Chat, unless the project holds its own; the organisation's comes last. A person's login goes only to runs that run as that person; a task's run in a project, which runs as the project, gets their key instead.
---

# ADR-0105: A Run Uses the Login of the Person It Is For

**Status:** Accepted

## Context

Every run is on behalf of one person and bounded by them (adr-0095, adr-0101). Model access did not follow: a run in
a person's own Chat used their own login, then the organisation's; a run in a project used the project's login, then
the organisation's, never the person's own. A Claude subscription belongs to one person, so the organisation's or a
project's is used only while the organisation has one person. An organisation of several people with subscriptions
only therefore had no model access for project work at all, and development worked around it with a switch,
`AGENTHIX_DEV_SHARED_SUBSCRIPTION`, that shared one subscription among every test user. The question of who should hold
the keys is open; this records its first part.

## Options considered

**Keep the project and the organisation first, and the switch for development.** Rejected: a team using
subscriptions cannot run project work, and development tests a path no real install takes.

**The person's own first, even where the project holds a key.** Rejected: a project holds its own key because the
organisation decided to pay for that project's work, not each person's.

**A task's run in a project runs as its person, so it can be handed their login.** Deferred: a task's run runs as
the project, in one harness home shared by every task run in it, so a login placed there could be read by another
person's run. Running task runs as their person is a protocol change, and a task carried on by several people would
then hold its agent's memory in several homes. Raised as later work.

## Decision

**A run uses the model access of the person it is for, wherever it runs — unless its project holds its own. The
order is: the project's (in a project), then the person's own login, then their own key, then the organisation's.
A person's login goes only to a run that runs as that person.**

- The person is the one adr-0095 names: whoever started the run, or the task's or the routine's person for a run
  nobody started.
- A person's login is handed only to a run whose runner is that person — their Chat, their personal project, their
  own conversation in a project — into their own harness home on the site. A task's run in a project runs as the
  project in a shared home, so it is given the person's own API key instead, which the site's model relay adds to each
  request and which never enters the home.
- The one-person rule for the organisation's and a project's subscription stands. Their API keys are unchanged.
- The development switch `AGENTHIX_DEV_SHARED_SUBSCRIPTION` stays, honoured only in a development build: one
  developer's subscription shared among test users, so task runs can be tested without an API key.

## What this binds

- Every path that resolves a run's model access asks the project, then the run's person, then the organisation.
- A credential owned by a person is used only for runs on that person's behalf, and a login only where the run runs as them.
- Whether the organisation's fallback key stays, a project's key's place, and what a host provides remain open,
  decided with host management.

Undoing it means project conversations without model access for any team that uses subscriptions.

> **Acted on.** *(annotated 2026-10-12)* Carried out by the unit of work `2026-10-06-every-screen-reviewed`, plan 3.35, merged to `main` on 2026-10-12 and verified by
> the full regression and the owner's walkthroughs.

> **Acted on.** *(annotated 2026-10-17)* By the unit of work
> [`2026-10-16-conversational-experience`](../work/2026-10-16-conversational-experience/plan.md): a conversation's turns in hq
> resolve an API key in this record's order — in a project, the project's first — and a task's thread uses the
> project's then the organisation's, never a person's (adr-0127). A turn never uses a login; runs keep this record's
> order unchanged.
