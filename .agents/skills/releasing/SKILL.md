---
name: releasing
description: Use when cutting, proving, tagging or patching a release of Agenthix — the Release workflow and its dry run, the release rehearsal, the release build, the tag that publishes, a patch on a release branch, a failed release or publish, and which lines are maintained. Maintainers only.
---

# Releasing

**A release is one run of the *Release* workflow** (`.github/workflows/release.yml`,
[ADR-0190](../../../docs/adr/adr-0190-a-release-is-started-by-one-workflow.md)) on a proven commit of `main`
([ADR-0146](../../../docs/adr/adr-0146-a-release-is-a-proven-build-given-a-name.md)). Nothing is built at the tag, and no
commit sets a version: every `package.json` stays at `0.0.0`. A push to `main` runs *Checks* only: no release, no
screenshots, no tag.

1. **Start it** with the version, on `main`, from the repository's **Actions** tab, from the VS Code task
   *[release] Release*, or:

   ```sh
   gh workflow run release.yml --ref main -f version=0.1.0-alpha.4
   ```

   One run goes at a time. Each stage is a job; the first that fails stops the run, and its last job names that stage
   on the run's page:
   1. **The commit and the version**: the run's commit is its branch's tip and *Checks* passed for it; the version is
      a release version and not yet tagged; no flag released in an earlier minor release is still listed
      ([feature flags](../../../docs/architecture/feature-flags.md)); the Sigstore trust root hq carries is no older
      than 300 days (`npm run sigstore:refresh` in `hq/` fetches a new one, committed before the release).
   2. **The guide's screenshots are captured** for that commit (*Guide screenshots*).
   3. **They are pinned to the tag** (`npm run guide:pin`, [the guide's README](../../../docs/guide/README.md#releasing-the-screenshots)).
      When that changes the pages, the workflow commits the edit (`docs(guide): pin the screenshots to v<version>`)
      and pushes it to `main`, and starts *Checks* for it; that commit is the one proved and tagged. No change: the
      same commit goes on.
   4. **The release build** (`release-build.yml`): every image part with a new key, for amd64 and arm64, built,
      started and attested; the install test; the screenshots again, the set the tag takes; core packed.
   5. **The tag**: once *Checks* passed for that commit, the workflow creates `v<version>` on it, and starts *Publish
      release* at the tag and follows it. Publishing verifies each image's attestation and recomputed key, makes and
      signs each version's index, publishes core and makes the release page, with the guide's screenshots linked to
      the tag attached (only those; it fails before publishing anything if the release build's set lacks one).
2. **A dry run** does everything but push, tag and publish: on any branch, pushed first, with the VS Code task
   *[release] Dry run (this branch)*, or `gh workflow run release.yml --ref <branch> -f version=<version> -f dry_run=true`.
   A dry run does not wait for *Checks*, which do not run on such a branch. A pin commit it makes is pushed to no
   branch, only to a ref of the run's own that the run deletes at its end.
3. **The release rehearsal is an optional local dry run**, on the dev machine, for its own architecture:
   `RELEASE_VERSION=<version> scripts/release/prove.sh` (the image keys, the images built and started, the install test
   and the guide's screenshots, and the flags and trust root checks). The full regression runs with it
   (`testing-a-change`). Before a release, the upgrade test (`scripts/upgrade-test/run.sh`) also runs from the
   previous release to the candidate's images (`UPGRADE_TEST_FROM`, `UPGRADE_TEST_TO_TAG`), so its migrations are
   proved to carry an installation's data.
4. **If a release run fails**, the fix is worked on a branch, and *Release* is run there as a dry run
   (`--ref <branch> -f dry_run=true`) until it passes. Then the fix lands on `main` as one commit, and *Release* runs
   again. A change to a workflow file, or to a script only a workflow runs, is proved the same way: the dev machine
   cannot prove it.
   - **If it fails after the tag was created**, the tag and whatever that attempt published (images, the core package,
     the release page with its screenshots) are deleted by the admin, the fix is made as above, and *Release* runs for
     the same version: the links already name it, and a retry promotes the same images. A publish that failed for a
     passing reason (a registry outage) is retried without a new tag:
     `gh workflow run publish-images.yml --ref v<version>`.
   - **A version that published is never published again**, even when it turns out not to work: someone may already
     have it. Its fix takes the next number: `0.1.0-alpha.3` after `0.1.0-alpha.2`, `1.0.2` after `1.0.1`.
   - Any release may go out first as a release candidate (`1.0.1-rc.1`, then `rc.2`) and become final once it is
     proved, with nothing but fixes between them; a release candidate and an alpha are both optional. `0.1.0` has no
     release candidate: its alphas run until it is called right, then `v0.1.0`.
5. **A patch is cut from `main`.** It carries fixes, and any code behind a flag that is off in production
   (experimental or preview); it never moves a flag forward, which only a minor or major release does
   ([ADR-0172](../../../docs/adr/adr-0172-a-flag-has-a-stage.md)). **A release branch exists only for a patch while
   `main` holds a change that may not go out in one**, behaviour not behind a flag, cut from the newest tag of its line
   (`release/1.0.1` from `v1.0.0`, `release/1.0.2` from `v1.0.1`).
   - On it: the fix, then *Release* run on the release branch (`--ref release/1.0.1`), which pins, proves and tags its
     last commit there. Then it is merged into `main` with `--no-ff` and deleted.
   - When `main` has not moved since the release, the fix goes on `main` and is released from there.
   - `main` never flows into a patch branch. Where `main` has rewritten the code a fix touches, the fix is ported to
     `main` by hand with `git cherry-pick -x` instead of merged.
   - A patch on a release branch holds fixes only.
6. **Tags are permanent.** A repository ruleset stops `v*` tags being moved or deleted; the admin's bypass is for a
   publish that failed part-way. A tag pushed by hand still publishes, but a release is not made that way.
7. **What the workflow needs of the repository:** the pin commit is pushed with a deploy key that may bypass `main`'s
   ruleset (GitHub allows no workflow token as a bypass actor). The key's private half is `RELEASE_PIN_DEPLOY_KEY` in
   the `release-pin` environment, which only `main` and `release/*` may use, so only the pin job on those branches can
   read it. Revoking it is deleting the deploy key. Creating a tag needs no bypass.

**At most two lines are maintained**: the newest minor of the current major and of the one before. Before `1.0.0`,
only the newest release ([versioning.md](../../../docs/architecture/versioning.md#the-product-version)).

**A QA audit** is required before a release, `0.1.0` the first; a pre-release (`-alpha.N`, `-rc.N`) needs none.
