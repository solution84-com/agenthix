---
name: releasing
description: Use when cutting, proving, tagging or patching a release of Agenthix — the release rehearsal, the release build, the tag that publishes, a patch on a release branch, a failed publish, and which lines are maintained. Maintainers only.
---

# Releasing

**A release is a tag on a proven commit of `main`**
([ADR-0146](../../../docs/adr/adr-0146-a-release-is-a-proven-build-given-a-name.md)). Nothing is built at the tag, and no
commit sets a version: every `package.json` stays at `0.0.0`.

1. **The owner picks a commit of `main`, and the release rehearsal passes on it**, on the dev machine:
   `RELEASE_VERSION=<version> scripts/release/prove.sh`. It checks:
   - the Sigstore trust root hq carries is no older than 300 days;
   - no flag released in an earlier minor release is still listed
     ([feature flags](../../../docs/architecture/feature-flags.md));
   - the image keys, the images built and started, the install test and the guide's screenshots, for the dev
     machine's own architecture.

   The full regression runs with it (`testing-a-change`).
2. **The release build is started by hand** on that commit (*Release build*, `.github/workflows/release-build.yml`)
   and passes: every image part with a new key, for amd64 and arm64, built, started and attested; the install test and
   the screenshots.
3. **The owner tags the commit `v<version>` and pushes the tag. The tag only publishes** what was proved. It refuses
   unless *Checks* and the release build passed for the commit and no released flag is overdue; it verifies each
   image's attestation and recomputed key, then makes and signs each version's index, publishes core and makes the
   release page.
4. **A patch is cut from `main`.** It carries fixes, and any code behind a flag that is off in production
   (experimental or preview); it never moves a flag forward, which only a minor or major release does
   ([ADR-0172](../../../docs/adr/adr-0172-a-flag-has-a-stage.md)). **A release branch exists only for a patch while
   `main` holds a change that may not go out in one**, behaviour not behind a flag, cut from the newest tag of its line
   (`release/1.0.1` from `v1.0.0`, `release/1.0.2` from `v1.0.1`).
   - On it: the fix, the release rehearsal, the release build (its push starts it), and the tag on its last commit.
     Then it is merged into `main` with `--no-ff` and deleted.
   - When `main` has not moved since the release, the fix goes on `main` and is tagged there.
   - `main` never flows into a patch branch. Where `main` has rewritten the code a fix touches, the fix is ported to
     `main` by hand with `git cherry-pick -x` instead of merged.
   - A patch on a release branch holds fixes only.
5. **If anything fails after the tag is pushed**, the tag and whatever that attempt published are deleted, the fix is
   made, and the same version is tagged again; a retry promotes the same images.
   - **A version that published is never published again**, even when it turns out not to work: someone may already
     have it. Its fix takes the next number: `0.1.0-alpha.3` after `0.1.0-alpha.2`, `1.0.2` after `1.0.1`.
   - A patch that may be shaky can go out first as a release candidate (`1.0.1-rc.1`, then `rc.2`) and become final
     once it is proved. That is optional.
6. **Tags are permanent.** A repository ruleset stops `v*` tags being moved or deleted; the admin's bypass is for a
   publish that failed part-way.

**At most two lines are maintained**: the newest minor of the current major and of the one before. Before `1.0.0`,
only the newest release ([versioning.md](../../../docs/architecture/versioning.md#the-product-version)).

**A QA audit** is required before a release, `0.1.0` the first; a pre-release (`-alpha.N`, `-rc.N`) needs none.
