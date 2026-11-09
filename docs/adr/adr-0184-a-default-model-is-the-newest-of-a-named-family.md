---
created: 2026-11-10
description: A default model is never a fixed id. It is the newest stable model of a named family for a vendor, found by one shared helper in core from the catalogue, so a catalogue update moves every default without a code change. A test fails when a specific model id appears in source outside the family table.
---

# ADR-0184: A Default Model Is the Newest of a Named Family, Picked by One Shared Helper

**Date:** 2026-11-10
**Status:** Accepted

## Context

Wherever the product needs a model nobody chose, it names one. Three places did so separately: the fallback for a run that
names no model (`claude-sonnet-5` in core), setup's preferred model, and a price-band guess for a vendor without it. The guess
picked a research agent for Google as a conversation model. Each fixed id goes out of date when a vendor releases a
newer model or when the pinned OpenCode catalogue changes, and each is a code change to refresh. The catalogue itself keeps no
release date, so nothing could say which of two models is newer.

## Options considered

**Keep fixed ids and update them at each catalogue change.** Rejected: it is a chore nobody is reminded of, and the defaults
quietly go stale.

**Follow each vendor's flagship.** Rejected: flagship tiers cost several times a mid-tier model, and a default should not
silently move a new organisation's bill up when a vendor adds a tier.

**A named family per vendor, resolved to its newest member from the catalogue** (chosen).

## Decision

**A default model is the newest stable model of a named family at a vendor, picked by one shared helper in core from the
catalogue. No default names a fixed model.**

- A family is a name pattern in one table (Claude Sonnet, the main GPT line, Gemini Pro), mid-tier on purpose.
- The helper prefers a release date from the catalogue when it has one, else the version in the model's name, read the same
  whether written `5-5` or `5.5`. It skips specialised variants (mini, nano, codex, deep-research, computer-use); a preview
  counts only when no stable one exists; a vendor's own "latest" alias is preferred where one exists.
- A family with no match falls back to the price-band rule, and says so, so a default is never empty.
- A test fails when a specific model id appears in non-test source outside the family table.

## What this binds

- Any later default, such as a title model, a voice sample model or a task fallback, uses the helper and adds a family to the
  table when it needs one.
- A default is as fresh as the catalogue: if the pinned catalogue lags a vendor, so does the default.

## Consequences

### Positive
- A catalogue update moves every default; no code edit.
- One place decides, and a test keeps it that way.

### Negative
- A new version can become a default before anyone has tried it on the product; a family is chosen so that a new version is
  the same tier, and a preview is used only when nothing else exists.

### Risks
- A vendor renames its models so that a family's pattern matches none. The price-band fallback keeps setup working and
  says so, and the family table is the one file to fix.

Implemented by the one-key unit (built 10 Nov 2026): `newestOfFamily` and its family table are in `core/src/models/` (`newestOfFamily.ts`, `modelFamilies.ts`); setup's defaults and `DEFAULT_MODELS` use it; the catalogue now keeps each model's release date; the guard is `core/src/__tests__/noFixedModelIds.test.ts`, with three files that name a model on purpose allowed by reason. A catalogue with no Sonnet falls back to the price rule instead of failing to load.

## References

adr-0139 (one resolver), adr-0138 (providers).
