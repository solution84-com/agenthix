---
created: 2026-10-28
description: A new HQ's setup asks for the organisation before AI, and can finish without a language model or voice. An HQ with no model, or no voice, is an ordinary state, shown as not set up, distinct from an outage. Supersedes ADR-0140.
---

# ADR-0160: Setup Defines the Organisation First, and AI May Come Later

**Date:** 2026-10-28
**Status:** Accepted

## Context

ADR-0140 made setup ask how agents reach AI before the organisation, and refused to finish until a language model,
speech to text and text to speech all worked. It meant the first message and the first spoken word worked, but someone
trying HQ out, or waiting for a key from their company, could not get in at all. The organisation is the one thing
every HQ needs, and what people see when they sign in.

## Options considered

- **Keep AI required (ADR-0140).** The first message works, but setup cannot finish without three keys or Cloud.
  Rejected.
- **Let only voice be skipped.** Voice without a model does nothing, and a model without voice still blocks the
  same people. Rejected.
- **Organisation first; models and voice each optional (chosen).**

## Decision

**Setup asks for the organisation before AI**: You, Your organisation, how agents reach AI, then the last look. The
AI choice offers Agenthix Cloud, your own keys, or **Later**; the model provider and voice steps each offer **Skip for
now**. **Setup finishes with whatever providers were added, none included.**

**An HQ with no model, or no voice, is an ordinary state.** Every place that shows it says *not set up* when no
provider of the type was ever added, and keeps *down* for one that was added and stopped working. A provider of the
last of its type can be removed, with a warning that the type goes down.

**Kept from ADR-0140:** setup happens in HQ, by its first admin; HQ's setup state is derived, never stored; and the
organisation's defaults are written from what was added, so it never runs on a fallback nobody chose. Defaults still
empty are filled whenever a provider is added or its key replaced.

## What this binds

No client may assume a set-up HQ reaches a model or voice: each handles both being absent, and says how to add them.
Any later way to set up an HQ (a hosted install, an import) may likewise finish without AI.

## Consequences

### Positive
- Setup needs nothing but a name for the organisation.
- An organisation that leaves AI for later is told plainly what is missing, and is not shown an outage.

### Negative
- The first message to an agent can fail on a set-up HQ; Home, Needs attention and the conversation say why.

### Risks
- An admin who skipped AI may not come back to it. Needs attention lists it until a provider is added.

## References
Supersedes adr-0140. adr-0138, adr-0139.
