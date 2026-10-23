---
created: 2026-10-23
description: The organisation reaches AI through providers held by its HQ, one key each, written only through one module by an organisation admin, the machine admin's command or Cloud's controller on a machine it runs; no key is ever read back.
---

# ADR-0138: Providers Are Held by HQ and Written by Three Named Actors

**Date:** 2026-10-23
**Status:** Accepted

## Context

Model and voice keys were spread across several places: a model policy with keys per organisation, project and
person, separate voice settings, and environment variables on the site. A key could be read back by the screens that
set it, and nothing recorded who changed one. An organisation also needed one way to reach AI that works the same
whether the key is its own or comes through Agenthix Cloud.

## Options considered

- **Keys where they are used** (the site's environment, per-project and per-person keys). Each run then decides whose
  key pays, and a key can be anywhere. Rejected: no single place to see, change or revoke what the organisation uses.
- **Providers held by the Fleet Console, as machine configuration.** Keeps keys away from HQ's screens, but makes
  the fleet admin, whose job is machines, responsible for model access, and leaves an organisation that runs on
  Cloud's machines without a way to manage its own keys. Rejected.
- **Providers held by HQ, one key per provider, written through one module (chosen).**

## Decision

**What the organisation reaches AI through is a provider**: a vendor (or an OpenAI-compatible address, or Agenthix
Cloud), its key, and the types it serves: language models, speech to text, text to speech. Providers are held by the
organisation's HQ, encrypted with its secrets. **A key is written only through one module**, by one of three named
actors: an organisation admin in HQ's admin area, the machine admin through the `agenthix provider` command, or
Cloud's controller on a machine Cloud runs. Every write is recorded with its actor and announced to every
organisation admin. **No read ever returns a key**; screens show its last four characters. A person's own Claude
subscription stays theirs and is not a provider of the organisation.

## What this binds

Every model and voice call reaches its vendor through a provider HQ holds, so a site never holds a key of its own and
asks HQ for what a run needs. Any new way to add a key goes through the one module and names its actor. Undoing it
means moving every key and every reader back to per-place storage.

## Consequences

### Positive
- One place to see what the organisation uses, what depends on each provider, and who changed it.
- Cloud and own keys are the same kind of thing, and can be mixed.

### Negative
- Projects and people can no longer bring their own API keys; they narrow what the organisation's providers reach.

### Risks
- A key leaked from HQ's database is usable until rotated; the encryption and the no-read rule limit, not remove,
  that exposure.

## References
adr-0042, adr-0107, adr-0110, adr-0139, adr-0141.
