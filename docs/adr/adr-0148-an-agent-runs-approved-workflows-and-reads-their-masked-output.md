---
created: 2026-10-24
description: Once a person has approved a workflow version, an agent in that place may run it as often as its work needs, without asking again, and reads its output with every secret value masked. Bounded by the approval of the exact code, masking against every secret of the place, and a limit on how often an agent reruns.
---

# ADR-0148: An Agent Runs Approved Workflows and Reads Their Masked Output

**Date:** 2026-10-24
**Status:** Accepted

## Context

With secrets used only by approved workflows (adr-0147), the question is what an agent may do with one once it is
approved. adr-0037 made running an operation the operator's by default, with an agent allowed only where the operator
opted that workflow in, and withheld a real-secret run's output from the agent: an agent that writes the code and
watches it run with real secrets is an exfiltration channel that masking alone can't fully close.

Both rules made the agent wait on a person for routine work — deploying again after a fix, pushing a branch, reading
why a deploy failed — and pushing and pulling are now workflows too, which an agent needs many times a day.

## Options considered

- **Operator-only by default, agent-runnable by opt-in, no output for the agent (adr-0037).** Rejected: every push and
  every failed deploy would need a person, and an opt-in on every workflow adds a choice that is almost always yes.
- **Agent may run, but sees only each step's pass or fail.** Rejected: the agent can't fix what it can't read, so a
  person relays the log, and the log reaches the agent anyway.
- **Agent may run any approved version, and reads masked output (chosen).**

## Decision

1. **An approved version runs as many times as needed, by a person who may start runs in its place or by an agent
   there, with no one asked again**, while the workflow is switched on. Approval is the gate; the switch stops it at once.
2. **The agent reads the run's output, masked:** every secret value of the place, and every token minted for it that
   hasn't expired, is replaced in each common encoding before anything reaches the agent.
3. **An agent's runs of a workflow are limited**, by default 30 an hour, which an administrator can change per
   workflow; a person's are not.

## What this binds

- The agent's tools may run any approved, switched-on workflow in its place and return its masked output; no
  per-workflow opt-in exists.
- Nothing returns a run's output, or a file it changed, to an agent unmasked or unscanned.
- Undoing it means a person in the loop for every push and every failed deploy.

## Consequences

### Positive

- Agents work on their own between approvals: push, pull, deploy, read why it failed, fix, run again.

### Negative

- The agent sees what the approved code prints. Masking catches the plain forms, not a value an approved workflow was
  written to encode.

### Risks

- **The output channel adr-0037 refused is open, bounded.** What bounds it: a person approved the exact code after
  rule-based checks flagged any secret used near output; masking covers every secret of the place, in every common
  encoding; reruns are limited. Accepted. If a run is ever found to have leaked a value past masking, that expires this
  acceptance: withhold a secret-holding step's output by default and revisit.

## Implementation notes

Built by the workflows unit and merged with it (2026-10-25): an agent's four tools (`list_workflows`, `propose_workflow`, `run_workflow`, `workflow_run`) are always offered to its run; `run_workflow` and `propose_workflow` name the workspace, one of the place's own; output is masked on the site against every secret of the place before it leaves; an agent may run one workflow 30 times an hour unless an administrator changes it.

## References

- adr-0037 — superseded in part: section 6 (the agent is not given a real-secret run's output; *the agent never sees a
  secret value* still stands, now through adr-0147) and section 7 (invoke is operator-only by default; the author and
  approve gates still stand).
- adr-0147 — a secret is used only by a workflow a person approved, run by the platform.
- adr-0095 — a run is on behalf of whoever started it: an agent's run of a workflow is on behalf of the person its own
  run is for.
