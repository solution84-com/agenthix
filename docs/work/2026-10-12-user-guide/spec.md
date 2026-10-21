---
created: 2026-10-12
description: The user guide — a Getting started section and six journeys covering every feature Agenthix has after the screen review, written in docs/guide/ under its README's rules; screenshots made by Playwright recipes against a fictional sample organisation, compared with the last release on every change and published by one manual run per release tag.
---

# Design Spec · The user guide

**Drafted** on 2026-10-12 from the design session held with the owner that day, for the owner's review. How it is
built is in `plan.md`, written next. Planned for the first release.

## Why this exists

Once Agenthix is public, someone outside the team must be able to install it, set it up and use
it from its guide alone. The screen review that closed on 2026-10-12 settled every screen, so the guide can be written
now against what ships. The website publishes the guide at agenthix.com/docs from each release tag; this repository
writes it, and makes and publishes its screenshots.

**How a page is written is settled** in [`docs/guide/README.md`](../../guide/README.md): its front matter, sections as
folders, links and anchors the site's build checks, the words it uses, `screenshot:<name>` references and Mermaid
diagrams. This spec decides what the guide covers and how its screenshots are made.

## Terms

| Term | Means |
|---|---|
| **Journey** | A section of the guide that follows one kind of reader through one goal, over a few pages — not one page per feature |
| **Recipe** | A short Playwright script that opens one screen of Agenthix with sample data and saves one screenshot |
| **Sample organisation** | The fictional organisation the recipes run against, loaded straight into the databases |
| **Capture run** | A run of the recipes, which compares each screenshot with the last release's and reports what changed |
| **Release set** | The full set of screenshots a capture run keeps for a release tag, ready to publish |

## 1. What the guide covers

### Every feature, by journey

The guide covers every feature Agenthix has today. A stock-take of the code on 2026-10-12 found fourteen feature
areas, all complete:

1. Install
2. Getting in: setup, invitations, password reset
3. Home and Chat
4. Projects, tasks, boards and the timeline
5. Agents
6. Runs, approvals and Notifications
7. Automation and routines
8. Files, knowledge, workspaces and previews
9. People and teams
10. The Library
11. Execution Sites
12. Model access and integrations
13. Logs and diagnostics
14. A person's devices and tools: connections, voice, settings

**Left out:** the Library's Marketplace, which says "Coming soon" — the README allows nothing that hasn't shipped.
Workforce templates go on the Library page only if their screens are confirmed reachable while it is written.

### Getting started first, then journeys

A new reader starts with one concept page, then the shortest path from nothing to an agent finishing a task. The
journeys go deeper after it. Each journey opens with a line on what it uses and links back to *How Agenthix works*,
and each page defines *hq* and *site* the first time it uses them.

| Section — folder | Pages |
|---|---|
| **Getting started** — `getting-started/` | How Agenthix works · Install Agenthix · Finish setup · Your first conversation · Your first task · Joining by invitation |
| **Bring your people in** — `people/` | Invite people and choose their role · Teams · Your organisation's page and sign-in · When someone forgets their password or leaves |
| **Get work done in a project** — `projects/` | Projects, and who can join · Boards, tasks and the timeline · Follow what agents are doing · Files, workspaces and previews |
| **Shape your agents** — `agents/` | Create an agent · Instructions and memory · Permissions and approvals · The Library |
| **Let agents work on their own** — `automation/` | Turn on automation · Routines · Limits, and stopping everything |
| **Connect your own tools** — `your-tools/` | Models: the organisation's and your own · Claude Code and other tools · Voice · GitHub · Your settings |
| **Run it on a server** — `running-agenthix/` | A domain and HTTPS · Add an Execution Site · Logs and diagnostics · Back up and upgrade · Get back in as an administrator |

Thirty-one pages, plus the guide's `index.md` and one per section. Every feature area has at least one page:

| # | Feature area | Covered by |
|---|---|---|
| 1 | Install | Install Agenthix · Back up and upgrade · Get back in as an administrator |
| 2 | Getting in | Finish setup · Joining by invitation · When someone forgets their password or leaves |
| 3 | Home and Chat | Your first conversation |
| 4 | Projects, tasks, boards, timeline | Your first task · Projects · Boards, tasks and the timeline |
| 5 | Agents | Create an agent · Instructions and memory · Permissions and approvals |
| 6 | Runs, approvals, Notifications | Your first task · Follow what agents are doing |
| 7 | Automation and routines | Turn on automation · Routines · Limits, and stopping everything |
| 8 | Files, knowledge, workspaces, previews | Files, workspaces and previews · A domain and HTTPS |
| 9 | People and teams | Invite people · Teams · Your organisation's page and sign-in |
| 10 | Library | The Library |
| 11 | Execution Sites | How Agenthix works · Add an Execution Site |
| 12 | Model access and integrations | Finish setup · Models · GitHub · Voice |
| 13 | Logs and diagnostics | Logs and diagnostics |
| 14 | Devices and tools | Claude Code and other tools · Voice · Your settings |

**Install Agenthix** and most of **Run it on a server** describe `./agenthix install` as it is today. Host management
changes how hq and its site are installed and
administered, and revises those pages when it lands.

### The overview picture

*How Agenthix works* opens with one picture: people reach hq, and Execution Sites connect out to hq and run agents in
containers. It is a designed SVG in `docs/guide/assets/`, drawn in the website's colours, because it is the reader's
first impression and its shape does not change between releases. It is drafted outside git and committed only once
the owner settles it. Every other diagram in the guide is Mermaid, written in the page.

## 2. Recipes and the sample organisation

- **One recipe per screenshot**, in `hq/e2e/guide/`, named after it: `project-board.recipe.ts` makes
  `screenshot:project-board`. They run as their own Playwright project in hq's existing setup.
- **A recipe** signs in as a sample person, opens one screen, waits until it has settled, and saves one PNG.
- **Every capture is the same:** a 1440×900 window at twice the pixel density, hq's default theme, a fixed date, time
  and timezone so relative times never change, and animations off.
- **The sample organisation** is loaded by one script, `hq/e2e/fixtures/seed-guide-data.mjs`, straight into hq's and
  the site's databases:
  - an administrator, members and a viewer, named neutrally
  - two teams
  - a few projects with boards, tasks and comments
  - agents with past runs and one approval waiting
  - a routine
  - the paired default site and one more site

  No agent runs and no model or key is needed. Nothing it stores names the product.
- **A name check** fails when a page uses a `screenshot:<name>` with no recipe, or a recipe has no page using it.
- **Two commands** run all of it on a developer's machine, and the workflows call the same two:
  - `npm run guide:screenshots` loads the sample organisation, runs the name check and every recipe.
  - `npm run guide:compare` compares the captures with the last release and writes the report.

## 3. Capturing and comparing

The workflow **Guide screenshots**, `.github/workflows/guide-screenshots.yml`, is this repository's first GitHub
Actions workflow. It starts Postgres for hq and the site, installs Node and the pinned Wasp version, migrates both
databases, starts the site and hq, then runs `guide:screenshots` and `guide:compare`.

**The comparison** checks each capture against the last release's image at
`https://assets.agenthix.com/guide/<last release tag>/<name>.png`, which is public. Each screenshot is **changed**,
**new** or **removed**; a difference of a few pixels is ignored. Before the first release there is nothing to compare
with, so every screenshot is new. The report is the run's summary page: each changed, new or removed screenshot,
the old beside the new.

| What starts it | What it keeps |
|---|---|
| A push to `main` that touches `hq/src/`, `hq/e2e/guide/`, the sample organisation or `docs/guide/` | The report and the changed screenshots. A check only |
| Run by hand on any branch — the Actions tab, or `gh workflow run guide-screenshots.yml --ref <branch>` | The same. How a unit tests its screens before it merges |
| A pull request touching the same paths | The same. For outside contributors once the repository is public |
| A release tag, `v*` | The report and **the release set**: every screenshot, kept 90 days |

Only a release tag makes a release set, so an ordinary push to `main` can never be published.

## 4. Publishing

The workflow **Publish guide screenshots**, `.github/workflows/publish-guide-screenshots.yml`, is started by hand from
the Actions tab with one input, a release tag, and a **dry run** setting that is on by default.

- It refuses a tag that is not a release tag (`v*`), or whose capture run did not pass.
- It fetches that tag's release set and uploads each screenshot to `guide/<tag>/<name>.png` in the website's
  storage, served at `https://assets.agenthix.com/guide/<tag>/`. A dry run lists what it would upload and where,
  and uploads nothing.
- It refuses to write into a tag's folder that already holds screenshots: each release's folder is written once.
  A fix is a new tag.
- **The upload token** is a secret of the GitHub environment `guide-screenshots`, which only this workflow uses. The
  website sets up the storage and issues a write-only token; the owner adds it to the repository.

**Why a manual run, and not an approval inside the capture run:** GitHub offers required reviewers on a private
repository only on its Enterprise plans, and this repository is private on the Team plan until launch. A manual run
works the same on any plan, private or public, so it never has to change. The click it asks for is the same.

**After the upload** the website rebuilds from the tag. That rebuild hook is the website's.

## 5. The README

[`docs/guide/README.md`](../../guide/README.md) gains:

- **In Images:** where recipes live, how to add one, and the name check.
- **A new section, *Publishing screenshots at a release*:**
  1. Tag the release.
  2. Read the capture run's report.
  3. Run **Publish guide screenshots** with the tag, as a dry run.
  4. Run it again with dry run off.
  5. If something is wrong, fix it and tag again.

## 6. Testing

- **Unit tests** for the name check and the comparison: changed, new and removed screenshots, a difference under the
  threshold ignored, and no earlier release.
- **Every recipe runs** in `guide:screenshots`, on a developer's machine and in the workflow.
- **The capture workflow is run by hand on `feature/user-guide`** before the unit merges.
- **The publish workflow is tested as a dry run only.** Its first real upload is the release candidate's tag, in
  *Release ready*.
- **Every page builds on the website** — front matter, links and anchors — previewed from a local checkout before
  the unit closes.
- **The QA contract** gains the stories and scenarios for the guide's tooling at the close, with their tests tagged.

## 7. Out of scope

- The website's rebuild on a release, and its storage and token — the website's.
- Revising *Install Agenthix* and *Run it on a server* after host management.
- The signed desktop app, a Post-launch nice-to-have.
- The Library's Marketplace, until it ships.
- Guides for Agenthix Cloud and the mobile app, which are written with those products.
