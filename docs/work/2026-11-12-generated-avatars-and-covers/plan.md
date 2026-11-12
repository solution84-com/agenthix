---
name: Generated avatars and covers — plan
description: The phases of the generated avatars and covers unit, run by the lead with lane agents to one report at the end.
created: 2026-11-12
---

# Generated avatars and covers — plan

## Goal

Every agent, person, team and the organisation shows a picture hq made or one that was uploaded and re-encoded, each
with a small copy; the picker on [`boards/picker.html`](boards/picker.html) and
[`boards/picker-gallery.html`](boards/picker-gallery.html) built for all four; Kernel with its own robot; the presets
gone ([spec](spec.md), [ADR-0187](../../adr/adr-0187-a-generated-picture-is-a-file-made-from-a-stored-recipe.md)).

## Approach

**Run unattended to the end**, stopping only to publish `robots-1`, which needs the owner's go-ahead. The lead runs the phases with lane agents and the owner sees one report at the end. The
lead decides what can reasonably be decided and records it in the report; a decision whose answer is not obvious is
built the most conservative way and listed for the owner. A change of direction goes in *Deviations* below. Security,
critical and usability issues are resolved in the unit and reported.

**Lanes** (the `running-lanes` skill): one purpose each, on its own branch and worktree cut from
`feature/generated-avatars-and-covers`, merged by the lead one at a time as a single commit rebased onto the branch's
head. Phase 1 lands first; lanes then run in parallel where their files are disjoint, in sequence where they are not.
Lanes run only the unit tests and typechecks of what they touch, through the machine-wide lock; the lead runs the
integration suite after each merge that needs it, and the full regression once at the close, including building and
starting the hq image on each of its platforms (sharp is hq's first native module).

**Another unit may run beside this one** (memory and Your space). Whichever merges to `main` second rebases its
migration onto the other's, moves the client protocol's minor version again, and merges the shared lists
(`readOnlyQueries.ts`, the QA contract).

**Reviews.** Each finished lane goes to a reviewer agent that did not build it, while the next lanes build. The
criteria are written once, before the first review, from this spec and the approved boards, and do not grow during
the unit: a review judges the work against them, not against taste. Each finding is graded:

- **Critical** (the spec is not met, something breaks, or a person is blocked): always fixed.
- **Security** (anything that lets data out, in, or past a check): always fixed, whatever its grade.
- **Should fix** (a real flaw that does not break the spec): fixed when cheap, otherwise listed in the report.
- **Minor** (taste, polish): listed in the report, not acted on.

Two review rounds per lane at most; what is left after the second goes to the report. Besides the lane reviews: an
independent security review of the upload and picture paths (re-encoding, the pixel limit, the containment check,
`size=small` on `/file-link`, deletion and the sweep, the rate limit), and a design and usability review of the picker
and every screen that changes.

## Work breakdown

### Phase 1 — The picture module
- [x] 1.1 Dependencies pinned: `sharp`, `@dicebear/core`, the fourteen styles, `react-easy-crop`; no picture committed
- [x] 1.2 The palette, the recipe type, the style registry and validation (`hq/src/shared/pictures/`)
- [x] 1.3 The avatar styles (robots, faces, symbols, initials) and the cover generator (thirteen
      patterns, looks, blends, directions)
- [x] 1.4 Recipe → full and small WebP on the server; one picture-writing function shared with uploads
- [x] 1.5 The schema: `avatarRecipe`, a person's `coverUrl`, `coverRecipe`
- [x] 1.6 The robots bundle `robots-1` (pictures, manifest, licence notice), published as a release asset with the
      owner's go-ahead; fetched and checked in the hq image build and by a development script; hq without it

### Phase 2 — Uploads and the small copy
- [x] 2.1 Every upload decoded and re-encoded by sharp, with its small copy and the pixel limit
- [x] 2.2 The shared crop-and-compress function in the browser, replacing the three resizers; setup's organisation
      step and onboarding's *You* step use it
- [x] 2.3 `size=small` on `/file-link`, falling back to the full picture; the client protocol's minor version
- [x] 2.4 The shared avatar and cover components ask for the small copy; the inspect view asks for the full one

### Phase 3 — Defaults
- [x] 3.1 A random robot (Thumbs without the robots) and cover for every new agent, whichever path makes it (dialog, template, agent
      tool)
- [x] 3.2 Kernel's robot and a random cover at setup
- [x] 3.3 A random cover for a person when they join; a random cover and Initials for a new team; the
      organisation's cover and symbol at setup
- [x] 3.4 The demo's seed: a recipe for each sample agent, the organisation, each team and each sample person, drawn
      when the demo is seeded

### Phase 4 — The picker
- [x] 4.1 The picker component: Avatar and Cover tabs, Generate or Upload, its own preview, Save and Cancel, Remove;
      the Avatar tab's gallery and fine-tuning; Upload's crop frame
- [x] 4.2 On the agent's page and in the create-agent dialog
- [x] 4.3 On a person's profile, a team's and the organisation's settings; a person's page header and profile card
      show their cover
- [x] 4.4 The inspect view
- [x] 4.5 The save operations, their rate limit, and the demo's guard and storage budget

### Phase 5 — The agent tool
- [x] 5.1 `generate_agent_picture` in place of `list_presets` and `apply_agent_preset`, with the coordinator's label

### Phase 6 — Deleting pictures
- [x] 6.1 The old files deleted when a picture is replaced or removed
- [x] 6.2 The picture sweep, at start and daily

### Phase 7 — Removing the presets, and documents
- [x] 7.1 Everything in the spec's *What is removed*
- [x] 7.2 The user guide's pages on agents' and people's pictures; the third-party notices
- [x] 7.3 The QA stories and scenarios, SC-046 rewritten, tests tagged

### Phase 8 — Proof and report
- [x] 8.1 The reviews above
- [x] 8.2 The full regression, and the hq image built and started on each of its platforms
- [x] 8.3 The report, for the owner's walkthrough

## Deviations

No phase changed direction. Design corrections agreed along the way were made in the spec in place: a robot is
placed at 116%, a recipe keeps every offset and a seed, the cover hues have names of their own, and Initials' artwork
is CC0.

## Closing note (12 Nov 2026)

**Accepted by the owner** on 12 Nov 2026, after reviewing the screenshots of the design review and spot-checking the
development stack.

**Proof.** The full regression passed, after one cross-app test was updated to expect WebP. The hq server image was
built and started on arm64 and amd64. The reviews ran per lane, then a whole-unit security review, then a design and
usability review in a browser on a test installation, in two rounds. Every Critical, Security and Should-fix finding was
fixed, except those deferred below.

**Open items.** Closed in the unit: every review finding not listed below. Deferred, none of them blocking a release:

- #255 — a failed action that declares the User entity replaces the whole app when hq cannot be reached (older than
  this unit; the picker's own save no longer does it)
- #256 — a person's initials are drawn three different ways
- #257 — three scenarios have no test
- #258 — the picker's layout and wording polish
- #259 — an agent's page says HQ did not answer when its site is the one that is unreachable (older than this unit)
- #260 — a picture over the pixel limit is recognised by sharp's error wording

Accepted risks went to ADR-0187's Risks: the demo budget's overshoot, and Initials re-drawn on a rename without the
limit. Closed with no change: a seed draws a different cover arrangement from the board's, a choice of the drawing
rather than a fault. Closed by condition: building hq with compose needs a GitHub token only while the repository is
private. Closed as standard: the robots archive reader cuts a name at a NUL and ignores blocks after the end marker,
and the archive's SHA-256 is checked before it is read.

**QA.** Stories US-055 and US-479 to US-485 and scenarios SC-046 and SC-2002 to SC-2022 are written, and their tests
are tagged. No full QA audit ran; these entries await the audit before release.

**Records.** ADR-0187 was created Accepted, its risks recorded and marked implemented.
