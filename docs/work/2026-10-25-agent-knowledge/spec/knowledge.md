# Part 2 · Knowledge: what a place knows

The organisation, each project and each person have knowledge of their own: detailed pages in sections, the shape of the
platform guide, stored the same way and changed through one gate. Board: *4 · Knowledge: a place's own guide*.

## Four levels, one shape

| Level | Holds | Read by | Changed by |
|---|---|---|---|
| **Platform guide** (`platform:`) | How Agenthix works | Every agent | The maintainers, in this repository (part 1) |
| **Organisation** (`org:`) | How the whole organisation works: processes, policies, brand, clients | Every member; every agent in every place | Organisation admins, and agents acting for one |
| **Project** (its key, e.g. `website-rebuild:`) | The project's own workflows, decisions, conventions, reference | Its members; agents working in it | Anyone who may change the project's files, and agents asked to |
| **Your space** (`personal:`) | The person's own: Your space is their default personal project | The person; agents in their space | The person, and agents asked to |

Your space works exactly as a project does. Any other personal project is a project like any other: its own place, its own knowledge at its own level (its name), reached by a conversation only when it is the conversation's place or the person adds it. Only Your space is `personal:`.

## What knowledge holds

**Anything a place needs shared across its workspaces**, in as much detail as it needs. The platform fixes only what it
needs to list and search pages; how a team lays out its sections, names its pages and which properties it records are
its own, written in its `AGENTS.md` if it wants agents to follow them.

| A team chooses whether it lives here | Always elsewhere |
|---|---|
| Processes and workflows ("How we release", "Onboarding a client") | What every run must read: the place's `AGENTS.md` |
| Decision records (ADRs), if not kept in a repository | Preferences and what an agent learned along the way: memory |
| Conventions, glossaries, reference about the client or the domain | Code and what belongs with it: the repository in a workspace |
| | Files made or uploaded (PDFs, images): Files and artefacts, linked from a page |

## Pages, sections, properties

```markdown
processes/release.md
---
title: Release process
description: How we cut and publish a release, and who approves a staging deploy.
tags: [releases, deploys]
---

## Cutting a release
Releases are cut from main on Thursdays…
```

```markdown
decisions/0002-monorepo.md
---
title: One repository for web and API
description: Why web and API share a repository.
tags: [decision, architecture]
status: accepted
date: 2026-10-20
supersedes: 0001-two-repos
---
```

| | Rule |
|---|---|
| **T1** | A **page** is a Markdown file; a **section** is a folder, up to 8 deep. Names use letters, digits, hyphens, underscores and dots; no hidden names, no links |
| **T2** | Front matter: `title` (required, up to 120 characters), `description` (one sentence, up to 300), `tags` (up to 8, lower-case words or hyphens). The platform guide's own fields, plus tags |
| **T3** | Any other front matter is a **property** of the team's own: kept as written, shown, searchable. Text, numbers, dates or lists of them; up to 20 a page |
| **T4** | A page is at most 64 KB (the guide's largest is 11 KB); up to 2,000 pages a place |
| **T5** | Links between pages are relative Markdown links; an organisation page from a project page is `org:how-we-work/code-review.md`. A link to a missing page is a problem the itemiser lists; it does not refuse a save, so pages can be written in any order |

No `INDEX.md`: each page's front matter is its index entry. Before the first release candidate, old `knowledge/`
folders are ignored; nothing is converted.

## Where it is stored

```
{site}/projects/42/            ← mounted into runs, as today
├── files/
└── artefacts/
{site}/knowledge/projects/42/  ← never mounted; reached through the tools
├── pages/                     ← any sections
└── versions/                  ← earlier and deleted pages
{site}/knowledge/users/7/      ← a person's: the same
{default site}/knowledge/org/  ← the organisation's: the same
```

Knowledge moves out of the place folder that runs mount, so the only way to change it is the gate.
`getKnowledgeDir` (`site/src/server/storage/paths.ts`) returns the new root. The organisation's is placed on the
organisation's default site the first time it is used and recorded in hq, as a person's storage is today
(`ensureUserStoragePlacement`, `hq/src/storage/storageSite.ts`).

## The gate

Every change — an agent's `write_knowledge`, `edit_knowledge` or `delete_knowledge`, and a person's Save, Move or
Restore in hq — goes through the same steps, on the site that holds the page:

| | Step |
|---|---|
| **G1** | A change arrives. Each call is one finished change; there are no drafts |
| **G2** | Apply it to the current page. A write is the whole page and carries the version it started from; a page changed since is refused, with its current text. An edit replaces a passage that must appear exactly once (unless `replace_all`); otherwise it is refused, saying how many times it was found |
| **G3** | Check the result against T1–T4. Anything wrong refuses the change with the problems in words ("description is missing"; "tag 'Deploys' must be lower-case"; "over 64 KB"); nothing is stored |
| **G4** | Swap it in: the current page moves into `versions/` and the new one is renamed into place, one rename, so a reader never sees half a change |
| **G5** | hq records the change: place, page, created / edited / moved / deleted / restored, and who — a person, or an agent with the person it was answering and the conversation or run |

## When the rules are checked

| When | What happens on a problem |
|---|---|
| Every change, at the gate (G3) | Refused, nothing stored. An agent gets the problems as its tool result and calls again; a person sees them on the fields |
| While a person types, in hq's editor | Shown on the field at once; the gate has the last word |
| Every listing, by the itemiser | Still listed, with its problems, under *Needs fixing*. Only a file put on the disk outside the gate can get here |
| Reading | Never refused |

One set of rules, in `@agenthix/core`, is used by the gate, the itemiser and hq's editor.

## Versions and pruning

- **A version is the whole earlier page**, `versions/<page>/<time>.md`: a 10 KB page with 20 versions is 200 KB.
  Restore saves it back through the gate, as a new version.
- **Delete** moves the page into `versions/`, marked deleted: *Recently deleted*, for 30 days.
- **Pruning**, by a daily job on the site: a page's versions are kept 30 days and its last 20 always; a deleted page 30
  days; each place's versions capped at 200 MB, oldest first.
- **Delete permanently**, for a page or one version (a pasted password, a person's details): removed at once.

Git was weighed for history and rejected: pruning it, or removing something for good, means rewriting history.

## The itemiser

The site's `location.listKnowledge` walks `pages/` and returns sections and pages: title, description, tags,
properties, when it changed, and its problems against T1–T5. A page with problems still shows, titled from its file
name.
