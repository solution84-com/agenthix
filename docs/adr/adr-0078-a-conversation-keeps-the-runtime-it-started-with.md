---
created: 2026-09-28
description: Each conversation records its runtime when it is created and keeps it; an agent's runtime is an editable setting that applies only to its new conversations.
---

# ADR-0078: A Conversation Keeps the Runtime It Started With

**Status:** Accepted

## Context

adr-0073 kept `ClaudeSDKRuntime` as the path to Claude, retired `NativeRuntime` in favour of OpenCode,
and said that every agent's runtime is fixed for its lifetime. adr-0072 lists runtime among an agent's
editable settings. The two disagree.

What the argument against running several harnesses actually requires is narrower. No harness can
resume another's state, so a *conversation* must never move between harnesses. Nothing requires an
agent to stay on one runtime.

## Options considered

- **Fix an agent's runtime for its lifetime.** Rejected: it contradicts adr-0072, and moving an agent
  to a different model would mean recreating it.
- **Close an agent's existing conversations when its runtime changes.** Rejected: the old harness's
  state is still in the home, so switching back would leave resumable conversations closed.
- **Move existing conversations to the new runtime.** Rejected: that needs Agenthix to rebuild one
  harness's context in another, which adr-0073 decided it does not own.

## Decision

> **The decision holds for every harness session; a conversation whose record is in hq has no runtime.**
> *(annotated 2026-10-17)* Since adr-0121 the conversation's own turns are direct inference in hq, and their talking
> model is the person's to change at any time, the switch written into the record. Each worker session keeps the
> runtime it began on; a brief whose model needs another runtime gets a fresh worker session in that boundary, so the
> conversation's work moves runtime without any session doing so.

**A conversation keeps the runtime it started with.** Each session records its runtime when it is
created, in the site's record and in hq's copy, and every turn runs in that runtime.

**An agent's runtime is an editable setting** (adr-0072) **that applies to its new conversations.**
Existing ones continue in the harness they began in, and nothing is closed.

**The rest of adr-0073's decision stands:** `ClaudeSDKRuntime` stays as the path to Claude,
`NativeRuntime` is retired with OpenCode as the second runtime, and the single-harness proposal is superseded as that record
states.

The design is in the unit's [design spec](../work/2026-09-28-person-scoped-execution/spec.md),
section 4.

## What this binds

- **A run resumes a conversation in the session's recorded runtime**, never the agent's current one.
- **Nothing moves a conversation between runtimes.**
- **A site runs every runtime a still-open conversation uses**, not only the agent's current one.

Undoing it means either freezing agents to one runtime or building context transfer between harnesses.

## Consequences

### Positive

- An agent can move to another runtime without losing or closing anything.
- Agenthix still owns no cross-harness context.

### Negative

- One agent can have conversations open in two runtimes at once, and people may not know which runtime
  a given conversation is using unless hq shows it.

### Risks

- **Retiring a runtime strands its conversations.** If a runtime is ever removed, its open
  conversations have to be closed (adr-0076), and that has to be decided when it happens.

## References

- adr-0073 — its Decision section (adr-0073-s-1) is superseded by this record; the rest stands
- adr-0072 — runtime is an editable setting of an agent
- adr-0076 — a conversation whose harness state is gone is closed
- [Design spec — person-scoped execution](../work/2026-09-28-person-scoped-execution/spec.md)
