---
created: 2026-10-25
description: How seeing the agents' work is built — the ticket and hq's relay first, then the file path, the renderer boundary and the screens that use it, proved and documented as an MVP; then further relays, more of git, a person's images and the IDE proof of concept as stretch phases, each droppable.
---

# Implementation Plan · Seeing the agents' work

## Goal

Every file an agent produces can be seen in place — from Files, a workspace, a task, a link or a message — behind one
renderer boundary, with git's state in plain view, and with every file byte carried by a relay so hq decides and never
carries.

**In scope:** the six parts of the [spec](spec.md), built MVP first:
- **Relays and the file path** (part 1): the ticket, the relay protocol, hq's relay, opening and downloading, hq's own
  uploads through hq's relay; further relays, placement and the Fleet Console's relay screens as stretch.
- **The renderer boundary and the Files UI** (part 2): the kind, the registry and contract, the frame and its states,
  the MVP renderers, PDF in a viewer page, the Markdown embed; YAML and HTML source as stretch.
- **Tasks, links and conversations** (part 3): a task's files, stable links, chips, images in agents' replies; a
  person's images in a conversation as stretch.
- **Git** (part 4): status at a glance; changed files, diffs and the log as stretch.
- **Your own IDE** (part 5): the proof of concept, as stretch.
- **Security and proof** (part 6), the decision records, the documents, the user guide and the QA contract.

**Out of scope:**
- **Live previews on relays** (D10). The relay is built for streams, so they can move later; moving them now would
  double the unit's risk for traffic that works today.
- **File preview in the mobile app** (D11). The ticket and the relay work for any client; the app adds preview in its
  own codebase.
- **Renderers an organisation's admins add.** Designed (part 2) so they need no change to the frame; building them is
  a plugin platform, not this epic.
- **Editing files, and writing git.** The epic is seeing the work. Editing belongs to a person's own IDE (part 5), and
  git that writes goes through workflows.
- **A feature flag.** Files either go through a relay or they don't; two byte paths are what D17 rules out. The MVP
  lands whole.

## Approach

**The ticket and the relay first, because everything stands on them.** Phase 1 commits the contracts in `core` — the
ticket's fields and its signing and verification, the relay's stream protocol over the content channel's multiplexer
(`core/src/protocol/contentMux.ts`), the kind and the renderer contract's types — then builds the relay as a service of
its own and hq's relay in hq's compose set, reached through `hq-web`. It ends when a download travels browser → relay
→ site on a ticket, with nothing through hq-server. Everything after builds on that one path, and nothing builds a
second.

**Then the file path, whole.** Phase 2 makes it the only path: hq's *open* operation, the site's ticket-checked ranged
read with path confinement, the relay's headers and limits, the audit row, hq's uploads moved from hq-server to hq's
relay, and the bare-address path. The old JSON content path is removed in the same phase as its replacement lands, so
the build never has two.

**Then what people see, in two layers.** Phase 3 is the renderer boundary and the Files tool: the registry, the frame
and its states, the MVP renderers, the PDF viewer page, and the Markdown embed in `MarkdownMessage`. Phase 4 puts the
same frame where the work is handed back — tasks, links, chips, replies — and adds git's status line, which needs only
a typed read on the site. Phases 3 and 4 touch different screens and can overlap once phase 3's registry and frame are
merged.

**The MVP is proved before any stretch begins.** Phase 5 completes the security suite for everything the MVP built
(V1–V11), adds implementation notes to the decision records, writes the architecture and concept documents, the user guide's pages and the QA
contract. When phase 5 closes, the MVP can ship on its own.

**Stretch phases are independent.** Phases 6–9 each depend only on the MVP, not on one another, so they're taken in the
owner's order as time allows and any can be dropped without touching the rest. Each carries its own tests and
documents.

**One module per authority.** Every ticket is made in one module in hq and verified in one module in `core`;
every byte read on a site goes through one ticket-checked reader; every renderer is reached through the registry. A lane
that needs a ticket, a read or a renderer calls the module.

### How the work is carried out

- **Lanes**, under the lead: one purpose, one branch and worktree, a brief naming the tasks by number,
  the spec section that is its acceptance, and the files it owns, with one set of shared rules every lane follows.
- **In parallel where they don't meet:** in phase 1, `core` contracts land first, then the relay service and hq's side
  run side by side. In phase 3, renderers run as parallel lanes once the registry and frame are merged. Phase 4's three
  surfaces (tasks, links and chips, git status) are parallel lanes.
- **Merging:** lanes merge one at a time into the unit's branch, `feature/seeing-the-work`; nothing reaches `main` until
  the unit closes.
- **Suites:** lanes run the typecheck and unit tests for what they touched. The lead runs the integration, cross-app,
  container, install and e2e suites after the lanes that change what they test, and the full regression at the close:
  this unit adds an image, changes `hq-web`'s routing, a `core` protocol and both schemas.
- **The owner walks the work through** at the end of phase 4 (the MVP in use, before proof and documents) and at the
  end of each stretch phase taken. Walkthrough fixes are lanes, added to the breakdown with the next numbers.
- **The lead decides inside the plan.** Reasonable assumptions are made and recorded, above all where the answer is
  obvious; a security threat is closed and reported; anything that cannot be closed, a real blocker, or a change of
  direction goes under Deviations and to the owner. The owner's input is needed at the walkthroughs, for every push
  and the merge to `main`, and for anything destructive to data.
- **The branch lands** as one squashed change with a merge commit on `main` when the unit closes.

## Decision records

| | Records |
|---|---|
| **Depends on** | adr-0026, adr-0039, adr-0041, adr-0044, adr-0063, adr-0067, adr-0070, adr-0077, adr-0108, adr-0114, adr-0115, adr-0117 — all Accepted |
| **Implements** | adr-0153 (relays carry every file byte, and hq only signs tickets), adr-0154 (a machine carries a site or a relay, never both, outside hq's) and adr-0155 (a file is drawn only by a renderer behind one boundary), accepted when the unit opened. adr-0039, whose open question on the viewer's scope (§ open questions) this answers |
| **Revisits** | adr-0063 — bulk traffic to a site no longer only through hq (its separable relay is now a fleet member); adr-0114 — the files address served by hq's relay, not hq-server; adr-0108 — a machine may carry a relay; adr-0026 — the last file route moves off hq |

## Key decisions

| Decision | Why |
|---|---|
| Relays carry every file byte; hq signs tickets (D4, D5) | An organisation works the same hours with many agents; hq already relays their messages |
| Not through hq-server, not even as a fallback (D17) | A second byte path to build and secure, for an outage that is hq's machine's own |
| Not a tunnel service per site (D6) | Another vendor and cost, and a second concept, for no gain over a relay |
| Not a copy in object storage (D7) | A second copy of the organisation's files, a wait on first open, and copies going stale |
| A machine is a site or a relay, never both, outside hq's (D22) | A relay needs a door; a site must never have one. Speed comes from distance, which a nearby relay solves |
| The relay carries streams, each with a purpose (R8) | IDE sessions, diffs and previews arrive without a new door or a rebuild |
| Reuse the content channel's multiplexer for the relay line | Already the site-as-server stream protocol hq and sites share; one protocol, not two |
| Ticket in the link (D13) | Works for in-page fetches, frames and downloads alike, as the files address's signed links do |
| Not a cookie, not a header (D13) | A cookie is third-party inside hq's page; a frame or a download can't send a header |
| PDF in a viewer page of our own, with pdf.js | Browsers refuse their own viewer in a sandboxed frame; pdf.js reads by range |
| Text capped at 1 MB on purpose (D14) | A larger text file is a smell; a real need is a change request |
| A sized `<img>` tag is the one HTML Markdown accepts, sanitised to `src`, `alt`, `width`, `height` (D23) | Agents and people size images the way GitHub's Markdown does, with no opening for raw HTML |
| One Markdown embed in `MarkdownMessage` (D19) | Files, knowledge, tasks and replies all render through it, so it's added once |
| Not Monaco | Highlighting and a diff renderer cover reading; editing isn't in this epic |
| Old JSON content path removed with its replacement | Never two paths in the build, so nothing quietly keeps using the old one |

## Work breakdown

Nine phases. Phases 1–5 are the MVP, split on the seams the design has: a path that must exist before anything uses it
(1), that path made the only one (2), what people see in Files (3) and elsewhere (4), and proof (5). Phases 6–9 are
stretch, each depending only on phase 5.

### Phase 1 — The ticket and hq's relay
**Delivers:** a download travels browser → hq's relay → site on a ticket hq signed, on a developer's install with
nothing configured, and hq-server carries none of it.
**Starts when:** —
**Execution plan:** none — lanes. The contracts are committed first, so the parallel lanes build against types they can
see.

- [x] 1.1 `core`: the ticket — fields, signing and verification, purposes
- [x] 1.2 `core`: the relay stream protocol on the content channel's multiplexer — a stream per ticket, the site as server
- [x] 1.3 `core`: the kind, `FileFacts`, `FileBytes` and the renderer contract's types
- [x] 1.4 hq: the signing key, made at first start and kept with hq's secrets
- [x] 1.5 The relay service: accepts sites' lines and browsers' requests, passes one to the other, no database
- [x] 1.6 The relay's image, published and signed with the others
- [x] 1.7 hq's relay in hq's compose set, connected by a shared secret
- [x] 1.8 `hq-web`: the files name to hq's relay; `files.localhost` on localhost
- [x] 1.9 The site: dials its relay with hq's pass and keeps the line
- [x] 1.10 hq: the Relay record, hq's relay registered, every site placed on it

### Phase 2 — One path for every byte
**Delivers:** every file — workspace, artefact, knowledge, task attachment, picture — is opened and downloaded through a
relay on a ticket, with its headers, caps and audit, and the old JSON path and hq-server's upload serving are gone.
**Starts when:** phase 1 is merged.
**Execution plan:** none — lanes.

- [x] 2.1 The site: "about this file" on the control channel — size, modified time, version, type guess, text or binary
- [x] 2.2 The site: the ticket-checked reader — verify, confine the real path, check the version, serve ranges
- [x] 2.3 hq: the *open* operation — access, home site, kind, ticket, audit row, the relay's link
- [x] 2.4 The relay: sandbox headers, CORS for the app only, `Content-Disposition` for downloads, no ticket in logs
- [x] 2.5 The relay: 16 streams per person; the site: 32 reads at once, queued
- [x] 2.6 hq's relay serves hq's uploads from the upload folder, mounted read-only
- [x] 2.7 Remove hq-server's upload serving and the files-host routes to it
- [x] 2.8 The bare-address path: `/relay/…` on the app's address to hq's relay, downloads and text only
- [x] 2.9 A relay not answering: the *open* operation says so at once
- [x] 2.10 Remove `classifyFileContent`, the JSON content queries and `readFileOnSite`'s whole-file collection
- [x] 2.11 Security tests for what this phase built: V1, V2, V5, V6

### Phase 3 — The renderer boundary and the Files tool
**Delivers:** the Files tool and workspaces draw every MVP kind behind the registry, with the frame's actions and eight
states, and Markdown everywhere embeds images and cards.
**Starts when:** phase 2's *open* operation and reader are merged.
**Execution plan:** none — lanes. Renderers run in parallel once 3.1 and 3.2 are merged.

- [x] 3.1 The registry and the contract, in `ui`
- [x] 3.2 The frame: header, breadcrumb, facts line, Mention, Download, ⋯ (Copy link, Copy path, Open full screen), the eight states
- [x] 3.3 The Markdown renderer, moved behind the boundary, with Read / Source
- [x] 3.4 The text renderer
- [x] 3.5 The code renderer, highlighted to 512 KB
- [x] 3.6 The JSON renderer: tree and text
- [x] 3.7 The table renderer for CSV
- [x] 3.8 The image renderer, opened and embedded
- [x] 3.9 The PDF viewer page on the files address (pdf.js), and its framed renderer
- [x] 3.10 The Markdown embed in `MarkdownMessage`: relative images and the sized `<img>` tag, file cards, outside images behind Load
- [x] 3.11 Embeds asked for in one request, loaded as they scroll into view
- [x] 3.12 Files and Workspaces use the frame; `FileBody` removed
- [x] 3.13 Tests: V7, V8, V11

### Phase 4 — Where the work is handed back
**Delivers:** a task's attachments and working files open beside it; every file has a stable link; paths in
conversations are chips that open beside the thread; agents' images show in their replies; a workspace shows its git
status; the Fleet Console shows hq's relay.
**Starts when:** phase 3's frame is merged.
**Execution plan:** none — lanes, three in parallel.

- [x] 4.1 A task's attachments open beside it in the frame
- [x] 4.2 A task's working files listed, opening the same way (Open in Files set aside: see Deviations)
- [x] 4.3 The task link form (`?task=…&file=…`) and its route
- [x] 4.4 Copy link everywhere a file is opened; "not found" and "gone" for a link
- [x] 4.5 Chips: `useArtefactLinks` extended to files and workspace paths; Mention inserts a chip
- [x] 4.6 A chip opens beside the thread, where shown parts open
- [x] 4.7 Paths in agents' replies resolve against the conversation's place; "Changed since this message"
- [x] 4.8 The site: the git status read, with hooks, `fsmonitor` and external diff off
- [x] 4.9 The git status line above a workspace's files and in Files, beside the backup line
- [x] 4.10 The Fleet Console: hq's relay card on HQ's page; a relay not answering on *Needs you*
- [x] 4.11 Tests: V9, V10
- [x] 4.12 Agents name a task and its files: task, working-file and attachment chips; a task's attachments and their references in the agent's task tools
- [x] 4.13 `@` in the message box: a picker of the places' files, found by name on the site

### Phase 5 — Proof and documents
**Delivers:** the MVP proved end to end and documented: it can ship on its own.
**Starts when:** phases 2–4 are merged and walked through.
**Execution plan:** none — lanes.

- [x] 5.1 The security suite completed for T1–T13: V1–V6 and V11 end to end, against a real site and relay
- [x] 5.2 Decision records: adr-0153 and adr-0154 (written when the unit opened)
- [x] 5.3 Decision record: adr-0155 (written when the unit opened)
- [x] 5.4 Implementation notes on adr-0153–adr-0155, and notes on adr-0039, adr-0063, adr-0108 and adr-0114 for what this changed
- [x] 5.5 Architecture documents: the fleet with relays, the file path, deployment and ports
- [x] 5.6 Concept documents: file sharing, the fleet
- [x] 5.7 The user guide: opening and downloading files, embeds, links and chips, git status, a files address
- [x] 5.8 The QA contract: scenarios for every board's behaviour

### Phase 6 — More relays (stretch)
**Delivers:** an organisation adds relays on machines of their own; hq places and moves sites across them; admins pin.
**Starts when:** phase 5 is closed.
**Execution plan:** none — lanes.

- [ ] 6.1 *Add a machine*: a site or a relay; only a relay is asked for an address
- [ ] 6.2 A further relay enrolled by join code, with its own credential and front door
- [ ] 6.3 Placement: even load, moves without dropping open files, a quiet relay's sites moved
- [ ] 6.4 Pin to a relay, on a site's page
- [ ] 6.5 A relay-only machine in the menu, tagged *relay*
- [ ] 6.6 Tests: V4 across machines; placement and moves

### Phase 7 — More of git, and more kinds (stretch)
**Delivers:** changed-file markers, diffs, the log and branches; YAML and HTML source.
**Starts when:** phase 5 is closed.
**Execution plan:** none — lanes.

- [ ] 7.1 The site: changed files with marks, capped
- [ ] 7.2 Markers in the tree and the Changed tab
- [ ] 7.3 The site: a diff served through the relay on a `diff` ticket
- [ ] 7.4 The diff renderer, and Changes / File on a changed file
- [ ] 7.5 The site: the log and branches, ahead and behind as last fetched
- [ ] 7.6 The log view and the branch menu
- [ ] 7.7 YAML and HTML source in the code renderer
- [ ] 7.8 Tests and guide pages for this phase

### Phase 8 — A person's images in a conversation (stretch)
**Delivers:** a person pastes, drops or chooses an image in a conversation; it's kept with the place, outside what runs
mount, visible only in the room, and saved to Files on purpose.
**Starts when:** phase 5 is closed.
**Execution plan:** none — lanes.

- [ ] 8.1 The site: the uploads area per place and conversation, never mounted into runs
- [ ] 8.2 Uploading through hq's authorisation to the site, through the relay
- [ ] 8.3 The composer: paste, drop, choose; the image in the sent message
- [ ] 8.4 Who sees it: the conversation's people only
- [ ] 8.5 Agents' tools to read a conversation's upload, scoped to it
- [ ] 8.6 Save to Files, and attach to a task
- [ ] 8.7 Tests: no run mounts uploads; no one outside the conversation gets a ticket

### Phase 9 — Your own IDE, proof of concept (stretch)
**Delivers:** a desktop IDE reaches one isolated workspace through the relay for a session, and the questions in part 5
have measured answers.
**Starts when:** phase 5 is closed.
**Execution plan:** none — lanes. It is a proof: its findings may change part 5, and anything built is kept only if it
holds up.

- [ ] 9.1 The session record and `ide-session` ticket in hq
- [ ] 9.2 The site: the access container, one workspace mounted, stopped on revoke
- [ ] 9.3 The relay: an `ide-session` line of its own
- [ ] 9.4 The helper on the person's computer, as an SSH `ProxyCommand`
- [ ] 9.5 VS Code Remote SSH measured: what it installs, size, memory, network
- [ ] 9.6 Concurrent edits with an agent running, observed and written up
- [ ] 9.7 Part 5 corrected from the findings

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | 2.2 (the site's ticket-checked reader) and the relay's and site's halves of 2.4–2.5 (headers, CORS, disposition, no ticket in logs, stream and read limits) were built in phase 1 | Phase 1 ends with a real download through a relay, and the reader is what a relay's stream reaches; the headers live in the same relay code |
| 1 | Flow control per stream was added to the content multiplexer: an opener grants a window and credit, a server waits for it | Without it a download larger than the relay's buffer failed when the browser read slower than the site sent, against "no cap, streamed"; pausing the line would let one person stall every stream of a site. Folded into site protocol 1.8 and relay protocol 1.0, both unreleased |
| 1 | hq's relay dials hq-server directly on hq's internal network for its link; `/relay-link` has no route through `hq-web`. In dev, `HQ_RELAY_LINE_URL` gives the site an absolute address for hq's relay's line | The link needs no public door while hq's relay is the only relay; dev has no `hq-web` to route the line path |
| 1 | The end-to-end download test through a real hq, site and relay moved to phase 2, with the *open* operation (2.3) | A real ticket comes only from the *open* operation; phase 1 is proved by each part's tests, the relay's in-process download test, the image start test and hq-web's routing test |
| 2 | 2.10 (removing the JSON content path) moves to phase 3, with 3.12 | The Files tool reads through that path until phase 3's frame replaces it |
| 4 | **Open in Files ›** on a task's working files is not built in phase 4 | The Files tool shows only a place's `files/` folder and has no way to address a task's folder; building it is a change to the Files tool's navigation. At the walkthrough the owner left it for now: it will come out of a usability run |
| 4 | Chips for tasks and their files (`tasks/<key>`, `tasks/<key>/<path>`, `attachments/<key>/<file>`), and a task's attachments listed in the agent's task tools (4.12) | Found at the walkthrough: an agent could neither see a task's attachments nor link a task or its files, and made up an address. The owner asked for it in this unit |
| 4 | Mention's chip inside the message box, folder chips, a place's folders as siblings for embeds, and `@` with a picker of files (4.13), with a site read finding files by name | Found at the walkthrough (W3, W4, W6, W8); the owner asked for each in this unit |
| 4 | The `@` picker searches the conversation's own place's `files/` only, not its other places or its workspaces | A reference in a message (`files/…`) always resolves in the conversation's own place, so a file from another place would open as the wrong file; workspaces need a search each. Widening it waits for references that can name another place |
| 5 | adr-0153 says which files relays carry: every file a person opens or downloads; a file hq keeps as one of its own records (a knowledge page's text, instruction files) is read and written by hq (point 7) | The close found the Knowledge reader and editor get a page's text through hq, against the rule read literally. The owner agreed to make the rule say what it means rather than move the reader |
| 5 | The decision records (5.2, 5.3) were written when the unit opened, not in phase 5, and the relay record split in two: adr-0153 (relays carry every byte) and adr-0154 (a site or a relay, never both). adr-0155 is the renderer boundary | The owner approved the plan and asked for the records on the branch at the start, so the lanes build against accepted decisions. One decision per record: either rule can change while the other stands |
| 3 | None: the renderer boundary, the renderers and the Files tool on the frame were built as planned, with 2.10 taken from phase 2 (see above) | — |
| 6–9 | Not taken: the unit closed at its MVP. Each phase is now its own issue, tracked outside this repository and outside the epic — phase 6 (more relays), phase 7 (more of git, more kinds), phase 8 (a person's images in a conversation), phase 9 (your own IDE) | The owner closed the epic at its MVP on 2026-10-27 |

## Closing note — 2026-10-27

**Accepted** by the owner at the walkthrough of 2026-10-27 (steps A–G), with every finding fixed in the unit: W1 attachments over 100 kB refused, W2 agents unable to name a task or its attachments, W3 folder references and the reference form agents weren't told, W4 Mention's chip inside the message box, W6 knowledge and task text embedding the place's files and the editor's Preview, W8 `@` with a picker of files, W9 hq's relay named as its site is. W5 (no Delete or Rename in Files) and step F's dependence on a host service went to the backlog (both tracked outside this repository). Phases 1–5 are built; phases 6–9 were not taken (Deviations).

**Proved** by the full regression on the unit's branch: every module's typecheck, unit and integration suites, the site's container tests, the cross-app suite (53) and the security suite (20) pass; hq's browser tests pass (98 in the chromium and not-secure projects) apart from `notSecure.spec.ts`'s first test, which fails only against a development database whose organisation already has its own model endpoint; the release rehearsal passes in full (every image built and started, the install test, the guide's screenshots). Two tests of host's `hqMove.test.ts` fail in about two of three full runs on `main` as well (agenthix#23). The close found and fixed one critical defect: the site's image had no git, so the git status line and repository work failed on an installed site; the start test now checks it.

**Open items:** 53 closed in the unit, each checked against the code; 28 deferred as their own issues — agenthix#70–#90 and seven more tracked outside this repository — plus the issues for phases 6 and 8. None is critical and none blocks a release. agenthix#22 is fixed by this unit's cross-app test change and closes with the merge.

**QA:** the unit wrote its contract — stories US-390 to US-397 and scenarios SC-1447 to SC-1595, with the tests that cover them tagged. No QA audit ran at the close: the entries are the builder's description of its own work and await the audit before release (an issue tracked outside this repository asks for an accuracy pass).

**Decision records:** adr-0153, adr-0154 and adr-0155 carry implementation notes; adr-0153 now says which files relays carry (point 7: every file a person opens or downloads; a file hq keeps as its own record is hq's). adr-0026, adr-0039, adr-0063, adr-0108 and adr-0114 carry notes on what this unit changed. None is superseded.

This plan is frozen.
