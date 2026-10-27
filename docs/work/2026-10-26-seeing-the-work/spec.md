---
name: Seeing the agents' work — spec
description: People see what agents produced without leaving Agenthix — files open in place from Files, tasks, links and messages behind one renderer boundary; git's state is in plain view; and a person's own IDE can reach a live workspace — with every file byte carried by relays, fleet members that sites dial out to, so hq decides and never carries.
created: 2026-10-25
author: leang
---

# Seeing the agents' work — spec

**Status:** Approved by the owner on 26 October 2026. Settled on the design boards (kept under [`boards/`](boards/) as the build baseline) on 25 October
2026. Each part has its own file under [`spec/`](spec/). The decisions D1–D22 and defaults R1–R8 are on the boards'
*Questions and decisions*; each is cited where it applies.

## Purpose and outcome

People direct agents in Agenthix, and must be able to see what the agents made: a report, a chart, a data file, a
change to a codebase. Today most of it can't be opened, some can't even be downloaded, and git's state is invisible.
This unit makes every file an agent produces visible in place, wherever it's referred to, without loading the hq that
coordinates the agents.

Done when:

- A file opens read-only, in place, from the Files tool, a workspace, a task's attachments and working files, a link,
  or a chip in a conversation; common kinds are drawn properly and every file can be downloaded, whatever its kind or
  size.
- Images in Markdown (files, knowledge pages, task descriptions and comments, agents' replies) are drawn where they're
  written.
- A workspace shows its branch, whether it has uncommitted changes, and its last commit.
- No file byte passes through hq-server: hq authorises and signs a ticket, and a relay carries the bytes from the site.
- A renderer is added by adding an entry behind a documented contract, which an organisation's own renderers could
  later implement without a change to the frame.

## The problem

- **Most files can't be seen.** The viewer draws Markdown, plain code and small images; PDF, CSV, JSON as data and
  anything over 1 MB say "can't be previewed". Binary and over-cap files can't even be downloaded.
- **There is no boundary.** A hard-coded `switch` in `FileBody.tsx` draws each kind, so every format is a change to the
  frame.
- **Work handed back is hidden.** A task's attachments are listed but never previewed; the folder its runs work in isn't
  shown; a path in a conversation isn't a link; Markdown images point nowhere.
- **Git is invisible.** The site knows only whether a folder is a repository.
- **Every byte goes through hq**, held whole in memory and sent as JSON. An organisation works the same hours with many
  agents running, and hq already relays their messages; files would make it the bottleneck.

## The rule

**hq decides, relays carry, sites hold and run.** hq checks access and signs a short-lived ticket for one file; a
relay — a fleet member that sites dial out to — carries the bytes; the site checks the ticket and serves only what it
names. Nothing listens on a site, and no file byte passes through hq-server.

## Terms

| Term | Meaning |
|---|---|
| **Site** | An Execution Site: holds places' files and runs agents. Dials out; listens on nothing |
| **Relay** | A fleet member that carries bytes between browsers and the sites assigned to it, and decides nothing. The only kind of machine besides hq with a front door |
| **hq's relay** | The relay on hq's machine, always there, connected by configuration as hq's site is |
| **Files address** | The name a relay answers on (`files.example.com`); a different origin from the app's (`hq.example.com`) |
| **Ticket** | hq's signed permission for one stream: one file (or other purpose), one person, minutes long |
| **Kind** | What a file is drawn as: `markdown`, `text`, `code`, `json`, `csv`, `image`, `pdf`, `none` (later `diff`) |
| **Renderer** | What draws one or more kinds, in the page or in a frame on the files address, behind one contract |
| **The frame** | What Agenthix draws around a renderer: header, facts, actions and every state |
| **Opened / embedded** | A file shown on its own, or inside a Markdown page or a message |
| **Stable link** | A file's address in hq: the place, the tool and the path, never a site, relay or ticket |

## The parts

| Part | Covers | Boards |
|---|---|---|
| [1 · Relays and the file path](spec/relays.md) | The fleet with relays; the ticket; opening and downloading a file; hq's relay; more relays and placement; the Fleet Console | 1, 2, 3, 5, R1 |
| [2 · The renderer boundary and the Files UI](spec/renderers.md) | Choosing a kind; the registry and contract; the frame and its states; the renderers; embedded files | 4, F1–F4, T3 |
| [3 · Tasks, links and conversations](spec/surfaces.md) | A task's files; stable links and chips; embeds in replies; a person's images in a conversation | T1–T3 |
| [4 · Git in plain view](spec/git.md) | What the site reads; status, changed files, diffs and the log | 6, G1, G2 |
| [5 · Your own IDE](spec/ide.md) | A session through the relay: designed, with a proof of concept as stretch | 7, I1 |
| [6 · Security, limits and proof](spec/limits.md) | Who trusts whom; doors; threats and defences; caps; what it doesn't stop; the tests | 8 |

## In this unit: MVP first, then stretch

The whole design is settled here; the build is the MVP first, then each stretch item if time allows, each droppable
without loss (D2, D3).

| | |
|---|---|
| **MVP** | hq's relay and the ticket; download for every file; the renderer boundary; text, highlighted code, JSON, CSV, images, PDF; the frame's states; one Markdown embed everywhere Markdown is drawn, with cards; a task's attachments and working files; stable links and chips; git status at a glance; hq's own uploads through hq's relay |
| **Stretch** | Further relays, placement and the Fleet Console's relay screens; changed-file markers, diffs, log and branches; YAML and HTML source; a person adding an image to a conversation; the IDE proof of concept |
| **Designed, not built** | Renderers an organisation's admins add; how an IDE session is authorised beyond the proof |
| **Not in this unit** | Live previews on relays (D10); file preview in the mobile app (D11); editing files; installing renderers from a marketplace |

## Decisions on the boards

D1–D22 and R1–R8 are listed in full on *Questions and decisions*. The ones that bind work beyond this unit are
decision records, accepted when the unit opened: adr-0153, relays carry every file byte and hq only signs tickets
(D4–D7, D12, D13, D16–D18, R1, R2, R7, R8); adr-0154, a machine carries a site or a relay, never both, outside hq's
(D22); and adr-0155, a file is drawn only by a renderer behind one boundary (part 2, R3).
