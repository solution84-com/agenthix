---
created: 2026-09-28
description: A process an agent starts belongs to the conversation that started it and ends when that conversation ends or has been idle for a machine-set time; nothing is reset when a turn ends.
---

# ADR-0083: A Process Belongs to the Conversation That Started It

**Status:** Accepted

## Context

When a container's last running turn ended, the site killed every process in it and emptied its scratch
folders. That reset was built for a container shared by everyone in a project, where files and
processes one person's run left behind reached the next person's run. The kill came first so the
scratch was never deleted under a process still using it.

Since a container is keyed on its boundary and its runner (adr-0074), the next run in a container is
always the same person's or the same project's. The reset no longer protects anyone from anyone. What it
still does is kill what a person meant to keep — a dev server, a watcher — and, since adr-0081, a
harness server itself.

Without it, something still has to stop processes nobody is using from holding the machine's memory
while their container stays busy with other conversations.

## Options considered

- **Keep the reset, and exempt the harness server** by making it the container's first process, which
  the kill spares. Rejected: it still kills every conversation's work whenever the container falls
  quiet, for a reason that ended with adr-0074.
- **Drop the reset and rely on removing idle containers.** Rejected: a container in use is never idle,
  so a conversation abandoned in a busy container keeps its processes indefinitely.
- **Reset the whole container when it is stuck or cannot be trusted.** Rejected as the model: processes
  belong to a conversation, as they belong to a terminal session, and are cleaned up with it.

## Decision

**A process belongs to the conversation that started it.** Every process a conversation starts, and
everything those start, carries the conversation's id in its environment.

**It ends with the conversation**: when the conversation is closed, deleted or its person leaves; and
when the conversation has been **idle** — no turn running — for a set time. A conversation that is idle
stays resumable; its next turn starts without those processes. A cancelled turn stops only its own
process.
*(2026-09-29: with harnesses kept warm (adr-0081), a cancel ends the turn and leaves the conversation's
harness running — a Claude process or the container's shared OpenCode server, which is started without a
conversation's tag and so belongs to none. The design spec, §3, has the detail.)*

**Nothing is reset when a turn ends.** No kill across the container and no scratch wipe. Removing an idle
container (adr-0049) remains the backstop that clears everything.

**The idle time is a machine setting**, owned by whoever runs the machine, like the container's own
limits; not an agent's setting and not hq's.

The design is in the unit's [design spec](../work/2026-09-27-model-vendor-independence/spec.md), §3.

## What this binds

- **Every runtime tags what a conversation starts** with its id, and nothing kills across a container
  when a turn ends.
- **Stopping a process means stopping a conversation's processes**, never every process in the
  container, except when the container itself is removed.
- **The idle time is set on the machine.** hq or project policy may narrow it later, never widen it.

Undoing it means choosing again between killing every conversation's work whenever a container falls
quiet, and letting abandoned processes run for as long as the container is busy.

## Consequences

### Positive

- Background work an agent starts survives between turns, as it would on a person's own machine.
- A long-lived harness server is never killed as a leftover.
- Cleanup follows ownership: one conversation's end never touches another's work.

### Negative

- Scratch files are no longer cleared between turns; they last until the container is removed.
- Finding a conversation's processes means reading every process's environment in the container.

### Risks

- **A process that clears its own environment** escapes the tag and lives until the container is
  removed. That is bounded by the container's limits and its idle removal.

## References

- adr-0057 — where the reset between runs was introduced, as the fix for residue between people's runs
- adr-0074 — a container is keyed on its boundary and its runner; its risk note on the reset is
  resolved by this record
- adr-0049 — idle containers are removed
- adr-0081 — a harness runs the way its vendor intends, and stays warm while its conversations are live
- adr-0082 — a conversation acts with its current turn's authority
- [Design spec — model vendor independence](../work/2026-09-27-model-vendor-independence/spec.md)

> **Confirmed for workers.** *(annotated 2026-10-17)* Since adr-0121 a conversation whose record is in hq starts no
> process itself; the processes in a container are its workers' harness sessions and what they start. This record
> applies to each of those sessions as it did to a conversation, and ending a worker session for being idle leaves the
> conversation in hq open.
