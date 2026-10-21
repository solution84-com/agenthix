---
created: 2026-09-28
description: A conversation's authority to act through the platform is its current turn's capability, read at the start of every turn, and it has none between turns — so a change to an agent's permissions reaches the next turn, and a process left running cannot act through the platform.
---

# ADR-0082: A Conversation Acts With Its Current Turn's Authority, and None Between Turns

**Status:** Accepted

## Context

hq signs a capability for every run, and a run is one turn of a conversation. The container reaches the
platform's tools with an opaque token that the site resolves to that capability, and until now the
token died with its run: Claude starts a new process every turn, holding that turn's token.

A harness process can now outlive a turn (adr-0081), and so can processes a conversation starts
(adr-0083). Something has to say which authority a long-lived conversation acts with, and what a
process left running between turns may do through the platform.

## Options considered

- **Authority fixed for the harness process's life**, one capability per container. Rejected: hq would
  sign a new kind of capability, and a change to an agent's permissions would wait for a restart.
- **Authority fixed for a conversation until it is resumed.** Rejected: the site would have to keep a
  capability alive and renewing after its run ended, and a removed permission would keep working until
  the next resume — which in a busy container can be hours.

## Decision

**A conversation acts with its current turn's authority.** The token a conversation uses to reach the
platform resolves, during a turn, to the capability hq signed for that turn's run, and a resumed
conversation acts with the current one. A change to an agent's permissions reaches the conversation's
next turn; a turn already running finishes on the capability it started with.

**Between turns it resolves to nothing.** A process a conversation left running can use its container's
files and network, and cannot act through the platform.

The design is in the unit's [design spec](../work/2026-09-27-model-vendor-independence/spec.md), §2.

## What this binds

- **Every runtime**, present or future, reaches the platform with a token that resolves only during a
  turn, and only to that turn's capability.
- **hq keeps signing one capability per run.** Nothing may hold a capability past its run.
- **Audit records each call against the run it happened in.**

Undoing it means either permissions that lag behind hq, or processes that act through the platform when
nobody is running them.

## Consequences

### Positive

- A permission removed in hq stops working at the next turn, whatever runtime the conversation uses.
- A long-lived process cannot act as the agent between turns.

### Negative

- A long-lived runtime needs a token per conversation that the site re-points at every turn, where a
  process-per-turn runtime needs only a token per run.

### Risks

- **A token that is not cleared at the end of a turn** lets a leftover process act with the last turn's
  authority. Clearing it belongs on the same path that ends the run, including when the run fails.

## References

- adr-0060 — authority comes from the boundary
- adr-0081 — a harness runs the way its vendor intends, and stays warm while its conversations are live
- adr-0083 — a process belongs to the conversation that started it
- [Design spec — model vendor independence](../work/2026-09-27-model-vendor-independence/spec.md)

> **Acted on.** *(annotated 2026-10-17)* By the unit of work
> [`2026-10-16-conversational-experience`](../work/2026-10-16-conversational-experience/plan.md): a turn of a conversation
> whose record is in hq calls hq's tools in process with a capability minted for that turn, for the author of the
> message it answers (adr-0127), and never stored. Its workers keep the per-run capability this record describes.
