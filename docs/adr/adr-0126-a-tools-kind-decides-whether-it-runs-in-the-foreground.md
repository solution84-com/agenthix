---
created: 2026-10-17
description: Whether a conversation's operation runs in the foreground or the background is decided by the tool's kind, not the lead — a tool with no model in it is waited on up to a short limit and then detached, never restarted; a worker or a task is background at once — and the lead never waits on a worker.
---

# ADR-0126: A Tool's Kind Decides Whether It Runs in the Foreground or the Background

**Status:** Accepted

## Context

The lead (adr-0121) must answer at the speed of a conversation while it calls tools and commissions work. Some calls
return in milliseconds; a harness run takes tens of seconds at the least; a call expected to be quick is sometimes
slow. A turn that holds inference while it waits leaves the person facing a typing indicator, and a call cut off and
retried can do its side effect twice.

## Options considered

**The lead decides, call by call, whether to wait.** Rejected: a model's guess at how long a call will take, made on
every call, and wrong whenever a worker is involved.

**Wait on everything, with a turn timeout.** Rejected: a worker never fits a wait a conversation can bear, and a
timeout that cancels a call loses or repeats its side effect.

**Cancel and retry a slow call in the background.** Rejected: a retried call can do its side effect twice.

## Decision

**The tool's kind decides.** A tool with no model in it — one of hq's own operations, a read from a site, a person's
connected service — runs in the **foreground**: the turn waits up to a short **wait limit** the platform enforces, and
a call still running then is **detached, never cancelled or restarted**: the same call finishes on its own and its
result comes back as a completion. **A worker and a task are background by kind**: they detach at once. **The lead
never waits on a worker.** The lead may send a foreground call to the background when the person asked to keep
talking, never the reverse. An `Operation` row is created before any call that may outlive its turn.

## What this binds

- Every tool offered to the lead is classed as foreground or operation-returning, by what it is.
- No conversation turn holds inference beyond the wait limit, for any tool.
- Anything that may outlive a turn has its operation row before it starts, so detaching, approval, cancelling,
  idempotent admission and counting live work all rest on that one row.
- A call that cannot continue durably after detaching is not offered as foreground until it can.

Undoing it means turns that wait on work, or calls whose side effects may run twice.

## Consequences

### Positive
- The conversation stays available while work runs; a quick call costs nothing extra.
- A slow call costs the person nothing but a later card.

### Negative
- Every result that arrives after its turn needs a turn of its own to be presented.

### Risks
- A call detached at the wait limit is still running when the person moves on; its result may arrive when it is no
  longer wanted, and is presented once.

## References

adr-0075, adr-0082, adr-0121. The design is the unit's
[conversation layer](../work/2026-10-16-conversational-experience/spec/conversation-layer.md) and
[workers and results](../work/2026-10-16-conversational-experience/spec/workers-and-results.md) parts.

> **Acted on.** *(annotated 2026-10-17)* Carried out by the unit of work
> [`2026-10-16-conversational-experience`](../work/2026-10-16-conversational-experience/plan.md), phases 1 and 2, behind the `conversations` flag
> (adr-0116). A reply that keeps looking things up past a few steps is moved to the background by hq in the same way.

> *(annotated 2026-10-18)* The `conversations` flag was removed by the desktop shell unit; this is always on.
