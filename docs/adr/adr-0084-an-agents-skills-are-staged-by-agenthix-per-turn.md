---
created: 2026-09-29
description: An agent's skills reach it from a set Agenthix stages for that turn and that session, in every runtime — never from a harness's own skill discovery, which is shared by everything the harness serves.
---

# ADR-0084: An Agent's Skills Are Staged by Agenthix per Turn, Never Taken from a Harness's Own Discovery

**Status:** Accepted

## Context

Skills come from several sources — the platform, the organisation, the agent's own package, and the
boundary's disk — and two sources, or two agents, may have a skill with the same name and different
content. A skill on the boundary's disk can change between one turn and the next.

Claude Code has always been given a folder staged for its run, each source under its own namespace, so a
run sees exactly its agent's skills as they are at that turn.

OpenCode runs as one server shared by every conversation in a container (adr-0081), and they may belong to
different agents. Its own skill discovery builds one pool per working directory, keyed by name, and reads
it once; its per-agent support filters that pool by name. Two agents' same-named skills cannot coexist in
it, and a change is only picked up by discarding the directory's state, which cancels every turn running
there. It also discovers skills from folders an agent can write.

adr-0081 says a harness is run the way its vendor intends. Here the vendor's skill discovery assumes one
person's fixed agents in one project, which a shared server is not.

## Options considered

- **OpenCode's native per-agent skills**: an OpenCode agent per Agenthix agent, skill names prefixed per
  agent, and the directory reloaded at each quiet moment. Rejected: skills are renamed, and changes and
  newly added agents wait for a reload.
- **A platform tool that loads skills**, on each conversation's own connection to the platform. Rejected:
  a network hop per load, and a tool name models do not expect.
- **A harness server per agent**, so native discovery sees one agent. Rejected: a server's memory per
  agent, and the same caching.

## Decision

**An agent's skills are staged by Agenthix for each turn and each session, in every runtime**, from the
same sources and under the same namespaces, and the model is given only that set. A harness's own skill
discovery is never relied on.

For OpenCode, Agenthix's plugin replaces the `skill` tool with one that reads the calling session's
staged folder, and the skill list is sent with each turn's prompt — the same two steps, list and load, the
model sees natively.

The design is in the unit's [design spec](../work/2026-09-27-model-vendor-independence/spec.md), §7.

## What this binds

- **Every runtime**, present or future, is given its skills from Agenthix's per-turn staging, and turns
  off or ignores the harness's own discovery.
- **A skill's name is the same in every runtime.**
- **Nothing an agent writes becomes a skill** except through the boundary sources Agenthix stages and
  checks.
- **Using a harness as its vendor intends (adr-0081) stops where the harness assumes one person's fixed
  set of agents**; there, Agenthix supplies the per-agent part through the harness's documented extension
  points.

Undoing it means either renamed skills and reloads that wait on other turns, or a harness per agent.

## Consequences

### Positive

- An agent sees the same skills under the same names on either runtime, as they are at that turn.
  *(2026-09-30: on Claude, the staged skills are given as a local plugin, and Claude's own list labels
  each one `agenthix:<name>`; the name a model calls, and `/name`, are the same on both runtimes. A staged
  skill's header is rebuilt from an allowlist of keys, so it carries no hooks, and inline shell is off.)*
- Agents sharing a harness never see each other's skills.

### Negative

- Agenthix keeps its own `skill` tool for OpenCode in step with the built-in one at each OpenCode upgrade.

### Risks

- **An OpenCode release could stop honouring a plugin tool that replaces a built-in**, or change the
  built-in's output. The upgrade check compares them; the fallback is a tool under Agenthix's own name.

## References

- adr-0074 — a container is keyed on its boundary and its runner
- adr-0080 — a run never carries a person's own connected accounts
- adr-0081 — a harness runs the way its vendor intends
- adr-0082 — a conversation acts with its current turn's authority
- [Design spec — model vendor independence](../work/2026-09-27-model-vendor-independence/spec.md)
