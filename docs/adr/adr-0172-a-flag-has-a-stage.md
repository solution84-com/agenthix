---
created: 2026-11-03
description: Every feature flag has a stage — experimental, preview, beta or released — in the one list in core. Experimental is off even in development until a developer switches it on; an organisation's admin may switch on a beta in production, and switch off a released feature for the minor release it went live in, after which the flag is removed; one rule in core decides for every program, and a site takes hq's word for those two only. Tests run as shipped, and a feature's own tests switch its flag on. Supersedes ADR-0116.
---

# ADR-0172: A Flag Has a Stage

**Date:** 2026-11-03
**Status:** Accepted

## Context

ADR-0116 put every feature not ready behind a flag that was on in development and tests and off in production, turned
on only by a release. That holds a feature waiting on something outside it, but not an experiment: an experimental
feature was on in every developer's setup and every test run, so unfinished work could break work that ships, and no
test saw the product as it is released. It also gave an organisation no way to choose to use a feature that is usable
but unfinished.

## Options considered

**Keep ADR-0116's two states.** Rejected: an experiment would be on everywhere but production.

**A setting on each machine** (an environment variable or a file, read by development builds). Rejected: it would be a
second mechanism beside an organisation's opt-in, set in each program, where hq and its site can disagree.

**A hosted flag service** (targeting by organisation or person from outside). Rejected: an organisation's hq depends on
no central service (adr-0042); targeting waits for remote configuration (adr-0130).

**Run every suite twice, with flags on and off.** Rejected: it doubles every run to prove what one run as shipped,
plus each feature's own tests, already proves.

**Remove a flag as soon as its feature is released.** Rejected: the feature reaches every organisation at once, when an
unforeseen problem is most likely, and the only remedy would be a patch every organisation must install.

**Keep a released flag as an off switch until a major release, or for good.** Rejected: flags pile up, each keeping
an off path and its tests alive, until nobody knows which are safe to remove. An off switch a feature needs for good is
an operational setting of that feature.

**An opt-in for each person.** Rejected for now: some features cost the organisation (containers on its sites), and a
site cannot check each person's choice. It can be added on top of the organisation's switch.

## Decision

**Every flag has a stage**, in the one list in `@agenthix/core`, and moving it is a release decision made in that list:

- **experimental**: off in production and cannot be switched on there; off in development unless a developer switches
  it on;
- **preview**: off in production; on in development unless switched off;
- **beta**: off in production unless the **organisation's admin** switches it on, for the whole organisation; on in
  development unless switched off;
- **released**: on; the organisation's admin may switch it off for the rest of the minor release it went live in. The
  flag is removed by the next minor release: its entry records that minor, and the release rehearsal refuses a later
  minor or major release while it is still listed.

A release here is a minor or major release. **Only a minor or major release moves a flag forward**; a patch may move one
back (to stop a broken feature reaching everyone), never forward.

**The switches are stored on the organisation's record in hq**, changed on one *Features* screen: beta flags only in
production, beta and newly released flags; in a development build, every flag. **One rule in core** (`isFeatureOn`) decides from the stage, whether the
build is development, and the switches; every program asks it, and every server entry point of a flagged feature
checks it before acting. **A site gets the switches from hq** with each instruction and applies the same rule, so in
production hq's word can turn on a beta or turn off a newly released feature, and nothing else. Anything not plainly a development build is production.

**Tests run as shipped**; a feature's own tests switch its flag on around their group. A failing test of an
experimental feature's own group is reported and does not block; from preview on, it blocks. A flag leaves experimental
only with all its tests passing. The full regression adds one run with every flag on.

## What this binds

- Every flag names a stage; nothing reads `NODE_ENV` to decide a flag except through `isFeatureOn`.
- Every server entry point of a flagged feature checks the flag where it runs, on hq and on the site.
- No flag is switched by a file or an environment setting; the only switch is the organisation's, on its record.
- A test that needs a flag on says so around its own group; nothing switches one on for a whole suite.
- A released flag is gone by the next minor release; a patch never moves a flag forward.

Undoing it means experiments live in every developer's setup again, or the opt-in moves somewhere each program must
read separately.

## Consequences

### Positive
- An experiment is merged and kept current on `main` without reaching anyone who did not switch it on.
- The ordinary test run is the release.
- An organisation can try a feature in beta, and switch it off again, with its data kept.

### Negative
- A switch read from the database on hq's checks (cached), and a field more in instructions to sites.
- An experimental feature's failures may stand for a while, seen only in the run's summary.

### Risks
- An experiment broken for long while nobody fixes it; it cannot leave experimental until its tests pass.
- A faulty hq can switch on a beta on its sites; it cannot switch on anything earlier.

## References

Supersedes adr-0116. adr-0042 (hq is the organisation's own), adr-0130 (Cloud features are gated by their own
conditions).
