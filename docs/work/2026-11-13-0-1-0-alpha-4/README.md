---
created: 2026-11-13
description: The next pre-release, 0.1.0-alpha.4 — the release rules for 0.1.0 written down, what must be in it fixed, the pre-release cut from today's main, and the switch to it proved.
---

# 0.1.0-alpha.4

**Operational work**, on `chore/0.1.0-alpha-4` from `main` (`4a077576`). It prepares and cuts a
pre-release, with the small fixes the live demo needs.

## Why

The newest pre-release, `v0.1.0-alpha.3`, is more than 250 commits behind `main`. The live demo is installed from a
published release (`agenthix install --demo`), and no release carries it yet; and the host service's switch from one
published version to the next has never been run between two real releases. Cutting the next pre-release now also runs
the whole release process on today's `main` before `v0.1.0`.

Alpha and release candidate are both optional, for any release. 0.1.0 is cut as alphas until `v0.1.0`, with no
release candidate, because it is not tested with an audience before it ships; data is carried forward from `v0.1.0`
(decided 13 Nov). The written rules still make a release candidate a fixed step before 0.1.0, so they change here.

## Objectives

1. **The release rules say how 0.1.0 is released**: alpha and release candidate both optional for any release;
   0.1.0 cut as alphas, with no release candidate; each product's migrations squashed into one in the commit tagged `v0.1.0`, and data carried forward from it.
2. **What the pre-release must carry is in it**: the demo's entry says what entering agrees to; the guide offers no
   service that has not opened; a task's files show where people look; the demo says when it was last reset, and
   a failed reset is retried soon.
3. **`v0.1.0-alpha.4` is published** by the release process, every check passing.
4. **The host service switches from `v0.1.0-alpha.3` to `v0.1.0-alpha.4`**, and puts back one that fails.

[`plan.md`](plan.md) has the phases.
