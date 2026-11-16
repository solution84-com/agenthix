---
created: 2026-10-24
description: A release is a tag on a commit of main, given to images that were built once per content, proved by the release build and attested; the tag builds nothing, verifies each attestation and recomputed content key, and signs what it promotes. A release branch exists only for a patch, and at most two lines are maintained.
---

# ADR-0146: A Release Is a Proven Build Given a Name

**Date:** 2026-10-24
**Status:** Accepted

## Context

The platform publishes six images, a package and an install that brings them together. A release cut on its own
branch (adr-0137) wrote the version into every `package.json`, which every Dockerfile copies, so every image's input
changed with it and nothing built before the version was set could be the release. The release bar then ran for the
branch, again for the merge commit, and the tag built all the images a third time. An unchanged part was rebuilt every
time, a fix to one part rebuilt all of them, and the install test proved images built for the test, not the ones
published.

The constraint: what is proved must be what is published, and a version must not be a property of the code.

## Options considered

- **A release branch per release (adr-0137, today's).** Proves a release on exactly what it ships, but sets the
  version in the code, so each release is built and proved from scratch, more than once. Rejected.
- **Build again at the tag.** Simple, and the tag need not trust anything earlier, but the images that were proved are
  not the images published, and the tag is the third build. Rejected.
- **Rebuild the host image with its version at the tag.** Keeps the host service's version compiled in, at the cost
  of one image that is rebuilt for every release even when its code is unchanged. Rejected: the host service learns
  its version from the reference it was started by, checked against that version's signature.
- **GitHub's artifact attestations.** Need GitHub Enterprise Cloud in a private repository, and this one is private
  until its first public release. Rejected for now; they may be added beside the chosen attestation once it is public.
- **A version given at publish, images built once per content, a tag that promotes (chosen).**

## Decision

1. **The version is the tag's and is never built in.** Every `package.json` stays at `0.0.0`; no image carries a
   version or a commit. The version and commit go on the multi-platform index the tag makes, and a container is given
   its version at run time.
2. **An image is built once per content key and reused.** A content key names everything a part is built from; the
   same key is the same image, and a part is built only when its key has no image.
3. **A release is rehearsed where it is made and built the same way in CI.** The release rehearsal on the dev
   machine and the CI release build run the same scripts, so the two cannot drift. CI adds the other architecture, a
   clean machine and the signing.
4. **A release is a tag on a commit of `main`.** The release build passes on that commit first. The tag builds
   nothing: it verifies each image's build attestation and recomputes its content key at the tagged commit, refuses
   unless they match, then signs the per-version index and publishes.

   > ⚠️ **Superseded by adr-0190 — this item's tag pushed by hand only.** *(annotated 2026-11-14)* One workflow,
   > Release, now pins the guide's screenshots, runs the release build, creates the tag and starts the publish. That the
   > tag builds nothing, and verifies and signs what it promotes, still stands.

5. **A release branch exists only for a patch** while `main` has moved on, cut from the newest tag of its line and
   merged into `main` with `--no-ff`. `main` never flows into it. Tags are protected from being moved or deleted.

   > ⚠️ **Superseded by adr-0194 — a release branch only for a patch.** *(annotated 2026-11-17)* Every release, major,
   > minor or patch, is now prepared and cut on its own branch, `release/<version>`, then merged into `main`; a major or
   > minor is cut from `main`, a patch from the tag it fixes. That `main` never flows into a release branch, and that
   > tags are protected from being moved or deleted, still stands.
6. **At most two lines are maintained:** the newest minor of the current major and of the one before it. Before
   `1.0.0`, only the newest release.

The design, with the rules and their reasons, is in the unit's spec:
[`docs/work/2026-10-24-release-cycle/spec.md`](../work/2026-10-24-release-cycle/spec.md).

## What this binds

- No commit, date or version enters an image, a bundle or a `package.json`; two builds of the same content must not
  differ.
- The tag signs only images whose build attestation it verified and whose key it recomputed; the signer a host
  service trusts is still the publish workflow at the tag (adr-0117).
- A patch holds fixes only, and from `v0.1.0` no database migration. *(annotated 2026-11-13: this read "from `0.1.0-rc.1`"; `0.1.0` has no release candidate, so the line is `v0.1.0`.)*
- Undoing it means returning to a release branch per release with the version in the code, which re-couples every
  image to every release; the cost grows with each release made this way.

## Consequences

### Positive
- A release costs one run of the bar, and a patch to one part rebuilds that part alone.
- The install test proves the images that are published.
- A digest built from other content cannot be promoted under a tag, whoever pushed it.

### Negative
- Reuse by key needs one list of the parts, kept true to the Dockerfiles by a test.
- Base images and the rebuild epoch have to be moved on purpose to take security updates.

### Risks
- A container started by bare digest runs as a development build. Accepted: whoever does that already controls the
  machine's Docker.
- A fix made on a patch branch can miss `main`: it is merged into `main` with `--no-ff` as the patch closes, and
  ported by hand only where `main` has rewritten the code it touches.

## References

adr-0117, adr-0136. Supersedes adr-0137.

> **Acted on.** *(annotated 2026-10-24)* Carried out by the unit of work
> [`2026-10-24-release-cycle`](../work/2026-10-24-release-cycle/plan.md) and proved by using it: `v0.1.0-alpha.3` was
> rehearsed on the dev machine, proved by the release build on both architectures, and published by its tag, which built
> nothing and promoted the attested images. An installation from those images passed the host service's real signature
> check.
