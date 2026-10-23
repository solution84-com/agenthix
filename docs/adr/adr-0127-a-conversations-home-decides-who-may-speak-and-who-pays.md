---
created: 2026-10-17
description: A conversation's home — a person's space, a project, or a task — decides who may read and speak in it and whose model access pays for its turns; a person's or project conversation is one person's, a task's thread is the team's and the project pays, and each turn acts as the author of the message it answers.
---

# ADR-0127: A Conversation's Home Decides Who May Speak in It and Who Pays

**Status:** Accepted

## Context

A conversation belongs to a place (adr-0096), and its content was its person's alone. A task now has a conversation
of its own, its thread, in which anyone working on the task may speak, so one thread can have several authors. With
the lead in hq (adr-0121), every turn is a model call hq makes, and someone's access has to pay for it. Who may read a
conversation, who may speak in it, whose authority a turn acts with and who pays have to follow from one rule, or a
team thread would run on whichever person happened to type.

## Options considered

**One rule for every conversation: whoever opened it reads it and pays.** Rejected for a task's thread: it is the
team's, and a member's personal key would pay for the project's work, or the thread would stop when that member left.

**Let a Claude subscription pay for a conversation, through a harness turn.** Rejected (adr-0121): a subscription is a
person's own sign-in to the vendor's tools on a site, not an access for hq's direct inference.

## Decision

> ⚠️ **Superseded by adr-0141 — who pays only.** The key order of project, person and organisation is gone: the
> resolver gives each call a provider (adr-0139) and the ledger costs it to a billing profile, a project's or the
> organisation's default. Who may read and speak in a conversation, and whose authority a turn acts with, still stand.

**A conversation's home decides who may read and speak in it, and who pays.**

- **A person's space or a project:** the conversation is one person's. Only that person reads and speaks in it, and
  it is paid for by their access — in a project, the project's key first, then the person's own, then the
  organisation's; in the person's space, the person's own, then the organisation's.
- **A task:** the thread is the team's. Anyone who can see the task reads and speaks in it; its lead is the task's
  agent, whoever that is now; and **the project pays** — the project's key, then the organisation's, never a person's —
  on the project's talking model.

**A turn acts as the author of the message it answers** — that person's membership, tool permissions and memory — and
a turn that answers no one acts with the home's reading authority. Whoever answers an approval must pass the same checks
as the one who asked.

## What this binds

- Every check on reading or sending a conversation's messages takes its rule from the conversation's home.
- Every resolution of a conversation's model access follows the home's order above; a person's credential never pays
  for a team thread.
- Every capability a turn holds is minted for that turn's author (adr-0082), never for the conversation's opener.
- adr-0096 stands: every conversation belongs to one place, and a project's list shows each person only their own;
  a task's thread is the task's, shown with it and not in that list.

Undoing it means a team thread that one person's access pays for and one person's authority acts in.

## Consequences

### Positive
- A team thread carries on when people come and go, and the project pays for its own work.
- Several people in one thread each act with exactly their own authority.

### Negative
- A task's thread needs a key on the project or the organisation; without one it says so.

### Risks
- A personal conversation's access order changes with its home, so the same person can pay differently in their
  space and in a project.

## References

adr-0082, adr-0095, adr-0096, adr-0101, adr-0105, adr-0121. The design is the unit's
[spec](../work/2026-10-16-conversational-experience/spec.md), *Who a person talks to*, and its
[model access and policy](../work/2026-10-16-conversational-experience/spec/model-access-and-policy.md) part.

> **Acted on.** *(annotated 2026-10-17)* Carried out by the unit of work
> [`2026-10-16-conversational-experience`](../work/2026-10-16-conversational-experience/plan.md), phases 1, 2 and 6, behind the `conversations` flag
> (adr-0116), on API keys. A person's ChatGPT plan, first in the order for their own conversations in the design, is
> not yet built: it waits on a client id from the vendor.

> *(annotated 2026-10-18)* The `conversations` flag was removed by the desktop shell unit; this is always on.
