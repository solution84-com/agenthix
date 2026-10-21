---
created: 2026-10-20
description: How the first pre-release is cut — the four small changes Agenthix Cloud needs from hq first, made by the lead on the unit's branch, then v1.0.0-alpha.1 tagged on main and what it publishes proved, up to a machine installing from the images.
---

# Implementation Plan · The first pre-release

## Goal

Cut `v1.0.0-alpha.1` once hq does what Agenthix Cloud needs of it, and prove what the tag publishes, as the unit's
[README](README.md) has it.

**In scope:** pre-release tags named `-alpha.N`; an hourly check-in while connected; Cloud's `429` answered; the
README's line asking for a star; the tag, the GitHub pre-release, the guide's screenshots, the signed images and
`@agenthix/core`; a fresh machine installing from the images, and the Install page and the pinned Postgres digest
moved forward.

**Out of scope:** Cloud's own side — its connection server, its staging site, its controller taking registry
credentials — which waits on this tag. Making the image packages public: they stay private until the first release.
Retrying a `429` by itself beyond the next check-in: an admin asks again, and the check-in comes round within the hour.

## Approach

**Phase 1 is four small changes in different files, made by the lead, one commit each**, on
`chore/first-pre-release`. None needs a lane: each is a few files with its tests, and none touches another's files, so
there is nothing to merge and no resource strategy is needed (no agents run in parallel). Each change starts from a
test that fails without it.

- **Alpha.** The workflows' tag filters and version checks, and the host service's `isPublishedVersion` and its
  pre-release ordering, accept `-alpha.N` and order it before `-beta.N` before `-rc.N` before the release. `-beta.N`
  stays accepted: it is still a pre-release form a later cut may use, and refusing it would gain nothing. The
  workflow test that holds the workflows and the host service to the same versions covers the new form.
- **The hourly check-in** is a timer the connection resets each time it signs for a token: whenever 55 minutes pass
  without one, it signs for one, through the same path every other token takes. A busy hq therefore adds no call,
  and a quiet one asks once within every hour, which is what Cloud reads as the check-in. A stored connection checks
  in at start-up; the timer stops when the connection ends from either side. Cloud away or busy at a check-in leaves
  the connection as it is and tries again in five minutes, or once `Retry-After` has passed.
- **`429`** is read in `cloudClient.ts` for every call it makes, as a `CloudBusyError` (a `CloudCallError`, so every
  caller that handles a failure still does) carrying when to try again, read from `Retry-After` — seconds or an HTTP
  date, 60 seconds when absent or unreadable. The connection does not call Cloud again before then; an admin asking to
  connect is told *Agenthix Cloud is busy — try again in N minutes*; the device poll waits it out like a failed poll.
- **The star** is one sentence in the root README, after getting started.

Then the lead runs every module's typecheck and its unit and integration suites, the cross-app suite and hq's
end-to-end tests, and the owner decides how phase 1 lands on `main`: the branch's `--no-ff` merge after regrouping,
or each change by pull request with its check. The capture workflow runs on a pull request.

**Phase 2 is the release procedure in the guide's README, under *Tags*, carried out by hand.** Every tag, push,
release and publish is the owner's, each on their say-so; the lead prepares each command, checks each result and
reports it. Anything wrong after the tag is fixed on `main` and tagged `-alpha.2`.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0117 (published images signed by one workflow) · ADR-0135 (Cloud connects an hq it runs) — both Accepted |
| **Implements** | None |
| **Revisits** | None — the version forms are not a decision record; the release procedure in the guide's README is their home |

## Key decisions

| Decision | Why |
|---|---|
| Pre-releases are `-alpha.N` until the scope is frozen | Nobody outside the team can run the platform before launch (owner, 2026-10-20) |
| `-beta.N` stays accepted, ordered between alpha and rc | Removing a form gains nothing and would need putting back for a later beta |
| The check-in reuses the access-token path | One way to call Cloud with the connection's key; a check-in never adds a call when a token is due anyway |
| Not a separate "heartbeat" endpoint | Cloud already reads the token request as the check-in; a new endpoint would be a protocol change for both sides |
| The check-in timer lives in the connection, reset by every token signed for | Only the connection knows when it last signed; a separate module would duplicate that, or poll on a fixed hour and miss it by up to two |
| `429` is a kind of `CloudCallError` | Every caller already handles a failed call; only the connect path needs to say more |
| Not retrying a `429` by itself | A person asked; telling them when is clearer than a request that quietly succeeds minutes later |
| A fresh machine proves the install: the maintainers' own development machine, its containers torn down first (owner, 2026-10-20) | It is the install a self-hoster does; Cloud's staging run needs registry credentials its controller does not take yet |

## Work breakdown

Two phases. The seam is the tag: what Cloud needs from hq must be on `main` before the tag that publishes it.

### Phase 1 — what Cloud needs from hq
**Delivers:** the four changes on `main`, with the whole regression passing.
**Starts when:** —
**Execution plan:** none — by hand: four small changes in separate files, by the lead.

- [x] 1.1 Pre-release tags `-alpha.N`: the workflows, the host service's version check and ordering, the documents
- [x] 1.2 A connected hq checks in with Cloud at least hourly
- [x] 1.3 Cloud's `429` answered, with `Retry-After` honoured and the admin told when to try again
- [x] 1.4 The README asks for a star

### Phase 2 — the tag and what it publishes
**Delivers:** `v1.0.0-alpha.1` released as a pre-release, its screenshots, images and `@agenthix/core` published,
and a fresh machine installing from them.
**Starts when:** phase 1 is on `main` and the capture workflow passes there.
**Execution plan:** none — by hand: the procedure is the guide's README, under *Tags*.

- [x] 2.1 `v1.0.0-alpha.1` tagged on `main` and pushed; its images failed to build (see *Deviations*)
- [x] 2.2 The GitHub release made as a pre-release
- [x] 2.3 The capture run passes at the tag
- [x] 2.4 *Publish guide screenshots* run as a dry run, then for real; the set served
- [x] 2.5 The images, both architectures, and their signatures checked at `1.0.0-alpha.1`
- [x] 2.6 `@agenthix/core@1.0.0-alpha.1` under `next`, installing from outside this repository
- [x] 2.7 This machine, its containers torn down, installs from the images; a bad signature is refused — moved to the version baseline and done there for `v0.1.0-alpha.1`
- [x] 2.8 The Install page gives the published image, and the pinned Postgres digest moved forward — moved to the version baseline and done there for `v0.1.0-alpha.1`
- [x] 2.9 The website unchanged by the pre-release, confirmed — moved to the version baseline and done there for `v0.1.0-alpha.1`
- [x] 2.10 Every check of a version takes a pre-release: the Dockerfiles, the build scripts, core's parser, the Fleet Console's joins, the host CLI, a backup's version
- [x] 2.11 The release publishes nothing until the commit's checks pass and every image builds; `@agenthix/core` last
- [x] 2.12 `v1.0.0-alpha.2` tagged, and steps 2.2–2.9 carried out for it — moved to the version baseline and done there for `v0.1.0-alpha.1`

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | 1.4 needed no change: the README's *Contributing* section already ends asking for a star, one quiet line | Added with Agenthix Cloud's decisions; the line reads as the task asks |
| 1 | The check-in is a timer inside the connection, not a module beside it | Planned as its own module for size; a fixed hourly timer beside the connection could not see tokens signed for otherwise, and would leave up to two hours between check-ins |
| 2 | `v1.0.0-alpha.1` published `@agenthix/core` but no images, and the cut is `v1.0.0-alpha.2` (tasks 2.10–2.12) | The host service's and the Fleet Console's Dockerfiles and build scripts, core's request parser, the Fleet Console's joins and the host CLI took only `x.y.z`, which the earlier unit's pre-release work missed and no test built; and *Publish core* ran beside *Publish images*, not after it, with neither waiting for Checks. Alpha.1 keeps its tag and screenshots and gets no GitHub release |
| 2 | 2.2–2.6 done for `v1.0.0-alpha.2`; 2.7–2.9 and the rest of 2.12 moved to the version baseline (`docs/work/2026-10-21-version-baseline/`) and done there for `v0.1.0-alpha.1`. The `v1.0.0-alpha.*` tags, release and published versions were then deleted, since they sort above every `0.x` | The product stays below 1.0.0 until general availability, so the baseline was cut as `0.1.0-alpha.1`, and installing from the images waited for it (owner, 2026-10-21) |
