---
created: 2026-08-12
description: Partitioning what an agent knows about a person, stored per person and mounted only for that person.
---

# ADR-0048: Partitioning an Agent's Memory of a Person

**Status:** Superseded by adr-0058

## Context

One agent is talked to by several people. If what it records about one person is readable while it works for another, the agent becomes a channel between them — the classic confused deputy, where the trusted intermediary carries information across a boundary neither party crossed.

This is live today, not hypothetical. The system prompt asks the model to file what it learns under a per-person directory and a per-project directory inside its own private area. That instruction is the entire mechanism: no service reads or writes those directories, nothing validates the path, and the private area is bind-mounted whole on every run. The partition exists as a naming convention the model is asked to honour.

[ADR-0036](adr-0036-context-centric-security.md) proposed closing this by classifying every memory write — general, person-specific, project-specific, sensitive — and routing each to the matching owner's storage. That record names mis-classification leaks as a live risk, mitigated only by a conservative default. It was accepted and never implemented.

The weakness is not the quality of the classifier. It is that a classifier is a judgement made at write time, by the same model that has been reading untrusted input — documents, issue comments, web pages — in the same context window. Its failures are silent, and a wrong write is readable by everyone thereafter.

## Decision

**What an agent knows about a person is stored per person and mounted only for that person.**

`agents/<handle>/users/<userId>` is bind-mounted into the run's container only when that person is the invoker, at a container path carrying no identifier. Another person's run has no such path mounted and cannot name one outside its own partition.

Nothing is classified, because nothing needs to be: a conversation write has exactly one place it can land. The boundary is decided by which directory was mounted, before the model runs, and is enforced by the container's mount namespace rather than by the model's cooperation.

Two things are deliberately not this, and do not live with the agent:

- **Knowledge about a project** — its stack, conventions, constraints, decisions — belongs to the project. Every agent working that project benefits, it does not duplicate per agent, and the read boundary is project membership, which already exists.
- **Reusable know-how** is a skill. Skills already have scopes, versions and a catalogue; a second mechanism for the same thing is not needed.

What remains is a single sentence: memory is only ever about a person, and it lives with the agent that formed it.

## Consequences

### Positive

- The leak is closed by construction rather than by care. There is no judgement in the path, so there is no judgement to get wrong, and prompt injection has nothing to steer.
- Autonomous and scheduled runs have no invoker, so they mount no partition at all. A scheduled job cannot be steered into anyone's private context — a structural property, not a policy.
- What makes talking to one agent feel different from another becomes a real mechanism rather than an accident.

### Negative

- **What an agent knows about a person is trapped with that agent.** Delete the agent and its understanding of that person goes with it. Defensible — it is what happens when a colleague leaves — but it is a real change of ownership.
- **"Show me everything held about me" becomes a scan across agents** rather than reading one location. Still answerable, but weaker than single ownership would be.
- **Understanding does not converge.** Each agent learns a person separately. This is chosen deliberately, and it will surprise anyone who expects agents to share what they know.

### Risks

- **This cannot be enforced until a container belongs to a session.** The container name today derives from the agent handle alone, so one agent has one container regardless of who is talking to it — meaning there is no per-invoker mount to make, because there is no per-invoker container. [ADR-0049](adr-0049-the-session-is-the-container-boundary.md) decides that boundary and is unimplemented. **This record depends on it**, and is not enforceable before it lands.
- **Skills remain a channel between people, and this decision does not close it.** Skills are agent-scoped and shared across every invoker by design, so a skill written during one person's session is active in another's. Memory can be partitioned by mount because it belongs to one person; skills cannot, because being shared is their purpose. Nothing currently sits between an agent writing a skill and that skill taking effect. Unresolved, and recorded here so the memory fix is not mistaken for a complete answer.

## References

- [ADR-0036](adr-0036-context-centric-security.md) — §5's write-time scope classification is superseded by this record; §1's placement of a person's data in that person's own workspace is amended, the security property preserved and the mechanism changed
- [ADR-0049](adr-0049-the-session-is-the-container-boundary.md) — the isolation unit this record depends on, superseding ADR-0036 §4's per-context framing
- [ADR-0047](adr-0047-where-a-run-may-execute.md) — which machine a run happens on; this record is what it may reach once there
- [ADR-0039](adr-0039-files-and-workspaces.md) — a person's own files and workspaces are untouched by this record; the partition here is the agent's memory, which is a different thing that was conflated with it
