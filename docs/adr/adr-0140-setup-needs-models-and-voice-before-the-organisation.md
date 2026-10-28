---
created: 2026-10-23
description: A new HQ is set up in HQ itself, by its first admin, and cannot finish without a working language model and voice, from Agenthix Cloud or the organisation's own keys; setup writes the organisation's defaults when it finishes.
---

# ADR-0140: Setup Needs Models and Voice Before the Organisation

**Date:** 2026-10-23
**Status:** Superseded by adr-0160

## Context

A new HQ could be set up and used with no model and no voice: agents then failed on their first message, and voice
was an option that silently did not work. Setup was also split between HQ and the Fleet Console's first run, which
needed a tunnel to reach a machine without a browser.

## Options considered

- **Let setup finish without AI and ask for it later.** Shortest setup, but the first thing a person does fails.
  Rejected.
- **Make voice optional.** One less key to find, but "why doesn't voice work" becomes the answer to a choice someone
  made months earlier, and two experiences to support. Rejected.
- **Setup in the Fleet Console's first run.** Reaches the machine before HQ exists, but asks the fleet admin for
  model access and needs a tunnel. Rejected.
- **Setup in HQ, requiring a language model and voice (chosen).**

## Decision

**Setup happens in HQ**, by the first admin, from a link the machine admin gets. It cannot finish until the
organisation reaches a language model, speech to text and text to speech, through Agenthix Cloud or its own keys
(one provider of each is enough). **HQ's setup state is derived, never stored**: unclaimed, setting up, set up; it
decides what HQ's address shows and is stated before sign-in. **When setup finishes it writes the organisation's
defaults** from what was added, so a new organisation never runs on a fallback nobody chose.

## What this binds

Every client may assume a set-up HQ reaches models and voice. Any later way to set up an HQ (a hosted install, an
import) must reach the same state before it counts as set up. Undoing it means every screen and client handling an
organisation with no AI.

## Consequences

### Positive
- The first message and the first spoken word work.

### Negative
- Setup needs three keys, or Cloud, before anyone can use HQ.

### Risks
- A provider that stops working later puts the organisation back into the state setup prevents; that is handled as
  an outage, shown as one, not as setup undone.

## References
adr-0110, adr-0130, adr-0138.
