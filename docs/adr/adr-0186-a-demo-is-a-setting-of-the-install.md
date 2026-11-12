---
created: 2026-11-11
description: A public demo of hq is the normal images with one install setting, DEMO_MODE, that scripts the conversation lead's model and the site's agent runtime, lets visitors in by one button behind a guard, and resets on a schedule; not a feature flag and not a separate build.
---

# ADR-0186: A Demo Is a Setting of the Install

**Date:** 2026-11-11
**Status:** Accepted

## Context

People who find Agenthix should be able to try it in their browser without installing anything. A public hq must not
call a model, start an agent container, reach outside the machine, or let a visitor change who can get in. The design
is in the live demo unit's spec (`docs/work/2026-11-11-live-demo/spec.md`).

## Options considered

**A feature flag.** Rejected: a flag is for a feature not yet ready, and in production an organisation's admin
switches flags on the *Features* screen; being a demo is a property of the machine, not of an organisation's choices.

**A separate demo build.** Rejected: an image nobody else tests, signed and published apart from the rest.

**Faking inside hq with no site.** Rejected: hq reads Knowledge, files, skills, workspaces and transcripts from the
site, so every one of those reads would need a fake of its own.

**One install setting in the normal images** (chosen).

## Decision

**A demo is the normal hq and site images with `DEMO_MODE` set in their environment by `agenthix install --demo`, read
once at start.** With it set:

- **The conversation lead's model and the site's agent runtime are scripted**, from one data set built into the
  images; everything between them is the real code. The site has no Docker socket, so no container can start.
- **Visitors enter by one button** that makes an account each: a member of the organisation and a viewer of the
  sample's projects, so the product's own roles keep the sample intact, and each visitor works in their own space. A
  small guard refuses what a member could still do that a public demo must not.
- **hq and the site seed the sample organisation at start** on empty databases, dated from today; the host service
  resets the demo by removing its data and starting it again, every 6 hours.
- **No Fleet Console and no fleet admins.**

Without the setting, none of this code is reached and an install behaves as before.

## Consequences

- The fakes ship in every image. They are inert without the setting, which only the host service writes.
- A demo shares a machine with another installation only under its own namespace (ADR-0108's testing configuration).

## Implementation

Implemented by the live demo unit (`docs/work/2026-11-11-live-demo/`, closed 12 Nov 2026): `DEMO_MODE` is written by
`agenthix install --demo` and read through `isDemoMode` (`core/src/demo/`); the scripted lead is `hq/src/demo/lead/`
and the scripted runtime `site/src/demo/runtime/`, from the data set in `demo/`; visitors enter through
`hq/src/demo/enter/` as members and viewers of the sample, behind the guard's one list (`hq/src/demo/guard/refused.ts`);
both apps seed at start (`hq/src/demo/seed/`, `site/src/demo/seed/`); the host service resets every 6 hours and on
`agenthix demo reset`. Proved by installing from locally built images.
