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

- **Screenshots are never committed.** Each is a recipe that captures one view of Agenthix with sample data, run at
  every release; the release uploads the images. A page refers to a screenshot by name:

  ```markdown
  ![The project board with three tasks in progress](screenshot:project-board)
  ```

  The name is lowercase words joined by hyphens, and matches its recipe. The alt text says what the picture shows,
  for readers who can't see it. On GitHub a screenshot shows as a broken image with its alt text; that is expected.
  On the site, before the first release, it shows as a placeholder with its name.
- **Every screenshot has a recipe** in [`hq/e2e/guide/`](../../hq/e2e/guide/README.md), named after it:
  `home.recipe.ts` makes `screenshot:home`. That README says how to write one and run them. **(check)** A
  `screenshot:` name with no recipe, or a recipe no page uses, fails `npm run guide:screenshots` and the
  *Guide screenshots* workflow.
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

## Publishing screenshots at a release

Screenshots reach the site only for a tag, and are taken by the release build. Every run of the *Release build*
workflow (started by hand for a commit of `main`, or by a push to a patch branch, `release/<version>`) calls *Guide
screenshots*, which captures them, reports what changed since the last tag, and keeps them as the set a tag on that
commit publishes. The tag captures nothing. `scripts/release/prove.sh` takes them too, on a maintainer's machine,
before the release build.

**Tags.** `v0.1.0-alpha.N` while only the team can run the platform and features still land, `v0.1.0-rc.N` once
the scope is frozen and only fixes go in, then `v0.1.0`; the product stays below 1.0.0 until general availability
([versioning](../architecture/versioning.md)). An alpha or a release candidate is a **pre-release**: the website's
live site reads GitHub's *latest release*, which is never a pre-release, so nothing a pre-release publishes reaches
it. A staging copy of the site pins the pre-release's tag to review the guide before launch.

1. **Wait for the release build's capture to pass**, and read its report on the run's page in the
   repository's **Actions** tab: every screenshot that changed, is new or was removed since the last tag, the old
   beside the new.
2. **Tag** that commit and push the tag (`git tag v0.1.0-alpha.1 && git push origin v0.1.0-alpha.1`). The tag runs
   *Publish release*, which publishes the images and `@agenthix/core` only once the commit's checks, install test,
   screenshots and release build passed for it (see
   [deployment](../architecture/deployment.md#releases-and-the-images-they-publish)).
3. **The GitHub release page** is made by *Publish release* once everything is published: a pre-release for an alpha
   or a release candidate, with notes from the commits since the last release. Edit its notes there if they need it.
4. **Publish, as a dry run.** In **Actions**, open **Publish guide screenshots**, select **Run workflow**, enter
   the tag and leave **dry run** ticked. It takes the set from the latest capture run for the tag's commit in the
   release build, refuses if there is none or it did not pass, and lists what it would upload, and where.
5. **Publish for real:** run it again with **dry run** unticked. It uploads the set to
   `https://assets.agenthix.com/guide/<tag>/`. Check one picture answers, for example
   `curl -sI https://assets.agenthix.com/guide/<tag>/home.png`.
6. **Publish straight after the release.** The next capture run compares with the nearest earlier tag's
   published set, and fails while that set is missing.
7. **If something fails after the tag is pushed**, delete the tag and whatever that attempt published (its screenshot
   folder too), fix it, prove the fixed commit again, and tag the same version again. Once a release
   is out its screenshots are never replaced: a fix is a new version (`-alpha.2`, `-rc.2`).

Nothing in this repository starts the website's rebuild; the website's own build picks the tag up.

Only maintainers can run **Publish guide screenshots**: its upload key is a secret of the repository.
