---
created: 2026-09-28
description: When a harness no longer holds a conversation's state, the conversation is closed visibly rather than silently restarted, and every runtime checks that the state exists before resuming instead of inferring it from error text.
---

# ADR-0076: A Conversation Whose Harness State Is Gone Is Closed, Never Silently Restarted

**Status:** Accepted

## Context

Our session and the harness's session share one id, and a conversation continues only while the
harness still holds its state. That state can go: a harness home is removed, a runtime prunes it, a
container path changes.

When it goes today, the Claude runtime recognises the failure by matching error text — one pattern
being the catch-all "exited with code 1", which also matches unrelated failures such as a misconfigured
MCP server — and starts a fresh harness session under the same id. The person sees their whole history
on screen while the agent answers from a clean slate, and nothing tells them.

## Options considered

- **Continue from a clean slate, visibly.** Rejected: the replies are still disconnected from the
  history on screen.
- **Rebuild the harness's context from our own record.** Rejected for now: it makes Agenthix build a
  harness's context, which it has decided not to own (adr-0073), and the rebuild is lossy. It can be
  added later if closed conversations prove a nuisance.
- **Keep detecting a gone session from error text.** Rejected: a false match would close a healthy
  conversation, now that the answer is to close it.

## Decision

> **The decision holds for every harness session; a conversation whose record is in hq is no longer one.**
> *(annotated 2026-10-17)* Since adr-0121 a conversation's record is hq's and a harness session is its worker in a
> boundary. When a worker's harness state is gone, the site still closes that session as this record says, and never
> restarts it under its id; hq gives the boundary a fresh worker session and the conversation goes on, since its
> history never depended on the harness. A task's session and a conversation from before are still closed as here.

> *(annotated 2026-10-18)* No conversation from before is reachable any more; a task's session is still closed as here.

**A conversation whose harness state is gone is closed**, with a reason, and shown as closed: its full
history, a notice that the agent no longer has its context, no way to send into it, and a way to start
a new conversation with the same agent. It is never silently restarted.

**Before resuming, a runtime asks the harness state whether the conversation exists.** Each runtime
implements that check against its own state; the engine acts on the answer the same way whichever
runtime gave it. Existence is never inferred from error text.

This is a rule every runtime behind the runtime interface (adr-0019) must honour, present or future.

The design is in the unit's [design spec](../work/2026-09-28-person-scoped-execution/spec.md).

## What this binds

- **Every runtime implements an existence check** for a conversation, and resumes only on its answer.
- **No runtime starts a fresh harness session under an existing conversation's id.**
- **A closed conversation stays closed.** Anything that later restores context from our record does so
  as a new, deliberate feature, recorded as such.

Undoing it means returning to replies that do not match the history the person is looking at.

## Consequences

### Positive

- What a person sees and what the agent knows can no longer disagree without anyone being told.
- A misread error no longer decides a conversation's fate.

### Negative

- A person whose harness state is lost must start a new conversation and lose the agent's context of
  the old one.
- Every runtime carries one more obligation.

### Risks

- **An existence check that answers wrongly closes a healthy conversation.** Each runtime's check has to
  read the harness's own state directly, never a proxy for it.

## References

- adr-0019 — the runtime interface the check belongs to
- adr-0073 — why Agenthix does not own a harness's context
- adr-0074 — where harness state is kept, and what removes it
- [Design spec — person-scoped execution](../work/2026-09-28-person-scoped-execution/spec.md)
