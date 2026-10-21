---
created: 2026-10-14
description: A feature whose other side does not exist yet ships behind a flag named in one shared list, on in development and off in production, enforced where its operations run, and turned on only by a release.
---

# ADR-0116: A Feature Not Ready Ships Behind a Flag

**Status:** Accepted

## Context

Host management's design includes features that need Agenthix Cloud — connecting the organisation, Cloud's sites,
remote access through Cloud's relay, fleet admins on Cloud, the Cloud controller on a host service. Cloud's side does
not exist yet. The screens and commands should be visible while the platform is developed, so their place is settled,
without being reachable in a release.

## Options considered

**Leave the features out until Cloud exists.** Rejected: their screens and commands would be designed and placed
later, piecemeal, against a product already shaped without them.

**Keep them on a long-running branch.** Rejected: a branch that drifts from the line it must later merge into.

**Hide them in the screens only.** Rejected: a hidden route is still a route; anyone calling it directly would reach a
feature never meant to run.

## Decision

**A feature not ready ships behind a flag**, named once in a shared list in `@agenthix/core` that every program reads.
A flagged feature is **on in development and off in production**, and anything not plainly development or a test
counts as production, so a deployment that forgets to say fails closed: in production its screens and commands do not
appear, and **its routes and operations refuse where they run**, not only in the screen. Turning a flag on is a release
decision, made in the list, never a setting a person changes on their machine.

## What this binds

- Every server-side entry point of a flagged feature checks the flag before it acts.
- A flag is removed, with the feature turned on, in the release where the feature is complete.

Undoing it means features reachable before they are finished, or designed after the fact.

## Consequences

### Positive
- Coming features are visible in development and absent from a release, with nothing to turn on by hand.

### Negative
- Code that is shipped but off; each flag is a branch in the code until it is removed.

### Risks
- A flag left in place after its feature is done; each one names the feature and the condition for removing it.

## References

adr-0107, adr-0109.

> **Acted on.** *(annotated 2026-10-16)* Carried out by the unit of work
> [`2026-10-13-host-management`](../work/2026-10-13-host-management/plan.md), plan 1.11, 3.13–3.15, 4.7 and 4.13–4.14,
> merged to `main` at its close and verified by the close-out regression and the owner's walkthroughs.

> **Acted on.** *(annotated 2026-10-17)* Also by the unit of work
> [`2026-10-16-conversational-experience`](../work/2026-10-16-conversational-experience/plan.md): the conversation
> layer, memory recall, compaction, voice and the task's thread ship behind the `conversations` flag, checked by
> their operations and routes in hq; conversations from before are read-only while it is on.

> *(annotated 2026-10-18)* The `conversations` flag was removed by the desktop shell unit: the new conversations are always on, and
> chats from before are no longer listed or opened.

> *(annotated 2026-10-19)* The last flag, `pledge`, was removed by the unit of work
> [`2026-10-18-pre-release-and-cloud-support`](../work/2026-10-18-pre-release-and-cloud-support/plan.md): the pledge
> goes live with the first release. With no flag left, the list in `@agenthix/core` was removed too; the next feature
> that needs a flag brings it back as this record says. Cloud's features take no flag (ADR-0130).
