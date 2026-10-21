---
created: 2026-09-28
description: Every harness behind the runtime interface is run the way its vendor intends — for both Claude Code and OpenCode that means staying warm across a conversation's turns — and a warm harness is ended when the conversations it serves go idle.
---

# ADR-0081: A Harness Runs the Way Its Vendor Intends, and Stays Warm While Its Conversations Are Live

**Status:** Accepted

## Context

Agenthix runs two harnesses behind the runtime interface (adr-0019): Claude Code, through the Claude
Agent SDK, and OpenCode (adr-0073). Neither is Agenthix's own, and each is upgraded on its vendor's
schedule. A harness used in a way its vendor does not intend is a harness whose next release can break
Agenthix without anyone having changed anything here.

Claude was run as a new process per turn, fed one message. Its vendor's documentation calls streaming
input — one long-lived process fed a stream of messages — the preferred mode, reserves single-message
input for one-shot and stateless work, and supports interrupting a turn only in streaming mode. It
describes a chat as long-running sessions, each held by a live process, with idle sessions spun down and
resumed. OpenCode's documentation describes one server that every interface is a client of, and adds a
way to attach to a running server specifically to avoid cold starts.

Measured in the agent container, a new Claude process costs a turn about 0.25 s and a warm one about
250 MB; a new OpenCode server costs a turn about 2.4 s and holds 0.3–0.7 GB. Speed is the most important
quality of a conversational agent; memory matters on a machine that is often a person's own.

## Options considered

- **A new harness process per turn, for every runtime.** Rejected: 2.4 s on every OpenCode turn, and
  Claude outside its intended mode.
- **Warm only where starting costs a second or more** — OpenCode warm, Claude per turn. Rejected: it
  saves memory by running Claude in the mode its vendor reserves for one-shot work, and gives up what a
  chat needs from it — interrupting a turn, and queueing a message sent while one runs.
  *(2026-09-29: the verification phase found that cancelling a turn works in single-message mode too,
  because the SDK always runs the CLI with streaming input and output; what that mode lacks is a process
  that outlives the turn. The decision stands on the vendor's guidance and the start-up cost. See the
  unit's design spec, §1.)*

## Decision

**Every harness is run the way its vendor intends.** For both harnesses Agenthix runs today, that means
**staying warm across a conversation's turns**:

- **Claude Code:** one process per live conversation, fed each turn through streaming input.
- **OpenCode:** one server per container, shared by every conversation in it.

**A warm harness ends when the conversations it serves go idle**, by the same idle timer that ends a
conversation's other processes (adr-0083). A Claude process is also replaced when it passes a memory
ceiling, as its vendor advises, and when what was fixed at its start no longer matches its next turn.
The next turn resumes the conversation from the harness's own record.

The analysis and the design are in the unit's
[harness lifetime analysis](../work/2026-09-27-model-vendor-independence/harness-lifetime-analysis.md)
and [design spec](../work/2026-09-27-model-vendor-independence/spec.md).

## What this binds

- **A new runtime is built the way its vendor intends**, and checked against that vendor's guidance when
  it is adopted and whenever it is upgraded, alongside the check adr-0080 requires.
- **Nothing may assume a harness process ends with its turn.** Anything per turn is applied per turn,
  or forces the process to be replaced (adr-0082).
- **Every warm harness has an end**: its conversations' idle timer, and for a process that grows, a
  memory ceiling.

Undoing it means running a harness outside its intended use, and owning whatever that breaks at each of
its upgrades.

## Consequences

### Positive

- A turn in a live conversation starts without a process start, in either runtime.
- A turn can be interrupted, and a message sent into a running turn can be queued, as the harness
  supports.
- Each harness's upgrades are tested by its vendor on the path Agenthix uses.
  *(2026-09-30: except OpenCode's file tools, which Agenthix replaces with its own so the harness
  cannot be made its agent's confused deputy; they are compared with the vendor's at each upgrade.
  See adr-0085.)*

### Negative

- Memory grows with live conversations for Claude and with active containers for OpenCode, until their
  idle timers end them.
- The first turn after a harness was ended pays its start-up: about 0.25 s for Claude, 2.4 s for
  OpenCode.

### Risks

- **One OpenCode server serves several conversations.** A way for one conversation's state to reach
  another on it — tools, approvals, configuration — is a leak between conversations, though never
  between people, since a container belongs to one runner (adr-0074).
- **A long-lived process may drift** from a fresh one — credential refresh, reconnecting to the
  platform's tools. Replacing it is always correct, because every conversation resumes from its record.

## References

- adr-0019 — the runtime interface
- adr-0073 — OpenCode replaces `NativeRuntime`; Claude keeps its own runtime
- adr-0074 — a container is keyed on its boundary and its runner
- adr-0075 — only a conversation's turns are ordered
- adr-0076 — a conversation whose harness state is gone is closed
- adr-0080 — each runtime's start-up is checked when the harness is upgraded
- adr-0082 — a conversation acts with its current turn's authority
- adr-0083 — a process belongs to the conversation that started it
- adr-0085 — where Agenthix replaces a harness's file tools

> **Confirmed for workers.** *(annotated 2026-10-17)* Since adr-0121 a conversation whose record is in hq talks
> through direct inference in hq and runs no harness process of its own. This record keeps applying, unchanged, to
> every harness session: a conversation's standing workers, a task's session, and conversations from before.

> *(annotated 2026-10-18)* No conversation from before is reachable any more; this record applies to a conversation's
> workers and a task's session.
