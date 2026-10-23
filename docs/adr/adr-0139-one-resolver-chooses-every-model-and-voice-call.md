---
created: 2026-10-23
description: Every model and voice call is decided by one resolver from a person's pick, an agent's own choice and the organisation's defaults, within allow and never lists at organisation, agent, project and person; the provider comes with the choice, the runtime follows the model, and voice's speaking model is fixed.
---

# ADR-0139: One Resolver Chooses Every Model and Voice Call

**Date:** 2026-10-23
**Status:** Accepted

## Context

Which model and which key served a call was decided in several places: a model policy, a key order of project,
person and organisation, an agent's single default model and runtime setting, per-project overrides, and voice
settings outside all of them. Each caller combined them its own way, and the same call could be answered
differently by two of them.

## Options considered

- **Keep the policy and add providers to it.** Least change, but keeps five deciders and the key order, now with
  providers as a sixth input. Rejected.
- **Profiles: named bundles of keys and models an admin assigns.** Considered at length; it adds a layer people must
  understand before they can pick a model, and an organisation with one key per provider gains nothing from it.
  Rejected.
- **One resolver, deciding a model via a provider for every call (chosen).**

## Decision

**One resolver answers every call** (a conversation's turn, a worker, a helper, a title, a summary, speech to text,
text to speech), with a model **via a provider** and the runtime to run it on. It takes, in order, the person's pick
or the instruction's named model, the agent's own choice, then the organisation's default; and every answer is
within all the lists that apply: the organisation's, the agent's, the project's and the person's, each *any model
except these* or *only these*, with patterns, and a list only narrows. A provider that is not working is routed
around to the same model elsewhere, or fails with a reason a person can act on. **The runtime follows the model**:
a Claude model on an Anthropic key, a person's own Claude subscription or Agenthix Cloud runs on Claude Code;
anything else on OpenCode. A person's own subscription serves only their own place. **Voice's speaking model is
fixed** to the one voice is built on, and its listening model is one of a fixed few, so a choice there is a provider,
a voice and a listening model, never an untested model.

## What this binds

Nothing chooses a model or a key outside the resolver. A new kind of call adds a purpose to it; a new place that
narrows models adds a list owner. Undoing it means giving each caller its own decision again.

## Consequences

### Positive
- The same question gets the same answer everywhere, and the answer says why it fell back.
- Adding a provider, or a model to a vendor, needs no change to callers.

### Negative
- An agent's runtime is no longer a setting of its own.

### Risks
- One component on every call's path: a fault in it stops every call, so it is tested as a pure function of a
  snapshot.

## References
Supersedes adr-0105. Supersedes adr-0078-s-1, adr-0125-s-1. adr-0122, adr-0138.
