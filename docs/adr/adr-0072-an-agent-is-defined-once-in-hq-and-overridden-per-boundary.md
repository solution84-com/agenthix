---
created: 2026-09-27
description: An agent is one current definition held by hq, delivered to whichever site runs it by content fingerprint and cached there, with a project's or a person's overrides on top; there are no version numbers.
---

# ADR-0072: An Agent Is Defined Once in hq and Overridden per Boundary

**Status:** Accepted

## Context

Runs are placed on the site that holds their storage, and a site accepts no inbound connection, so an
agent's instructions, heartbeat text and skills cannot live on one site's disk: hq has to hold them and
deliver them with the run. adr-0059 answered that by making an agent an immutable, numbered package,
with its settings frozen into each version, so a run could name exactly what it ran and an old version
could be restored.

What the numbers were for never arrived. Every run took the latest version, and nothing pinned one.
Every reader of an agent's model, runtime, tool ceiling and autonomy read the agent's record, not the
version, so the settings lived in two places. The agent's name and role reach every run's prompt and
were never versioned, so a version did not describe a run in full either. Making it do so would mean
versioning every editable field.

hq is each organisation's own, so the people who define an agent and the people whose work uses it are
in the same organisation. Holding one project on an older release is a need a shared marketplace has,
and none has been met here.

## Options considered

**Keep the versioned package and finish it** — settings read from the version, a project or person
able to pin one, and name and role moved into it. Rejected: it keeps a publish step and a history for a
pin nobody uses, and every change to what a run sees becomes a release.

**Drop delivery by content and send the whole definition with every run.** Rejected: it moves the full
definition on every run when a short fingerprint and a cache move it once per site per change.

**Version content only, and keep settings live on the record.** Rejected: it keeps the numbering and
publish step while giving up what they were for — a version no longer describes the run.

## Decision

**An agent is one current definition held by hq.** Its identity (name, handle, role, avatar, voice),
its instructions, heartbeat text and skills, and its settings (model, runtime, tool ceiling, autonomy,
heartbeat) are edited in place, and the next run uses them. There is no version number and no publish
step.

> **Renamed since: autonomy is now approval, and the tool ceiling is the agent's permissions.** *(annotated
> 2026-10-09)* The setting this record calls autonomy is an agent's **approval** — bypassed, deferred or
> immediate — and its tool ceiling is its **permissions**, a state per tool and per command pattern. A project's
> or a person's override narrows both, the strictest level winning. The decision itself stands.

**A run is delivered the definition by its content fingerprint.** hq names the fingerprint of what the
run receives; a site that does not hold that content fetches it once and caches it, and never alters
it. The run records the fingerprint, so what a run used can always be named.

**A boundary's owner overrides on top, never inside.** A project, or a person in their own space, may
narrow an agent's settings, add instructions, and add skills — for one agent, or for every agent that
works in that boundary. An override never changes the agent's own definition.

**There is no site layer.** A site executes what it is sent and decides nothing about an agent.

**The organisation's and the platform's own content** is delivered the same way.

## What this binds

- **Anything that reads an agent reads one definition**, from hq; nothing keeps a second copy of it.
- **A run's payload names content by fingerprint, not by version**, and a site's cache is keyed by it.
- **An override belongs to a boundary** — a project or a person — never to a site.
- **What a run used is identified by its fingerprint.** Anything that later needs to hold a project on
  an older definition — a pin, a snapshot — is built on the fingerprints runs already record.

Undoing it means reintroducing a publish step and a history that every editor and reader of an agent
passes through.

## Consequences

### Positive

- Editing an agent is saving it; nothing to publish.
- One source for everything a run is told, so the record and a version cannot disagree.
- Delivery stays cheap: a fingerprint per run, the content once per site per change.
- Overrides reach every agent in a boundary without copying.

### Negative

- A project cannot be held on an older definition; a bad edit is undone by editing it back.
- A fingerprint says what a run used but not what it said; old content is kept only in a site's cache
  and hq's content store for as long as they hold it.

### Risks

- If an organisation needs to hold one project on an older definition, pinning has to be built on the
  recorded fingerprints, with retention for the content they name.

## References

- adr-0059 — superseded by this record
- adr-0042 — hq is the organisation's own
- adr-0056 — a run is placed on the site holding its storage
- adr-0060 — authority comes from the boundary
