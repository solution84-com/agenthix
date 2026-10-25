---
created: 2026-10-25
description: How Agent Knowledge is built — the file tools lifted into core and the contracts first, then the knowledge store on the site and the platform guide in hq side by side, then the agent tools, a conversation's places, the screens, the proof, and the close — in eight phases carried out by lanes.
---

# Implementation Plan · Agent Knowledge

## Goal

Every agent finds what it needs from four levels of knowledge — the platform guide, the organisation's, a project's and
a person's — through tools shaped like the native ones, people browse, edit and restore it in hq, and a conversation
reaches only the places its person added.

**In scope:** the six parts of the [spec](spec.md):
- **The platform guide** (part 1): the glossary page, the generated tools reference, the build stage in hq's image, CI's
  inputs, hq serving the guide as the `platform:` level.
- **Knowledge** (part 2): the new storage root on the site, the organisation's placement, pages, sections and
  properties, the rules, the gate, versions and pruning, the itemiser.
- **The tools** (part 3): `@agenthix/core/file-tools` lifted from the OpenCode plugin's own file tools and extended, the
  five knowledge tools for the lead and workers, search across levels, the prompt's Knowledge section, `recall` without
  knowledge, the protocol change.
- **Places** (part 4): a conversation's places, `start_work` limited to them, `suggest_place`, the access re-check.
- **Screens** (part 5): U2–U5 and C1–C3.
- **Proof** (part 6), the four decision records, the documents, the user guide and the QA contract.

**Out of scope:**
- **Ranking by meaning, caching search, measuring knowledge use.** Deferred until usage shows the need (spec, *Not in
  this unit*); ripgrep is the search until then.
- **Attachments in pages.** A page links to Files; pictures inside pages can come later as a section's `assets/`.
- **A "copy to project" action.** Asking an agent covers it.
- **Review of skills agents write.** Skills are instructions, not knowledge, and are their own work.
- **A runtime of our own.** The file tools are built so it can use them; building one is separate.
- **Carrying old knowledge forward.** Before the first release candidate, old `knowledge/` folders are ignored and
  nothing is converted.
- **A feature flag.** Removing the knowledge mount and limiting `start_work` to a conversation's places can't sit behind
  a flag without two ways in, so the unit lands whole (ADR-0116 allows a feature that ships ready).

## Approach

**Lift before building.** The safety-critical part of file access already exists: the OpenCode plugin's own file tools
(ADR-0085), with the open-then-check that a swapped link can't redirect. Phase 1 moves their harness-neutral parts into
`@agenthix/core/file-tools` unchanged and points the plugin at them, proved by the plugin's existing comparison with
OpenCode, before anything new is built on top. Only then is the module extended: ripgrep search with the guards S1–S8,
Claude Code's shapes, exact matching. One implementation of the risky part serves both the plugin and knowledge.

**Contracts first, then two sides at once.** Phase 1 also commits the shared contracts in `core`: the page rules (T1–T5)
as one module, the knowledge channel methods and their types (a new minor version of `locationFiles.ts`), the five
tools' schemas and descriptions, and the new tables in hq's schema (the change record, the organisation's placement, a
conversation's places). The site's store (phase 2) and hq's platform guide (phase 3) then build against them in
parallel: they share only the rules module and the result shape of a search.

**One module per authority.** Every change to a page goes through the gate on the site (`knowledge/gate.ts`); every
search and read across levels through one fan-out in hq (`knowledge/levels.ts`); every place a conversation may reach
through `conversations/places.ts`. Each enforces its part's rules and is tested there, so a lane that needs a page, a
search or a place calls the module.

**Removal with the replacement.** The knowledge mount, `KNOWLEDGE_GUIDANCE`, the `INDEX.md` parser
(`hq/src/storage/knowledgeIndex.ts`), knowledge search inside the lead's `recall` and its not-forwardable note, and
`start_work`'s admission of any reachable place are each removed in the lane that puts the new path in their place, in
the same change, so there are never two ways in.

### How the work is carried out

The lead runs the unit end to end and stops only for the owner's walkthrough and the hard stops in the lane rules.

- **Lanes, in the background:** every phase runs as lanes (`running-lanes`), each with its own branch and worktree, a
  brief of a few lines (the tasks by number, the spec part that is its acceptance, the files it owns), and the shared
  lane rules every lane follows, kept with the unit's working files. Each lane writes its report there and posts one
  line.
- **Models per lane:** Opus for the security-bearing lanes — lifting the file tools, the ripgrep guards, the gate, the
  fan-out and the place rule, a conversation's places. Sonnet for bounded lanes — the guide's build, the itemiser and
  versions, the screens, the documents.
- **Order:** phase 1 lands first. Phases 2 and 3 run in parallel. Phase 4 needs both; phase 5 needs phase 4's tools;
  phase 6's screens need phases 2, 4 and 5; phase 7 completes the proof and documents.
- **Tests:** lanes run the typecheck and unit tests for what they touched, through the machine-wide lock. They never
  run integration, cross-app, container or e2e suites; the lead runs those after the lanes that change what they test.
  The plugin's comparison with OpenCode (`toolComparison.container.test.ts`) is run by the lead after each lane that
  touches the file tools.
- **Merging:** lanes merge into the unit's branch one at a time, in each phase's order, rebased and squashed to one
  commit (or a few ordered ones), with the tests for what changed run again. The lead generates every migration at
  merge; lanes never write one.
- **Resources:** at most three building lanes at once, every heavy command through the lock, the lead watching free
  memory, swap, load and disk with alerts and recovery notices. At a limit the newest lane pauses first; screens and
  documents yield to security lanes.
- **The owner's walkthrough** comes after phase 6, on a real hq and site with the sample organisation: the guide
  answering, a project's and the organisation's knowledge, editing and history, correcting by asking, adding a place to a
  conversation. Its findings become numbered tasks in the phase they belong to.
- **The regression:** this unit changes core's protocol shapes, hq's schema and Dockerfiles (ripgrep in two images), so
  it is the full regression, with the image start test and the install test, once, in phase 8.
- **Landing:** one unit branch, merged to `main` with `--no-ff` after phase 8, with the owner's approval at the moment of merging.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0042 (hq is the organisation's own), ADR-0060 and ADR-0101 (a run's authority is its boundary's, bounded by its person), ADR-0074 (a container is keyed on its boundary), ADR-0079 (access to a boundary is access to all of it), ADR-0082 (a conversation acts with its current turn's authority), ADR-0085 (Agenthix owns a harness's file tools), ADR-0121 (the lead is direct inference in hq), ADR-0122 (memory in three scopes) — all Accepted |
| **Implements** | Written Accepted on the unit's branch in phase 1 (1.11), corrected there if the build changes them: ADR-0149 (platform knowledge is the user guide), ADR-0150 (agents reach knowledge only through tools shaped like the native ones), ADR-0151 (every change to knowledge goes through one gate), ADR-0152 (a conversation reaches only its own place and the places its person added) |
| **Revisits** | ADR-0123 (knowledge reaches the lead only as an excerpt, not forwardable, written by editing files) — superseded by ADR-0150, which restates its rule that hq never indexes a place's knowledge; ADR-0096 (a conversation belongs to one place) — annotated: it still belongs to one, and ADR-0152 bounds what else it reaches; ADR-0085 — annotated: its tools now live in `core` |

## Key decisions

| Decision | Why |
|---|---|
| The file tools are lifted from the OpenCode plugin into `core`, then extended | The open-then-check is the hardest part and already proved; one implementation serves both the plugin and knowledge |
| Building the knowledge tools' file layer fresh — rejected | Two implementations of the same safety code, which would drift apart |
| The plugin keeps OpenCode's shape and its copied matching; knowledge tools use Claude Code's names and exact matching | ADR-0085 requires the plugin to behave exactly as OpenCode does; knowledge pages are prose, where a tolerant match risks changing the wrong passage |
| Search is ripgrep, the program Claude Code's Grep runs | Same behaviour agents are trained on; its engine never backtracks, so no separate regex library |
| RE2 — rejected | A regex library only, with our own search written around it, and a native build |
| Knowledge leaves the mounted place folder for its own root on the site | Docker can't leave one folder out of a bind; out of the mount, the gate is the only way to change it |
| Versions are whole earlier pages; git — rejected | Pruning and removing something for good would mean rewriting history |
| One search over every level, each hit marked; separate guide tools — rejected | The agent never chooses a tool or a level |
| A conversation's places are added by the person; a check on briefs — rejected | The person sets the blast radius by a deliberate act; fingerprinting every read was too complicated for a check that misses paraphrase |
| The organisation's knowledge is placed on the default site at first use | The same mechanism as a person's storage (`ensureUserStoragePlacement`), nothing new to place |
| Phases 2 and 3 in parallel after shared contracts | They meet only at the rules module and the search result shape |

## Work breakdown

Eight phases. The seams: the shared file tools and contracts must exist before either side builds on them (1); the
store and the guide are independent layers, each testable alone (2, 3); the agent tools need both (4); places limit the
tools (5); the screens need the store, the tools and places (6); the proof and documents complete it (7); the close lands it (8).

### Phase 1 — File tools and contracts
**Delivers:** `@agenthix/core/file-tools` with the plugin running on it unchanged and the new search and shapes; the
shared rules, protocol types, tool schemas and hq tables committed; the unit's decision records Accepted.
**Starts when:** —
**Execution plan:** none — lanes. The lift is a move proved by an existing comparison test; the rest is new code a
capable agent derives from the spec.

- [x] 1.1 `@agenthix/core/file-tools` subpath export, node-only, beside `./host-crypto`
- [x] 1.2 Lift the plugin's harness-neutral file code (safe open, text reading, line-numbered read, write) into it, unchanged
- [x] 1.3 Point the OpenCode plugin at the lifted module; its comparison with OpenCode passes unchanged
- [x] 1.4 `grep` over a root by ripgrep, with Grep's parameters and output, and the guards S1–S8
- [x] 1.5 `read`, `applyEdit` (exact matching) and `write` in Claude Code's shapes, over a root
- [x] 1.6 The page rules T1–T5 as one module in `core`, with its problem messages
- [x] 1.7 Knowledge channel methods and types in `locationFiles.ts`, a new minor version
- [x] 1.8 The five knowledge tools' schemas and descriptions, and `suggest_place`'s, in hq's tool registry
- [x] 1.9 hq tables: knowledge changes, the organisation's knowledge placement, a conversation's places
- [x] 1.10 `ripgrep` in the site's server image and hq's image
- [x] 1.11 The four decision records, Accepted, on the unit's branch; ADR-0123, ADR-0096 and ADR-0085 annotated

### Phase 2 — The knowledge store on the site
**Delivers:** each place's and the organisation's knowledge in its own root, changed only through the gate, versioned
and pruned, listed by the itemiser and searchable.
**Starts when:** phase 1 has merged (the file tools, the rules, the channel types).
**Execution plan:** none — lanes.

- [x] 2.1 The knowledge root `{site}/knowledge/<owner>/<id>/{pages,versions}`; `getKnowledgeDir` returns it
- [x] 2.2 Remove the knowledge mount from runs, and stop listing `knowledge/` in the prompt's Filesystem section
- [x] 2.3 The gate: apply, check, version check, swap, and the change sent to hq to record
- [x] 2.4 `writeKnowledge`, `editKnowledge`, `deleteKnowledge`, `restoreKnowledge`, `knowledgeVersions` on the channel
- [x] 2.5 Versions, Recently deleted, permanent deletion
- [x] 2.6 The daily pruning job: 30 days, the last 20, 200 MB a place
- [x] 2.7 The itemiser: `listKnowledge` with sections, pages, properties and problems, broken links included
- [x] 2.8 `searchKnowledge` on the file tools' grep, replacing `knowledgeSearch.ts`
- [x] 2.9 The organisation's knowledge placed on the default site at first use, recorded in hq

### Phase 3 — The platform guide
**Delivers:** the guide, its glossary and the generated tools reference built into hq's image, and served by hq as the
`platform:` level.
**Starts when:** phase 1 has merged (the file tools, the search result shape).
**Execution plan:** none — lanes.

- [x] 3.1 `docs/guide/glossary.md`, with the words the product uses today, and the glossary rule in `docs/guide/README.md`
- [x] 3.2 The tools reference generator from hq's tool registry
- [x] 3.3 The build stage writing `hq/assets/platform-guide/`, in hq's image and hq's dev start, failing on a bad page
- [x] 3.4 `docs/guide/` as an input of hq's image parts in `scripts/images/parts.json`
- [x] 3.5 A guide change selects hq's checks in the change map behind `scripts/affected.mjs`
- [x] 3.6 hq searches and reads the built guide through the file tools, read-only, every result with its opening line

### Phase 4 — The agent tools
**Delivers:** the five knowledge tools for the lead and workers across every level, the changes recorded with who, and
the prompt and `recall` changed.
**Starts when:** phases 2 and 3 have merged.
**Execution plan:** none — lanes.

- [x] 4.1 The fan-out in hq: one search across the levels a run or conversation holds, merged, marked and ordered within one time limit
- [x] 4.2 `read_knowledge`, `write_knowledge`, `edit_knowledge` and `delete_knowledge` routed to the level a name names
- [x] 4.3 The tools as hq operations for workers through the site's MCP server
- [x] 4.4 The tools as the lead's conversation tools, change tools only when the turn answers a person
- [x] 4.5 `org:` changes only for an organisation admin or an agent acting for one; `platform:` read-only
- [x] 4.6 Every change recorded in hq: what, and who — a person, or an agent with its person and conversation or run
- [x] 4.7 The prompt's Knowledge section on the site and in the lead's instructions, replacing `KNOWLEDGE_GUIDANCE`
- [x] 4.8 `recall` stops searching knowledge; its not-forwardable note goes
- [x] 4.9 Remove the `INDEX.md` parser and the old knowledge queries the Knowledge tool used

### Phase 5 — A conversation's places
**Delivers:** a conversation reaches only its own place and the places its person added, shown and changed in its
header.
**Starts when:** phase 4 has merged (the tools read the conversation's places).
**Execution plan:** none — lanes.

- [x] 5.1 `conversations/places.ts`: a conversation's places, adding, removing, who and when
- [x] 5.2 `start_work` admits only a place in the conversation
- [x] 5.3 The knowledge tools take the conversation's places as their levels
- [x] 5.4 The access re-check on every turn; a place the person has lost drops out
- [x] 5.5 `suggest_place` and its card, answered only by the person
- [x] 5.6 The conversation header's Places, Add place… and its notice, on desktop and phone

### Phase 6 — The screens
**Delivers:** the Knowledge tool as pages in sections at every level, organisation knowledge in the organisation's area, and the
conversation's knowledge work steps.
**Starts when:** phases 2, 4 and 5 have merged.
**Execution plan:** none — lanes.

- [x] 6.1 Browsing knowledge: the sections tree, the pages list, property filters, Needs fixing, All pages
- [x] 6.2 A page: reading, On this page, links, Linked from, who changed it
- [x] 6.3 The editor: fields, properties, Markdown with Write and Preview, problems on fields, the conflict
- [x] 6.4 New page, New section, Move, Delete
- [x] 6.5 History and Recently deleted: versions, the change, Restore, Delete permanently
- [x] 6.6 Organisation knowledge in the organisation's area, and the project search's This project · Organisation · Both
- [x] 6.7 The conversation's work steps: Updated page with See change and Undo, Searched knowledge naming its places, the `platform:` page used

### Phase 7 — Proof and documents
**Delivers:** the tests V1–V7 in place, the decision records, the documents and the user guide current.
**Starts when:** phase 6 has merged and the owner's walkthrough's findings are fixed.
**Execution plan:** none — lanes.

- [x] 7.1 The model checks V1 with a real model, for the lead and a worker
- [x] 7.2 The security suite for the file tools' guards and the place rule (V3, V5)
- [x] 7.3 The cross-app and container tests for search across levels and no mounted knowledge (V7)
- [x] 7.4 The e2e tests for the Knowledge tool, organisation knowledge and places (V6)
- [x] 7.5 The decision records corrected for anything the build changed
- [x] 7.6 `docs/concepts/memory/memory.md` and the conversations concepts for knowledge and places
- [x] 7.7 The user guide: knowledge as pages in sections (processes, decisions and anything else a place shares), organisation knowledge, places in a conversation

### Phase 8 — Close
**Delivers:** the unit proved whole, its QA contract written, its history clean, every open item closed or raised,
and the branch ready to merge.
**Starts when:** phase 7 has merged.
**Execution plan:** none — by hand, with `closing-a-unit-of-work`; the regression's fixes as lanes.

- [x] 8.1 The full regression: every module's typecheck, unit and integration suites, the cross-app suite, hq's e2e tests (the `not-secure` project included), the image start test for every image, and the install test
- [x] 8.2 Every failure the regression finds fixed, and the regression run again until it passes
- [x] 8.3 The QA contract: the stories and scenarios for what the unit built, and the tests that cover them tagged `@SC-NNN`
- [x] 8.4 A `backup/feature/agent-knowledge` branch before the history is regrouped
- [x] 8.5 The branch's history regrouped into a few ordered commits, one per feature, with every fix folded into the commit it fixes
- [x] 8.6 Every open item the unit surfaced triaged: closed in the unit, or deferred
- [x] 8.7 Each deferred item raised as an issue, in the right repository, with its type and priority
- [x] 8.8 The plan's closing note, the decision records' notes, and the documents the unit changed brought up to date

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | ADR-0123 superseded whole by ADR-0150 (which restates the rule that still holds), not in part; ADR-0096 annotated, not amended | The records framework supersedes a record whole and has no amended state; ADR-0096's decision still holds |
| 2 | None | — |
| 3 | None | — |
| 4 | None | — |
| 5 | None | — |
| 6 | The lead is told the conversation's places on every turn (P6, the spec's part 4, and ADR-0152) | Walkthrough: without it the lead took "my space" for the conversation's project, and called a project outside the conversation empty |
| 6 | Your space is the person's default personal project; any other personal project is a place of its own | Walkthrough: the owner's call, so "my space" names one place |
| 6 | A correction to a knowledge page is made in the page only: not also remembered, and no work started for it | Walkthrough: one correction became three actions |
| 7 | V1's worker check was run by hand on real runs, not by a harness | A worker's context is assembled on the site; the lead's harness covers the lead. A worker harness is deferred as an issue |
| 7 | Real-model checks run on a low-cost, capable baseline model (DeepSeek Flash), a large model only to diagnose | The owner's rule, recorded for the repository in AGENTS.md: designing against an expensive model builds its cost into every call |
| 8 | hq's image builds Wasp with a 4 GB heap | The release rehearsal: compiling hq's Wasp SDK outgrew Node's default heap, as it had in CI's checks |

## Closing note

**Closed 2026-10-26. Accepted by the owner** after the walkthrough (sections A to D passed on retest) and phase 7's
results.

- **Regression:** the full regression passed — every module's typecheck, unit and integration suites, the site's
  container suite, the cross-app suite, the security suite (every row, the knowledge rows included), hq's browser
  tests (its `not-secure` project included) on a fresh HQ, every image built and start-tested, the install test, and
  the guide's screenshots. Known flaky tests seen and passing on a rerun: #23 (reopened); #22 passed throughout; the
  install test's first open of the Fleet Console is #69.
- **Model checks (V1):** the lead's six checks pass three runs in three on the baseline model; a worker, on the same
  model, searched the guide first, searched its place first, and a correction was made in the page by the lead alone.
- **Open items:** the close triaged every item from the lane reports, the handover and the walkthrough against the code
  at head; most were closed with evidence, and the small ones left were fixed in the unit. Deferred as issues on this
  repository: #60, #61, #62, #63, #64, #65, #66, #67, #68 and #69, and #23 reopened; none is critical and none blocks a
  release. Four more — planned work on Knowledge's navigation and editor, links across places, and a hardening of how
  hq takes a worker's run id — are tracked outside this repository.
- **The owner's decisions at the close:** a run on behalf of no one (in practice a run whose person has left) is refused
  the knowledge tools, as every operation refuses it; "wiki" stays only among the words people also say for Knowledge.
- **QA:** the unit wrote its contract (US-383 to US-389, SC-1368 to SC-1446, fourteen earlier scenarios corrected) and
  tagged its tests; SC-1427 has no test yet (#67). No QA audit ran at the close; these entries await the audit before
  release.
- **Decision records:** ADR-0149 to ADR-0152 carry implementation notes; ADR-0123 is superseded by ADR-0150; ADR-0096
  and ADR-0085 are annotated.
- **The plan is frozen** from here.

