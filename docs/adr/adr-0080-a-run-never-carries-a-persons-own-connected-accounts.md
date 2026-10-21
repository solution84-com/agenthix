---
created: 2026-09-28
description: No run loads the accounts a person has connected outside Agenthix — such as the claude.ai connectors of the account behind a subscription — because a run's authority comes from its boundary, and an agent's tools must not depend on how it authenticates.
---

# ADR-0080: A Run Never Carries a Person's Own Connected Accounts

**Status:** Accepted

## Context

A Claude subscription login brings the claude.ai connectors of the account behind it — Drive, mail,
issue trackers and the like — into every Claude Code process signed in with it. Each connector acts with
that person's authority, through sign-ins the vendor holds.

A run's authority comes from its boundary (adr-0060): a project's runs, tasks included, act as the
project, and an unattended run carries no person's authority. With a shared subscription, one person's
connectors reached every project member's agent; a walk-through on 2026-09-28 found a member's container
connecting to the subscription holder's connector. They also made an agent's tools depend on its
credential: present on a subscription, absent on an API key.

The platform already meant to exclude them, with a hand-kept list of tool names that caught only two
connectors' sign-in tools.

## Options considered

- **Allow them only in a person's own chat in their own storage**, the one place a run acts as that
  person. Rejected for now: their tools would still sit outside the tool gate and the run's permissions.
- **Leave them as they come.** Rejected: one person's accounts reach runs acting for a project, and
  what an agent can do changes with how it authenticates.
- **Block them tool by tool.** Rejected: a list of names falls behind every connector a person adds.

## Decision

**No run loads accounts a person has connected outside Agenthix.** The Claude harness is started with
its claude.ai connectors turned off, for every run, in a container or not. An agent reaches external
services only through what Agenthix supplies to the run's boundary.

Connections a boundary owns, made through Agenthix and governed like any other tool, are queued as later work.

The design is in the unit's [design spec](../work/2026-09-28-person-scoped-execution/spec.md),
section 1.

## What this binds

- **Every runtime turns off whatever a signed-in account brings with it** — connectors, plugins, or
  their equivalent in a future harness — and fails closed where it cannot.
- **A run's tools do not depend on its credential.** The same agent in the same boundary has the same
  tools on a subscription and on an API key.

Undoing it means giving project runs a person's authority, which adr-0060 rules out.

## Consequences

### Positive

- A person's accounts cannot be reached from a project, whoever's login the run uses.
- An agent behaves the same whatever credential it runs on.

### Negative

- People used to claude.ai lose their connectors inside Agenthix until a boundary can connect its own.

### Risks

- **A harness may add a new way for an account to bring tools along.** Each runtime's start-up has to
  be checked against this record when the harness is upgraded.

## References

- adr-0060 — authority comes from the boundary
- adr-0074 — a container is keyed on its boundary and its runner
- [Design spec — person-scoped execution](../work/2026-09-28-person-scoped-execution/spec.md)
