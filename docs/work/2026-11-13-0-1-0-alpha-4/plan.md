---
name: 0.1.0-alpha.4 — plan
description: The phases of the 0.1.0-alpha.4 unit — the release rules, the fixes the pre-release must carry, the cut, and the switch to it.
created: 2026-11-13
---

# 0.1.0-alpha.4 — plan

## Goal

`v0.1.0-alpha.4` published from today's `main`, ready for the live demo to be installed from, and the host service's
switch to it proved ([README](README.md)).

## Approach

**On `chore/0.1.0-alpha-4` from `main` (`4a077576`).** Phase 1's changes are made and tested on the branch, which merges to
`main` before the cut: a release is a tag on a commit of `main`, so the cut is made from `main` after the merge, never
from the branch. Phase 2 is the releasing skill's steps 1–4. Phase 3 proves the published
version can be switched to; what it finds becomes a fix here or an issue.

**Pushes and the tag are the owner's.** The full regression runs once, on the merged `main`, as part of the release
rehearsal.

## Work breakdown

### Phase 1 — Before the cut

- [ ] 1.1 **The release rules for 0.1.0**: `docs/architecture/versioning.md` › *The product version* (alpha while adding, rc
      while proving with an audience; both optional for any release; 0.1.0 is cut as alphas, with no release candidate,
      because it is not tested with an audience before it ships), the releasing skill's step 6, `AGENTS.md` and the
      `database-migrations` skill (the clean slate lasts until `v0.1.0`; the squash is in the commit tagged `v0.1.0`),
      and ADR-0146's patch rule, which reads from `v0.1.0`. Check that nothing in CI or code expects a release candidate
      before 0.1.0 (`release-build.yml`, `core/src/shared/featureFlagReleases.ts`).
- [ ] 1.2 **The demo's entry says what entering agrees to**: under *Enter the demo*, one line linking the Terms and
      the Privacy Policy and saying not to type anything personal, as the demo is shared and wiped every 6 hours; the
      demo's own privacy notice linked where it fits.
- [ ] 1.3 **The guide offers no service that has not opened**: until it is announced, the guide's Cloud page and its
      sidebar entry are left out of the published guide, and the setup table, the commands page and the demo page say
      nothing of it beyond what the product itself shows.
- [ ] 1.4 **A task's files where people look** (decided 13 Nov: keep the task's own folder): a *Files* tab beside
      Activity, Comments and Runs, with a count, holding the working files list (moved from the bottom of the side
      panel); a path in a run's result that names a file in the folder is a link that opens it beside the task.
- [ ] 1.5 **The demo says when it was last reset, and a failed reset is tried again soon**: the demo's public
      information (what the entry page reads before anyone signs in) also says when the demo was last reset, so a
      demo that stopped resetting can be seen from outside; a reset that fails is tried again after about 10 minutes,
      not at the next scheduled time.
- [ ] 1.7 **Agenthix Cloud behind a preview flag** (ADR-0189, owner 14 Nov): one flag, `cloud`, at preview, checked
      first at every entry point that offers or uses Cloud — hq's operations, routes and screens (connecting HQ,
      Cloud as a provider of models and voice, signing in with an Agenthix account, Cloud's offers to members), the
      site, the host service and its `agenthix cloud …` commands, the Fleet Console and its screens — with a test per
      entry point that it is hidden while off.
- [ ] 1.6 **Already done, closed**: the room under a conversation at rest, fixed and pushed with the pre-release fixes.

### Phase 2 — The cut

- [ ] 2.1 The screenshots pinned to `v0.1.0-alpha.4` on `main`, from a capture of that commit.
- [ ] 2.2 The release rehearsal passes on it (`RELEASE_VERSION=0.1.0-alpha.4 scripts/release/prove.sh`), with the full
      regression.
- [ ] 2.3 The release build passes on it.
- [ ] 2.4 The owner tags `v0.1.0-alpha.4`; the publish passes and the release page carries its screenshots.

### Phase 3 — After the publish

- [ ] 3.1 **The switch between two published versions** (as the host service's switch issue directs): on the dev
      machine, an installation of `v0.1.0-alpha.3` under a test namespace moves to `v0.1.0-alpha.4`
      (`agenthix upgrades host`) and answers as the new version, its old container removed, hq, the site and the Fleet
      Console still running; and a switch that fails is put back.

## Not in this unit

- A request rate limit at the demo's front door (an image of our own with a rate-limit module): after launch. hq's
  entry caps and storage budgets stand in; at worst the demo refuses new work until its next reset.
- `v0.1.0` itself, and squashing the migrations into its commit.
- The other proofs on real machines before 0.1.0: two machines together, the agent containers and
  the executor's controls on a Linux host, the walkthrough on Wasp 0.25.
- The model checks for skills, and the owner's walk of the error-message kinds.

## Open questions

Decided by the owner on 13 Nov: a task's files shown where people look, keeping its folder (1.4); the demo's last
reset shown in its public information, and a failed reset retried soon (1.5); the front door's rate limit after
launch; the Linux proofs left with the other proofs on real machines before 0.1.0.

## Deviations

| Date | What changed | Why |
|---|---|---|
| 14 Nov | Added 1.7: Agenthix Cloud behind a preview flag (ADR-0189, supersedes ADR-0130) | Cloud's service does not open with the first release; the product must not offer it before it is announced |
