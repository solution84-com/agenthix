# Writing the user guide

This folder is the Agenthix user guide: how to install, use and run Agenthix, for the people who do. It is
published at [agenthix.com/docs](https://agenthix.com/docs) from each release. Readers outside the team read it
there, not here. Notes for people changing Agenthix's code belong elsewhere in `docs/`, not in this guide.

These rules are what the site reads. A page that breaks a rule marked **(build)** stops the site from building,
so nothing broken is ever published.

## Change it with the code

A change to how Agenthix installs, looks or behaves updates the guide in the same pull request. The site publishes
the guide as it stands at the latest release, so a page describes the release it ships with. The guide for an
earlier release is read on GitHub at that release's tag.

## Structure

For example:

```
docs/guide/
  README.md                  this file — never published
  index.md                   the guide's overview page
  glossary.md                every word the product shows, where it is, what else it is called
  getting-started/
    index.md                 the section: its label, its place, and its landing page
    install.md
    first-project.md
  working-with-agents/
    index.md
    agents.md
  assets/                    permanent images only (see Images)
```

- **A folder is a section of the sidebar.** Every section folder has an `index.md`. Its `title` is the section's
  label, its `sidebar.order` is the section's place, and its body is the section's landing page.
- **A section may hold sections**, in the same way, but keep the guide to two levels. A reader lost three folders
  deep is better served by a shorter guide.
- **File and folder names are lowercase words joined by hyphens** (`first-project.md`). A file's path is its
  address: `getting-started/install.md` is served at `agenthix.com/docs/getting-started/install/`. Renaming a
  published page breaks every link to it from outside, so rename only when the old name is wrong.
- **`README.md` files are never published.** Use them for notes to the guide's writers, as this one is.

## Front matter

Every page starts with:

```yaml
---
title: Install Agenthix
description: Run hq and its site on your own machine or a VPS.
sidebar:
  order: 1
---
```

| Field | | What it does |
|---|---|---|
| `title` | **Required (build)** | The page's heading, its name in the sidebar and in search. On a section's `index.md`, the section's label |
| `description` | **Required (build)** | One sentence saying what the page helps the reader do. Shown under the title, in search results and in links shared elsewhere |
| `sidebar.order` | Recommended | The page's place among its siblings: lower comes first. Pages without one follow those with one, in order of title |
| `draft` | Optional | `true` keeps the page off the published site. On the guide's top `index.md`, it keeps the whole guide off. Drafts still show, marked as drafts, when the site is previewed |

## Writing a page

- **Don't repeat the title as a `#` heading.** The site shows the title from the front matter. Start the page's
  own headings at `##`; they become the page's "On this page" list.
- **Say what the reader does, in the order they do it.** One task per page. Steps are a numbered list; a command
  goes in a fenced code block with its language (` ```sh `).
- **Write for this release.** No "coming soon", no dates, nothing about a feature that hasn't shipped.
- **A new word a person might say goes into the [glossary](glossary.md),** as a new screen needs its page. A word is
  anything the product shows people: a screen, a section, a setting, a tool. Its entry says what it is, where it is
  (the screen and its address in HQ) and, under **Also said**, the other words people use for it. Agents read the
  glossary to learn what a person means, so a missing word is a word they cannot place.

## Links

- **Between guide pages, link by relative path to the `.md` file:** `[install Agenthix](../getting-started/install.md)`.
  The link then works both here on GitHub and on the site. **(build)** A link to a page that doesn't exist fails
  the build.
- **An anchor names a heading on the linked page**, in GitHub's form: `## What you need` is
  `install.md#what-you-need`. **(build)** An anchor that matches no heading fails the build.
- **Never link to `agenthix.com/docs/…` from inside the guide.** It points at the latest release, not the one the
  page belongs to.
- **Anything outside the guide** — the repository's code, another site — is a full `https://` link.

## Words

- **Define *HQ* and *Execution Site* the first time a page uses them**, written as the screens write them. A
  reader may land on any page from search, with no earlier page read.
- **Name screens and controls exactly as Agenthix shows them**, in bold: **Settings**, **New project**. The reader
  is matching the page to the screen in front of them.
- **Refer to a person as "they" and "their".** The reader may be anyone, and so may the people they work with.
- **Describe state in words — "passes", "fails", "running" — never by colour.** Not every reader sees colour, and
  a screenshot's colours can change between releases.

## Images

- **Screenshots are never committed.** Each is a recipe that captures one view of Agenthix with sample data, taken
  by every release build. A screenshot is an asset of the GitHub Release that first carried it as it looks now, and a
  page links it by its address there:

  ```markdown
  ![The project board with three tasks in progress](https://github.com/solution84-com/agenthix/releases/download/v0.1.0/project-board.png)
  ```

  The name, `project-board`, is lowercase words joined by hyphens and matches its recipe. The tag, `v0.1.0`, is the
  release that holds the picture, so the pages of each version show that version's pictures, on GitHub too. The alt
  text says what the picture shows, for readers who can't see it. The site and the Fleet Console's Help use the address
  as it is.
- **A new screenshot links the upcoming release's tag**, the version being prepared (for example `v0.1.0-alpha.4`
  after `v0.1.0-alpha.3`). Until that release is out its picture does not load, and shows as its alt text. Use the same
  form for a screenshot you change: if you are unsure of the tag, any release tag will do, because the pin step (below)
  writes the right one before each release. A name is linked to one tag wherever it appears.
- **Every screenshot has a recipe** in [`hq/e2e/guide/`](../../hq/e2e/guide/README.md), named after it:
  `home.recipe.ts` makes `home.png`. That README says how to write one and run them. **(check)** A linked name with no
  recipe, a recipe no page links, a name linked to two tags, a tag that is not a release tag, or a page still using the
  old `screenshot:<name>` form fails `npm run guide:screenshots` and the *Guide screenshots* workflow. The check reads
  the guide's pages and the repository's root `README.md`.
- **Permanent images** — a logo, an illustration that doesn't change with the interface — are committed in
  `assets/`, as SVG where possible, and linked by relative path: `![Agenthix](../assets/logo.svg)`.
- **Diagrams are Mermaid,** written in the page as a fenced block:

  ````markdown
  ```mermaid
  flowchart LR
    hq --> site
  ```
  ````

## Checking your change

- **On GitHub:** the page renders, and its links between pages work.
- **On the site:** maintainers can preview this folder in the website's build, drafts included, before it is
  published. A page that breaks a **(build)** rule is named in the build's error.

## Releasing the screenshots

**A release carries its new and changed screenshots** as assets of its GitHub Release, and nothing else of the guide:
an unchanged screenshot stays in the release that first carried it, and its links keep naming that release. Nothing is
uploaded by hand and no storage key is needed.

Screenshots are taken by the release build. Every run of the *Release build* workflow (started by hand for a commit of
`main`, or by a push to a patch branch, `release/<version>`) calls *Guide screenshots*, which captures them, compares
each with the picture its link names (or, where that release does not hold it yet, with the one the last release's
pages linked), reports what is new, changed or removed, and keeps them as the set a tag on that commit takes its
screenshots from. The tag captures nothing. `scripts/release/prove.sh` takes them too, on a maintainer's machine.

**Tags.** `v0.1.0-alpha.N` while features still land, until `0.1.0` is called right, then `v0.1.0` (it has no release candidate); the product stays below 1.0.0 until general availability
([versioning](../architecture/versioning.md)). An alpha or a release candidate is a **pre-release**: the website's
live site reads GitHub's *latest release*, which is never a pre-release, so nothing a pre-release publishes reaches
it. A staging copy of the site pins the pre-release's tag to review the guide before launch.

1. **Capture the commit to be released.** The pin step compares a set of captures with the released pictures, which
   were taken on the release build's runner. A set taken on another operating system can draw text differently and
   show every screenshot as changed, so use a set from GitHub's runners: run *Guide screenshots* by hand on `main` at
   that commit (or use a release build's run for it), then download its set into an empty folder:

   ```sh
   gh run download <run-id> --name guide-release-set --dir <folder>
   ```

   A local capture (`npm run guide:screenshots` in `hq/`, or the release rehearsal, both of which leave
   `hq/e2e/guide/.captures`) serves when no release holds a screenshot yet, since then every one is new.
2. **Pin the screenshots to the upcoming tag**, in `hq/`:

   ```sh
   GH_TOKEN="$(gh auth token)" npm run guide:pin -- --tag v0.1.0-alpha.4 --captures <folder>
   ```

   Leave out `--captures` to use `hq/e2e/guide/.captures`. It points every link to a new or changed screenshot, in the
   guide's pages and the root `README.md`, at the upcoming tag, moves an unchanged one back to the release that holds
   it, and writes the comparison's report to `hq/e2e/guide/.report/` (`index.html` shows the old beside the new). It
   refuses a tag that is not a release tag or is already tagged, links the name check would refuse, and a set that
   lacks a linked screenshot. It commits nothing: read the edit, and commit it on `main`
   (`docs(guide): pin the screenshots to v0.1.0-alpha.4`). Run it again if a screen changes before the tag.
3. **Prove the pinned commit** as the [`releasing`](../../.agents/skills/releasing/SKILL.md) skill says: the release
   rehearsal and the release build. Read the build's screenshot report on the run's page in the repository's
   **Actions** tab.
4. **Tag** that commit and push the tag (`git tag v0.1.0-alpha.4 && git push origin v0.1.0-alpha.4`). The tag runs
   *Publish release*, which publishes the images and `@agenthix/core` only once the commit's checks, install test,
   screenshots and release build passed for it (see
   [deployment](../architecture/deployment.md#releases-and-the-images-they-publish)). Before anything is published it
   takes, from that release build's set, exactly the screenshots whose links at the tagged commit name the tag, and
   fails if the set lacks one.
5. **The GitHub release page** is made by *Publish release* once everything is published, with those screenshots and
   the release record attached: a pre-release for an alpha or a release candidate, with notes from the commits since
   the last release. Edit its notes there if they need it.
6. **If something fails after the tag is pushed**, delete the tag and whatever that attempt published (its release
   page and the screenshots on it too), fix it, prove the fixed commit again, and tag the same version again: the links
   already name it. Once a release is out its screenshots are never replaced: a fix is a new version (`-alpha.2`),
   pinned again.

Nothing in this repository starts the website's rebuild; the website's own build picks the tag up.
