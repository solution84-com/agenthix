---
created: 2026-10-07
description: Every conversation belongs to one place — a project, or its person's own space shown as Chat — fixed when it starts. A project's conversations use only that project's agents and work in its storage; a conversation in the person's own space may use any agent and works in their storage.
---

# ADR-0096: A Conversation Belongs to a Place

**Status:** Accepted

## Context

hq became conversation-first: a person talks to agents in a place, with that place's tools beside the
conversation. Until then a chat was global. It had no project, any agent could be picked, and it worked
wherever its session pointed; a project's work happened on its pages, apart from any conversation.

A conversation started from a project is about that project. It should see the project's tools and files,
and be answered by the agents the project has, not by any agent in the organisation. A person also needs a
place of their own for everything that is not a project's.

## Options considered

**Conversations stay global, and a project only filters them.** Rejected: a conversation would work in no
particular storage, could use an agent the project never chose, and the tools beside it would be guessed.

**A conversation can belong to several projects.** Rejected for now: projects can sit on different sites,
and a run works in one boundary (adr-0060). Questions spanning projects are left to cross-project coordination, later work.

## Decision

**Every conversation belongs to one place, fixed when it starts.**

- **A project:** a conversation started from a project is created with the project as its primary location
  (adr-0039). It works in the project's storage, with the project's authority, and uses only the project's
  agents; one that is not the project's is refused when the conversation is created.
- **The person's own space, shown as Chat:** a conversation started there, or from Home, works in the
  person's own storage, as the person's personal project does, and may use any agent in the organisation.
- **It does not move.** A conversation is never re-placed; a new one is started in the other place.
- **Its content stays its person's** (adr-0041, adr-0077): a project's conversations list shows each person
  only their own. A task's session is not a conversation in this sense; it is shared with its project
  (adr-0095).

## What this binds

- **Every path that creates a conversation names its place**, and a project conversation's agent is checked
  against the project when it is created.
- **The tools shown beside a conversation are its place's.**
- Undoing it means global conversations again, with no storage or agent rule of their own.

## Consequences

### Positive
- A conversation sees the right files and tools, and is answered by the project's own agents.
- A person's own work has one place, Chat, rather than a global list beside a personal project.

### Negative
- A conversation that turns out to be about another project cannot be moved; a new one has to be started.

### Risks
- An agent removed from a project after a conversation started is checked only at creation; the
  conversation's later turns still use it.

## References

- adr-0039 — files and workspaces; a run's primary location
- adr-0041, adr-0077 — a conversation's content is its person's
- adr-0060 — authority comes from the boundary, never a union
- adr-0095 — a run is on behalf of whoever started it; a task's session is shared

> **Acted on.** *(annotated 2026-10-12)* Carried out by the unit of work `2026-10-06-every-screen-reviewed`, its places, a project and Chat (phases 1–2), merged to `main` on 2026-10-12 and verified by
> the full regression and the owner's walkthroughs.

> **Acted on.** *(annotated 2026-10-17)* Extended by the unit of work
> [`2026-10-16-conversational-experience`](../work/2026-10-16-conversational-experience/plan.md) with a third
> home, a task, whose place is its project and whose thread is the team's: who may read, speak and pay by home is
> adr-0127. A conversation may commission work outside its place, each operation authorised for its own boundary.

> *(annotated 2026-10-18)* The person's own space is now *Your space* (`/space`), with its own entry in the navigation, and the Chat
> page lists its conversations. The tools shown beside a conversation are no longer its place's: the conversation is
> docked beside whatever page the person opens (adr-0128). A conversation still belongs to one place, as decided here.

> *(annotated 2026-10-25)* What a conversation reaches beyond its place is bounded by adr-0152: its own place, the
> organisation's knowledge, the platform guide, and the places its person added. It still belongs to one place, as
> decided here.
