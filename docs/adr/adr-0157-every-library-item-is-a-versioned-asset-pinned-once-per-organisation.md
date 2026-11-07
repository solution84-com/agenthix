---
created: 2026-10-27
description: Skills and agent, board and team templates are one kind of thing, an asset — publisher/name plus a SemVer version, a self-contained package de-duplicated by identity, one pinned version per organisation, drafted then published, edited by making the organisation's own copy with provenance written once. Library maintainer is the only role beside administrators.
---

# ADR-0157: Every Library Item Is a Versioned Asset, Pinned Once per Organisation

**Date:** 2026-10-27
**Status:** Accepted

## Context

When this was decided, a library skill was a folder copied into the organisation's package by slug. Installing
overwrote whatever had that slug, an installed skill never learned the library had moved on, and nothing recorded a
version. Templates carried hand-kept copies of the same skills. Agent, board and team templates had the same shape of
problem with no versions either. adr-0072 holds an agent's definition in hq, but says nothing about versions of the
things it is made from.

## Options considered

- **Fix skills only, leave templates as they are.** Rejected: templates carry skills, so two models would meet inside
  every template, and before the first release candidate there is no data to carry forward.
- **Packages that reference each other, with a resolver (as package managers do).** Rejected: something can go
  missing, and hq would need a resolver and a registry to resolve against.
- **References only for Agenthix's own packages.** Rejected: one rule for Agenthix and another for everyone else.
- **Versions pinned per place (a project held on an older version).** Rejected for now: it multiplies what a person
  must reason about; side by side versions may come later.
- **Publishing separate from rolling out.** Rejected: one more step for every change, for a case roll back covers.
- **Maintainers per asset or per project.** Rejected: every Library asset belongs to the organisation; per-asset roles
  add a permission surface nobody asked for.
- **One asset layer for every Library item: identity, self-contained packages, one pinned version, draft then publish
  (chosen).**

## Decision

1. **Every Library item is an asset**: skills, agent templates, board templates and team templates. Its identity is
   `publisher/name` and a SemVer version. An agent, board or team made from a template is its own definition
   (adr-0072) and never follows the template.
2. **Every package is self-contained**, carrying every skill it needs. Installing de-duplicates by identity: the same
   version is reused, a newer one is offered as an update, an older one leaves the installed one alone.
3. **One version per asset per organisation, pinned.** Update and roll back are explicit. Administrators and Library
   maintainers may install any version on purpose, recorded with who, when and why; a withdrawn version gets a warning,
   not a refusal.
4. **Edit makes a draft no agent sees; publish makes the next version.** Publish shows the full difference and
   publishes only the revision the publisher saw.
5. **Editing an asset another publisher signed makes the organisation's own copy**, which takes the original's place;
   upstream versions show as news and are never merged. The copy's provenance (`basedOn`) is written once, when it is
   made; only lines hq wrote here show as verified.
6. **Library maintainer is the only role beside administrators**: an organisation role that creates, edits and
   publishes every Library asset, accepts updates, rolls back and reviews proposals.

## What this binds

- Every kind of Library item goes through this layer; a new kind of template joins it rather than inventing its own.
- Nothing installs by slug or overwrites by name; identity decides.
- Runs record the fingerprint of every version they used.
- adr-0072 is narrowed: the agent package stops carrying its own skills; an agent's skills come from the installed set.

Undoing it means re-introducing per-kind install paths and losing version history already recorded.

## Consequences

### Positive

- An organisation always knows which version every agent uses, and can go back.
- Templates and skills share one install, update and edit path.
- Agenthix's build copies each skill from one source into every package that uses it.

### Negative

- A package carrying a skill already installed downloads it again.
- No two versions of one asset side by side in one organisation.

### Risks

- **A Library maintainer reaches every project.** A maintainer can publish a skill that runs for every agent, in
  projects they can't access. Accepted: every Library asset belongs to the organisation, the reach is shown when
  someone is named, and every publish is recorded with its author. Worth revisiting when organisations need
  maintainers per team or department, or when a maintainer is a common route into projects.

## References

- adr-0072 — narrowed by this record.
- adr-0084 — skills staged per turn by fingerprint.
- adr-0158 — how an asset is installed.

> **Annotated 2026-11-07.** The asset kind "board template" is now the "task template" (task types and custom fields; adr-0174, adr-0176). The rest of this record stands.
