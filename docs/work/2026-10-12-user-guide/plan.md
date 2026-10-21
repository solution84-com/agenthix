---
created: 2026-10-12
description: How the user guide is built — the screenshot tooling and its two workflows first, then the guide's 31 pages with their recipes, written in parallel lanes by section.
---

# Implementation Plan · The user guide

## Goal

The user guide in `docs/guide/`, covering every feature Agenthix has, with screenshots made by recipes and published
per release — as designed in [`spec.md`](spec.md).
3 days, 2026-10-13 → 2026-10-15.

**In scope:** the spec's sections 1–6 — the pages, the overview picture, the recipes and sample organisation, the
capture and publish workflows, the README additions and the tests.
**Out of scope:** the spec's section 7. The website's storage, token and rebuild are the website's; the install and
server pages are revised by host management,
not here; the Marketplace and the desktop app have
not shipped; Cloud's and the mobile app's guides are written with those products.

## Approach

**Tooling first, because every page's screenshots depend on it.** Phase 1 builds the path from a fictional
organisation in a database to a reported comparison: the sample organisation, the Playwright project the recipes
run in, the name check, the comparison, and the two workflows. It is proven on the first real section — Getting
started, its pages and their recipes — so the pages in phase 2 inherit a working pipeline rather than discovering its gaps one
page at a time.

**The sample organisation lives in a database of its own.** Following
[ADR-0035](../../adr/adr-0035-test-data-isolation.md), the recipes run against `agenthix_guide` databases for hq
and the site, derived from the dev environment by swapping only the database name and refused unless the name ends
in `_guide`. Running the recipes never touches a developer's own data, and the seed can truncate and reload freely.

**Recipes are written beside the page that uses them**, by whoever writes the page. A recipe is a few lines over a
shared helper — sign in as a sample person, open a route, wait for it to settle, save — so the cost of a screenshot
is deciding what it should show, which is the page writer's call.

**Pages are written against the running app, not the code's intent.** Each section's writer opens every screen the
section describes in a dev hq loaded with the sample organisation, and uses its labels as the screen shows them
(README, *Words*). Where the screen and the stock-take disagree, the screen wins and the stock-take is noted.

**How the work is carried out.** Lanes, each in its own worktree off `feature/user-guide`,
merged into it by the lead one at a time.

- **Phase 1** is two lanes in parallel — *capture* (1.1–1.3) and *checks and workflows* (1.5–1.8) — while the lead
  writes Getting started and its recipes (1.4) itself, since it sets the voice, the sample organisation's names and
  the screenshot style every other section follows. The lead merges capture first, then checks and workflows, then
  Getting started; writes the README additions (1.9); and runs the capture workflow by hand on the branch (1.10).
- **Phase 2** is three lanes in parallel, by section: *people and projects* (2.1–2.2), *agents and automation*
  (2.3–2.4), *tools and running it* (2.5–2.6). The lead settles the overview picture with the owner (2.7), checks
  workforce templates (2.8) and previews every page in the website's build (2.9).
- **Models:** lanes run on Sonnet — each is bounded by its spec section and the README. The lead, on Opus, writes
  Getting started and reviews every page before its lane merges.
- **Resources:** only one hq and site can run on the fixed development ports, and the recipes share the
  `agenthix_guide` databases. Lanes write pages and recipes and run unit tests only; **the lead alone starts the
  stack and runs `guide:screenshots`**, after each merge. Memory is watched while lanes run; at a low-memory alert
  the newest lane pauses first.
- **The owner reads the guide** on the website's preview before the close. Findings are fixed on the branch.
- **Landing:** the branch is regrouped and merged to `main` with `--no-ff` at the close, with the owner's approval.
  The overview SVG is committed only once the owner has settled it.

## Decision records

| | Records |
|---|---|
| **Depends on** | [ADR-0035](../../adr/adr-0035-test-data-isolation.md) (Accepted) — the guide's databases follow its isolation · [ADR-0094](../../adr/adr-0094-hq-operations-are-tested-against-the-real-database.md) (Accepted) — the name check and comparison are pure logic, unit-tested |
| **Implements** | None |
| **Revisits** | None |

## Key decisions

| Decision | Why |
|---|---|
| Tooling before pages | Every page's screenshots need the pipeline; proving it on Getting started's screens finds its gaps once |
| The sample organisation in its own `agenthix_guide` databases | A recipe run must never touch a developer's data, and the seed must be free to wipe and reload |
| Seeding the dev database the browser tests use — **decided against** | The e2e seed is shaped for assertions, not for pictures, and sharing it couples two suites that change for different reasons |
| Recipes written by the page's writer, beside the page | What a screenshot shows is a writing decision; a separate recipes lane would guess |
| Playwright's own screenshot assertions (`toHaveScreenshot`) — **decided against** | They compare against images committed in the repository; the spec keeps screenshots out of git and compares with the last release's published images |
| The lead writes Getting started, in phase 1 | It sets the voice, the sample organisation's names and the screenshot style every other section follows |
| No execution plans | Every task is derivable from the spec, the README and the code by a capable agent; no step is costly to get wrong |

## Work breakdown

### Phase 1 — The screenshot pipeline

**Delivers:** `guide:screenshots` and `guide:compare` working on a developer's machine and in the capture workflow,
proven by Getting started's pages and recipes; the publish workflow, tested as a dry run.
**Starts when:** the spec is approved.
**Execution plan:** none — lanes; the tasks follow from the spec's sections 2–4 and hq's existing Playwright setup.

- [x] 1.1 The `agenthix_guide` databases for hq and the site, derived and guarded as ADR-0035 does
- [x] 1.2 The sample organisation seed, `hq/e2e/fixtures/seed-guide-data.mjs`
- [x] 1.3 The Playwright `guide` project: capture settings, the recipe helper, `hq/e2e/guide/`
- [x] 1.4 The guide's `index.md` and Getting started: six pages, with their recipes
- [x] 1.5 The name check, with unit tests
- [x] 1.6 The comparison and its report, with unit tests
- [x] 1.7 `npm run guide:screenshots` and `npm run guide:compare`
- [x] 1.8 The *Guide screenshots* workflow and the *Publish guide screenshots* workflow — tag input, dry run by default, refusals, the `guide-screenshots` environment
- [x] 1.9 The README additions: recipes in *Images*, and *Publishing screenshots at a release*
- [x] 1.10 The capture workflow run on `feature/user-guide`, its report read — passes; the publish dry run moves to the first release tag, in *Release ready*

### Phase 2 — The pages

**Delivers:** the other 25 pages and each section's `index.md`, and a recipe for every screenshot they use;
the overview picture settled.
**Starts when:** phase 1 is merged into the unit's branch, so the lanes have a pipeline and Getting started to
follow.
**Execution plan:** none — lanes; each lane's acceptance is the spec's section 1 table for its sections and the
README.

- [x] 2.1 Bring your people in: four pages, with their recipes
- [x] 2.2 Get work done in a project: four pages, with their recipes
- [x] 2.3 Shape your agents: four pages, with their recipes
- [x] 2.4 Let agents work on their own: three pages, with their recipes
- [x] 2.5 Connect your own tools: five pages, with their recipes
- [x] 2.6 Run it on a server: five pages, with their recipes
- [x] 2.7 The overview picture settled with the owner, and committed to `docs/guide/assets/`
- [x] 2.8 Workforce templates checked in the running app, and on the Library page if reachable
- [x] 2.9 Every page previewed in the website's build: front matter, links, anchors and screenshot names pass

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | Fresh recipes get their first-admin link from the running HQ's control socket, run one at a time in file-name order, and need the guide databases emptied with HQ stopped (`with-guide-db.mjs --reset true`) before a local rerun | The setup screens exist only before HQ has people, and each fresh screen builds on the one before |
| 1 | The sample organisation also holds an organisation model key (an encrypted placeholder) and one open invitation | Without them Home warned that agents can't answer, and the join page had no link to open |
| 1 | The capture workflow is proven on a draft pull request, not by a manual run; the publish dry run waits for the first `v*` tag | GitHub runs a manual (`workflow_dispatch`) workflow only once it is on the default branch |
| 2 | *Your phone and voice* became *Voice*; the spec is amended in place | The mobile app has not shipped, and the guide describes nothing that hasn't |
| 2 | The compose commands HQ and the installer print gained `--env-file` (24f7fbfe) | The guide's install pages quote them, and they failed as printed |
| 2 | Getting started says why a Claude subscription runs only one's own work, linking Claude's terms (owner, 2026-10-12) | A one-person install set up with a subscription otherwise meets a first task that cannot run |
| 2 | *Install Agenthix* is split into **Install from source**, today's way in, and **Install from an image**, which says no images are published yet (owner, 2026-10-12) | Later ways to install — an image, host management — each get a section with a name that says what it uses |

## Closing note — 2026-10-12

**Accepted by** the owner, 2026-10-12. Every task in the breakdown is ticked.

**Open items:** the reviews, lane reports and fixes were triaged against the code at head: twelve closed in the unit
(among them the compose commands printed without their settings file, fixed in 24f7fbfe, and the sample agents
without instructions); the missing restore steps are covered by host management;
seventeen deferred as issues, none blocking release. The publish step's first run is a sub-issue of
*Release ready*.

**QA:** the contract for the guide's tooling and the printed compose commands is written — US-284 to US-286 and
SC-800 to SC-815, with their tests tagged. No QA audit ran at this close; these entries await the audit before
release. The full regression passed on the combined
branch: core 278, hq unit 2654, site unit 2152, hq integration 3565, site integration 40, cross-app 20.

**Decision records:** ADR-0035 and ADR-0094, depended on, are still Accepted. None implemented, none revisited, none
created.
