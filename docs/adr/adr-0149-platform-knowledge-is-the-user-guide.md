---
created: 2026-10-25
description: Agents learn how Agenthix works from the user guide people read, with a glossary and a generated tools reference, built into hq's image so it always matches the running version, and reached as the read-only platform level of knowledge.
---

# ADR-0149: Platform Knowledge Is the User Guide

**Date:** 2026-10-25
**Status:** Accepted

## Context

Agents run inside Agenthix and are asked about it: "look through the files in my space", "where do I add a model
key?". Nothing tells them how the product works, so they guess, and a guess about the product an organisation runs is
worse than no answer. Whatever they are given must match the version that is running, must use the words people use,
and must hold nothing of any organisation.

## Options considered

- **A platform skill of its own, written for agents.** Rejected: a second description of the product that drifts
  from the first, and a skill and a lookup tool would do the same job twice.
- **The maintainers' architecture and concept documents.** Rejected: they describe the code, in the code's words,
  which misleads an agent talking to a person.
- **Fetched from the public website.** Rejected: an installation may run an older version than the site shows, and
  may not reach the internet.
- **The user guide, with a glossary and a tools reference generated from hq's tool registry, built into hq's image
  (chosen).**

## Decision

**The user guide (`docs/guide/`) is the only source of platform knowledge.** A glossary page maps the words people use
to the product's screens and terms, and a tools reference is generated from hq's tool registry, never written by hand.
Both are built with the guide into hq's image, so the guide an agent reads is the running version's. Agents reach it as
the read-only `platform:` level of knowledge, through the same tools as every other level (adr-0150); it has no tools
of its own and is not copied to sites or into runs.

## What this binds

- A new screen needs its guide page, and a new word a person might say needs its glossary entry, before agents can
  answer about it.
- A guide change is an input of hq's image: it changes hq's content key and selects hq's checks.
- The guide's build takes only the guide's pages and the generated reference, and fails on anything else, so nothing
  private reaches it.

Undoing it means writing and keeping a second account of the product for agents.

## Consequences

### Positive

- One text, reviewed for people, serves people and agents alike, and is right for the version running.

### Negative

- The guide's quality is now the agents' quality: a gap in it is a gap in what agents know.

### Risks

- The guide describes the product, not what a run may do. Every platform result opens by saying that what the agent
  may do is what its tools allow.

## References

- adr-0150 — agents reach knowledge only through tools shaped like the native ones.
- adr-0146 — a release is a proven build: the guide ships inside the proved image.
