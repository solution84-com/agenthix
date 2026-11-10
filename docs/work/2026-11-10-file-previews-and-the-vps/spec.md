---
name: File previews people can check their work with — spec
description: What the file previews are today, what makes them hard to use, and the design that fixes it; then what deploying to a VPS proves.
created: 2026-11-10
author: leang
---

# File previews people can check their work with — spec

**Status:** Approved by the owner on 10 November 2026, in parts, as recorded below. Built in two builds; the owner's walk follows.

## Purpose and outcome

A person checks an agent's work by opening what it made: a report, a table, a chart, a change to code. If the preview
is hard to read, slow, cramped or unclear about what it shows, the person can't tell whether the work is right. This
unit makes each preview something a person can check their work with, and then proves the build on a VPS.

Done when:

- Every kind of file opens in every place it can be opened, and the owner accepts each at a walkthrough.
- No finding from the review is left open: each is fixed in the unit, or recorded as an issue with a reason.
- hq and its site run on a VPS from the published images, reached over HTTPS with a files address, and a PDF, an image
  and a table open there through the relay.

## Today

*(Filled from the walk in phase 1. What is built, from the code:)*

**The renderers** (`ui/src/files/renderers/`, registered in `ui/src/files/registry.ts`, kind chosen by
`core/src/files/kind.ts`):

| # | Renderer | Kinds | Runs | Today's finding |
|---|---|---|---|---|
| 1 | Markdown | markdown | page | — |
| 2 | Text | text | page | — |
| 3 | Code | code | page | — |
| 4 | JSON | json | page | — |
| 5 | Table | csv | page | — |
| 6 | Image | image | page, embeds | — |
| 7 | PDF | pdf | frame, on the files address | — |
| 8 | No preview | none | the frame's card | — |

**The places a file opens** (the frame, `ui/src/files/FileFrame.tsx`, is shared by all of them):

| # | Place | Where in hq | Today's finding |
|---|---|---|---|
| A | Files tool | `hq/src/storage/pages/FilesTool.tsx`, `OpenedFile.tsx` | — |
| B | A workspace and the workspace view | `hq/src/storage/pages/WorkspaceView.tsx` | — |
| C | A task's attachments and working files | `hq/src/projects/components/TaskOpenedFile.tsx` | — |
| D | A link to a file | — | — |
| E | A chip in a conversation, and the *Shown* viewer | `hq/src/conversations/components/ShownViewer.tsx` | — |
| F | An image embedded in Markdown | `hq/src/shared/components/MarkdownMessage.tsx` | — |

**Open issues already about the previews:** #76 (the first open in Files remounts the frame), #77 (the file frame has
no close action), #80 (hard-linked files can't be opened), #84 (outside images in Markdown load at once), #132 (the
conversation's file viewer has rough edges), #156 (the workspace view on a branch shows main's images and no binary
files). Each is triaged in phase 1.

## Design

Review 1's findings are on the unit's dashboard (6 Critical, 23 Should fix, 10 Minor). **The owner accepted the six
Critical findings on 10 November 2026**, and approved one file viewer in place of C5's narrower fix, on the board
[`boards/where-files-open.html`](boards/where-files-open.html).

### One file viewer, one rule

Today a file opens in six different places with six sizes and ways back: in the Files tool beside the tree, in the
workspace view, beside a task, by leaving a task for the Files tool, inside the chat panel, or nowhere. From now on:

1. **A file clicked where it's mentioned** — a chat chip, a task's attachment, working file or description, a README,
   a message, a run's output — **opens in the file viewer over the main area**: the whole page between the menu and the
   chat. The page underneath stays as it was.
2. **The chat stays beside the file.** A chat that was expanded or over the page returns to its docked width while a
   file is open.
3. **Full screen** is a control in the viewer's header and covers everything, with a visible ✕; Escape also closes it.
4. **One header everywhere:** ‹ back, named for where the person came from ("‹ QR-1", "‹ Conversation"); the file's name
   and folder; Download; Full screen; ⋯ with Copy link, Show in Files and Mention. On a phone the name has a line of
   its own and the controls are 44 px.
5. **The Files tool is the file's home for browsing.** Opening a file there folds the tree away (D1), so it looks and
   behaves as the viewer does, with "‹ <folder>" back.
6. **The address holds the open file**: the browser's Back closes the viewer, and a copied link reopens it.
7. **On a phone** the viewer is the whole screen.
8. **What keeps its own place:** a workspace's git changes keep their diff view; items an agent shows beside a voice
   conversation stay in the chat panel.

This closes C5 and C1, and with them S15, S16, S17, S19, S20, S21, S22, S23 and M6.

### The decisions (owner, 10 November 2026)

Drawn on [`boards/decisions.html`](boards/decisions.html).

| # | Decision |
|---|---|
| D1 | Opening a file in the Files tool (or a workspace) folds the tree away; "‹ <folder>" goes back, and a toggle in the header shows the folder beside the file |
| D2 | JSON up to 5 MB keeps the full tree. Past 5 MB it shows its first 1 MB — the limit every text file has — as the tree, whole records only, each folded to one line, with "Showing the first N records (1 MB of X MB). Download to see all of it." |
| D3 | A table shown only in part can't be sorted: "Showing the first 10,000 of 60,000 rows. Download to see and sort all of it." A whole table still sorts |
| D4 | A hard-linked file is listed. Opening it says "This file can't be opened. It's linked to another file elsewhere on the machine, so Agenthix can't be sure it's safe to show you. Ask the agent to save it again as an ordinary copy." with **Ask the agent**, which puts that request in the chat's message box for the person to send. No download |
| D5, D6 | Settled by the file viewer above |

### Scope of build 1

Every Critical (C1–C6), every Should fix (S1–S23) and every Minor (M1–M10) on the dashboard, with D1–D4 as decided.
The Minor findings are each small, and several are closed by the viewer.

### Review 2 and build 2 (owner, 10 November 2026)

Review 2 found 37 of review 1's 43 findings fixed and three new Critical ones; the owner approved build 2 on
the review's dashboard:

- **R1** Wrapped code is one flow of text per line, with a hanging indent and its number in its own column.
- **R2** At a medium width (768–1,279 px), while a file is open, the chat sits **beside** the file instead of over the
  page, so the person can read and talk to the agent at once. Its minimise control (or ⌘J) folds it so the file takes
  the full width; its button puts it back beside the file, never over it; the choice holds from file to file. At
  1,280 px and wider nothing changes; below 768 px the viewer is the whole screen, as before.
- **R3** A workspace with Git reads its files through the relay, as every other file is read: the same previews, the
  same frame and states, and Download.
- Five smaller ones: a Markdown code block's Copy at control height; invalid JSON marks its problem line even at the
  end of the file; an image at 100 % is drawn at its real size; full screen's ⋯ has Show in Files; a gone chip names
  the place it looked in.

### The Critical fixes

| # | Fix |
|---|---|
| C1 | Full screen draws its own header with ✕ and "‹ Back to the viewer" |
| C2 | Table columns keep their content's width and scroll sideways with an edge fade; long text columns wrap at about 40 characters |
| C3 | Long text is split into lines before it is drawn, in every text view |
| C4 | An empty file says "This file is empty." in the preview's place, with no tabs |
| C5 | The file viewer above |
| C6 | A hard-linked file has a state of its own that says why it isn't opened; "isn't here any more" only for a file that is gone |

## Deploying to the VPS

*(What the deploy proves, and the machine it runs on.)* One machine, as a self-hoster installs it
([`docs/guide/getting-started/install.md`](../../guide/getting-started/install.md),
[`domain-and-https.md`](../../guide/running-agenthix/domain-and-https.md)): the host service, hq and its site from the
published images, HTTPS through the front door, a files address so the PDF viewer works.

## Not in this unit

- The live preview: it stays behind its flag.
- New kinds of file (YAML and HTML source, a diff), unless the review finds a common kind people can't check without.
- Editing a file.

## Open questions

1. *(Raised after the walk.)*
