---
created: 2026-08-21
description: Writing the current-state architecture documentation, and repairing the record layer so it can be read backwards from it.
---

# Implementation Plan · Architecture Documentation

**Design spec:** [`design-spec.md`](design-spec.md)

## Goal

A new engineer understands this system from `docs/architecture/`, and reaches the reasoning
behind any part of it in one hop.

**In scope:** the architecture documentation for every area of the platform as built; the
disposition of the twelve files that exist today; the citation bridge from each area to the
decisions that shaped it; the record states that are currently untrue; the reading protocol;
and the admission gates that keep specifications out of the decision folder.

**Out of scope**, each for a reason given in the spec's §5: rewriting any accepted record,
consolidating the pre-split sequence, `docs/concepts/`, fixing code, anything the
storage-boundary proposal covers, and the developer playbook.

**One part of this unit lands outside this repository** — the admission gates and the
design-versus-decision separator are the maintainers' decision-record rules, not this codebase's. There is no
cross-repository commit, so task 3.5 is committed separately, there. It is
tracked here because it is the same intent, and because leaving it untracked is how it gets
skipped.

## Approach

**Write the pages from the code, not from the records.** The temptation is to lift the
descriptive content out of `adr-0025`, `adr-0036`, `adr-0039` and the rest, since it is
already written. That is rejected twice over: it would mean revising accepted records to
remove what was lifted, which §4 of the spec forbids, and it would carry forward whatever
has drifted since each was written. The records are read for orientation — they say what the
questions were — and every claim on a page is checked against the thing it names.

**Survey before writing, because the survey decides the shape.** Seven of the twelve existing
files predate the topology cut, and an eighth was edited after it and still names Firestore —
so the modification date does not sort them. Whether each is updated, rewritten or deleted cannot be
guessed from its modification date: a file may be stale in its details and sound in its
structure, or the reverse. The area map falls out of that reading — which areas already have
a home, which content survives into them, and which areas nothing covers.

**Areas are drawn around what a reader needs, not around modules.** `hq/` and `site/` are
two apps, but a reader asking "how does a run reach a container" is asking about one thing
that crosses both. The four undocumented areas — the control channel, storage and placement,
the container runtime, identity and trust — are each one question a reader arrives with.

**The bridge is written as each page is written, not swept up afterwards.** A page ends with
the decisions that shaped it, cited by id. Doing it per page costs almost nothing because
the decisions are in hand at the moment of writing; doing it as a later pass means
re-reading everything.

**Record repairs are navigation-only and go last.** They are small, they are independent of
the writing, and putting them last means the architecture pages exist before anyone is asked
to trust a status. A record is repaired by correcting its state, marking an amendment, or
annotating what is no longer true — never by editing what it decided.

## Decision records

| | Records |
|---|---|
| **Depends on** | **None.** This unit documents the system as built; it needs no record to be accepted first |
| **Implements** | **None.** Documentation work carries out no recorded decision |
| **Revisits** | `adr-0017`, `adr-0020`, `adr-0026`, `adr-0031` — Accepted, and each describes Firestore or the archived sense of "Site". Plus whatever phase 1 adds: writing an area's page against the code is the strongest test yet applied to the records covering it |

**The Revisits list will grow, and that is the point.** Writing a page against the code is a
more thorough check than the previous audit's record-by-record reading, because it starts
from the system rather than from the claim. Any record it disproves is added here as it is
found.

**Nothing under *Depends on* is undecided**, so nothing blocks. The storage-boundary design is
deliberately absent — it was `adr-0053` when this was written and is now an open proposal, so
nothing may be built against it, and this unit does not.

## Key decisions

| Decision | Why |
|---|---|
| Current-state documentation is the primary surface; records are read backwards from it | A new engineer should not have to read a decision log to learn how to work. Records answer *why*, which is asked rarely and specifically |
| Write pages from the code, not by lifting from records | Lifting requires revising accepted records, and carries forward whatever has drifted |
| Survey the existing twelve files before writing anything | Six predate the topology cut. Which content survives decides the area map, and cannot be guessed |
| Areas are drawn around a reader's question, not around modules | "How does a run reach a container" crosses both apps; a page per module would split every real question in half |
| Each page cites the decisions that shaped it | The path from *this is odd* to *here is why* is the whole value of keeping the records, and it barely exists today — 5 of 12 files |
| Record repairs are navigation-only | Content is frozen; states, markers and citations are how a reader navigates, and a wrong state breaks the reading protocol outright |
| **Decided against: trimming the specification-heavy records** | It was the previous plan. Under a log-book reading, historical detail is what the backwards reader wants, and removing it is revising a frozen record for no gain |
| **Decided against: consolidating the pre-split sequence into a summary** | Fourteen are cited by post-split records, and the closed ones each hold an option weighed and declined. The summary that was wanted is the architecture documentation |
| **Decided against: a page per module** | It mirrors the repository rather than the reader, and the topology questions — the ones people actually arrive with — live between the modules |
| **Decided against: deferring the record repairs to their own unit** | They are a handful of small edits that make the reading protocol work, and separating them means the pages ship pointing into a folder that still misleads |

## Work breakdown

Three phases. The seams are dependencies, not counts: the survey decides what phase 2
writes, and phase 3's citations point at pages that must exist first.

### Phase 1 — Survey and area map
**Delivers:** a disposition for each of the twelve existing files, the area map, and the
decisions mapped to each area.
**Starts when:** —
**Execution plan:** none. The work is discovery; there is no list of changes to write in
advance.

- [x] 1.1 Read each of the seven 2026-08-09 files against the code — update, rewrite or delete, with a reason for each
- [x] 1.2 Read the remaining five against the code and record the same disposition
- [x] 1.3 Draw the area map — which areas exist, which are missing, what each answers
- [x] 1.4 Map every in-force decision record to the area it belongs to, and note the ones that map nowhere
- [x] 1.5 Record any record the reading disproves, and add it to Revisits

### Phase 2 — Write the current-state documentation
**Delivers:** a reader can learn the system from `docs/architecture/` without opening a record.
**Starts when:** phase 1 reports — the area map and dispositions exist.
**Execution plan:** yes. Every page is enumerable by this point.

**Phase 2 was abandoned on 2026-08-30.** None of these ran.

- [ ] ~~2.1 `docs/architecture/README.md` — the system in one page~~
- [ ] ~~2.2 Apply phase 1's dispositions to the existing files~~
- [ ] ~~2.3 Write the control-channel area~~
- [ ] ~~2.4 Write the storage and placement area~~
- [ ] ~~2.5 Write the container runtime area~~
- [ ] ~~2.6 Write the identity and trust area~~
- [ ] ~~2.7 Give every page its decisions, cited by id~~
- [ ] ~~2.8 Check the whole set for a claim no code backs~~

### Phase 3 — Make the record layer readable
**Delivers:** the reading protocol works — filtering on state gives a true picture, and every page's citations resolve.
**Starts when:** phase 2's pages exist, so the citations have somewhere to point.
**Execution plan:** yes.

- [x] ~~3.1 Dispose of `adr-0017` and `adr-0026`~~ — **moved.** Both hold; annotated instead
- [x] ~~3.2 Annotate the remaining Firestore and stale-roadmap-phase references~~ — **moved**
- [ ] ~~3.3 Dispose of whatever phase 2 adds to Revisits~~ — **abandoned**; phase 2 never ran, so it added nothing
- [x] ~~3.4 Write the reading protocol into the decision index~~ — **moved**
- [x] ~~3.5 Add the admission gates and the design-versus-decision separator to the framework~~ — **moved.** The separator had landed; the gates had not
- [x] ~~3.6 Annotate the five records trimmed on 2026-08-21~~ — **moved, and void.** No record was trimmed
- [ ] ~~3.7 Verify every citation on every architecture page resolves~~ — **abandoned**; there are no new pages to verify
- [x] 3.8 Close the unit

**The struck tasks moved to `2026-08-30-decision-register-migration`** — see Deviations.

## Phase 1 findings

Twelve files read against the code. **Three are kept or updated in place, four are
rewritten, four are deleted, and one leaves `docs/` entirely.** Only one — `mcp/tools.md`,
rewritten on 08-21 — describes the system as it is.

### Dispositions

| File | Disposition | Why |
|---|---|---|
| `mcp/tools.md` | **keep** | Rewritten and verified 2026-08-21; now also carries the rationale from the record removed that day |
| `sites/site_stack.md` | **delete** | Describes the earlier site app, which is today's `hq`. Duplicates the stack table in `AGENTS.md`, and has drifted from it: pg-boss and Socket.IO sit under "Future Additions (Planned)" and both shipped long ago |
| `sites/site_architecture.md` | **rewrite** | *"Last Updated: March 19, 2026."* A single app with the engine layer inside the API server's process — precisely the arrangement the topology cut undid. Nothing in it survives |
| `sites/site_private_security_guide.md` | **delete** | Not architecture. An implementation guide in the imperative — *"we will focus on"*, *"Ensure the"*, *"Proposed `LoginPage.tsx` logic"* — carrying proposed code. Its access table is the pre-split HQ↔Site key model that `adr-0044` replaced |
| `sites/site_operations.md` | **out of `docs/`** | Header reads *"Version 0.2 (design — pre-build)"* and it ends with *"Open questions — for the build spec"*. A design for work that has not started; `bl-0033` already tracks it |
| `sites/site_execution_architecture.md` | **rewrite** | Already carries a stale banner added 2026-08-17 saying a rewrite is separate work. This unit is that work |
| `sites/site_live_preview.md` | **update** | Subject is real and the model largely holds, but it cites **`ADR-0034`, which was never claimed** — the index lists 0033–0034 as never used. Preview also moved to `site/` in the split |
| `site-auth.md` | **rewrite** | Its header says `Status: Current` and the banner immediately beneath says the data model, roles and M2M endpoints are historical. A document that contradicts itself in its first fourteen lines |
| `tools/tools.md` | **delete** | Opens *"the single source of truth for the Agenthix agent tool namespace"* — which is what `mcp/tools.md` says of the registry. It names `request_product_git` and `request_project_git`; neither exists, the registry has `request_workspace_git` |
| `tools/claude-tools.md` | **rewrite, most of it leaves** | Its SDK built-in inventory duplicates the maintainers' own research notes on the SDK — knowledge of a system we did not build, which belongs in those notes, not here. What stays is the half that is ours: what the platform exposes and blocks |
| `tools/tool-manifest.md` | **update** | The approval model holds. Every source path is a bare pre-split `src/...`; all seven now live under `hq/src/` or `site/src/`, and the split put them in *different modules* |
| `tools/tool-control.md` | **update** | Same, and worse: of twelve paths it names, four exist nowhere — `PermissionsTab.tsx`, `permissionPresets.ts`, `protocol/capability.ts`, `server/mcp/mcpHandler.ts` |

**Recency of edit did not sort them.** `site_execution_architecture.md` was touched on 08-21
and still diagrams a Firestore listener; `mcp/tools.md` was touched the same day and is
sound. Every file had to be read.

**The pattern behind the four deletions is one failure, not four.** Each is a *second copy*
of something that has a home elsewhere — the stack in `AGENTS.md`, the tool namespace in
`mcp/tools.md`, the SDK inventory in the maintainers' research notes, the auth mechanism in
`adr-0044`. None was wrong when written. Each drifted because nothing obliged the two copies
to move together, which is the same failure that put architecture into the decision records.

### A code defect the survey turned up

`hq/src/shared/mcpTools.ts`'s header comment directs the reader to *"the canonical tool
reference in `docs/domains/tools/tools.md`"*. `docs/domains/` was retired months ago, and
the file it names is one of the four being deleted. The registry is the source of truth and
should say so without pointing anywhere. Fixed as part of task 2.2 — it is a documentation
pointer inside a source file, not behaviour.

### The area map

Areas are drawn around the question a reader arrives with, which is why none of them is a
module: *how does a run reach a container* crosses both apps.

| Area | Answers | Seeded by |
|---|---|---|
| `README.md` | What is this system, what are its parts, how does a run travel end to end | new |
| `topology/` | How hq and an Execution Site find each other, stay connected, and pass work | new; `adr-0044`–`adr-0046`, `adr-0050`, `adr-0051` |
| `storage/` | Who owns what on disk, and which machine holds it | new; `adr-0038`, `adr-0039`, `adr-0047` |
| `runtime/` | What runs an agent, what it can reach, how long it lives, and how you watch it | rewrite of `site_architecture` + `site_execution_architecture`, update of `site_live_preview`; `adr-0009`, `adr-0019`, `adr-0030`, `adr-0032`, `adr-0036`, `adr-0048`, `adr-0049` |
| `identity/` | What credentials exist, what each authorises, and how long each lives | rewrite of `site-auth`; `adr-0040`, `adr-0025`, `adr-0041` |
| `mcp/` | How an agent reaches platform data, and which tools it may call | kept; `adr-0020`, `adr-0022` |
| `tools/` | How tool execution is gated and approved | update of `tool-control` + `tool-manifest` + the surviving half of `claude-tools`; `adr-0036` |

**Records that map to no area** are the ones about how the platform is *organised* rather
than how it is *built* — `adr-0005` (historical), `adr-0035` (test-data isolation, which is
the QA contract's subject), `adr-0001` (prompt-building ownership, a concepts question).
They need no architecture page, and their absence from this table is deliberate rather than
an omission.

### Nothing added to Revisits yet

This phase read documents against code, not records against code. The stale claims found
belong to the documents, not to the records they cite — with one exception worth carrying:
`site_live_preview.md` cites `adr-0034`, which never existed, so that citation cannot be
repaired, only removed. Writing the pages in phase 2 is the reading that tests the records,
and anything it disproves is added to Revisits then.

## Close-out

**Closed 2026-08-30 as a salvage.** The unit could not complete: writing the pages was deferred
until before launch, because the architecture is still moving and pages written now would be
rewritten before anyone read them. Until then the codebase is the current-state answer.

**What it delivered.** Phase 1 in full — twelve files read against the code, a disposition for
each, the area map, and the decisions mapped onto it. That survives on its own and is what the
two follow-on issues are built from.

**What it abandoned.** Phase 2 entirely, and 3.3 and 3.7 with it, since both depend on pages that
do not exist. Phase 3's record work had already moved to `2026-08-30-decision-register-migration`.

**Decision records.** *Depends on* and *Implements* were `None`. Every record under *Revisits*
holds: `adr-0017` (execution is a site concern — it is), `adr-0020` (delegate tasks, defer
sub-agents — it does), `adr-0026` (heavy data stays on the site — it does; only the endpoint
placement moved, annotated 2026-08-19), `adr-0031` (project workspaces and roadmap memory — it
does). None was disproved, so none is closed. Phase 2 would have been the reading that tested
them harder, and it did not run.

**No walkthrough.** There is nothing to exercise — the deliverable is a survey, and it is read
rather than run.

**Filed:** an issue for the writing, sequenced before launch, and one for the stale files the
survey identified and this unit never applied. **The second is the cost of deferring** — twelve files stay, one is accurate, and the decision
index points at the folder as the current-state answer.

## Deviations

**Phase 1 — one.** Task 1.1 was written against *six* files dated 2026-08-09; there are
seven, and an eighth edited after the topology cut still describes Firestore. The counts in
this plan and the spec were corrected before the phase began, and the lesson is recorded in
the findings: the modification date does not sort these files.

**Phase 3 — the record work left this unit.** Tasks 3.1, 3.2, 3.4, 3.6 and the unfinished half of
3.5 were carried out by `2026-08-30-decision-register-migration` and are struck above. They were
written on 2026-08-21, three days before the maintainers' decision-record rules were restructured,
and running them as written would have produced deprecations and amendment markers those rules
had by then abolished. What remains here is the architecture pages and the two checks that depend
on them.

**One of the moved tasks was void.** Task 3.6 said to annotate *"the five records trimmed on
2026-08-21"*. No record was trimmed: this unit's own spec §5 records that trimming was decided
against, and the only files that lost lines that day did so as the old side of the
`docs/adrs/` → `docs/adr/` rename. The task was carried over as a verification and closed as
nothing-to-do.

| Phase | What changed | Why |
|---|---|---|
| 2 | Abandoned; the unit closed on phase 1 | The architecture is still moving, so pages written now would be rewritten before being read. Deferred to before launch as its own issue |
| 3 | 3.3 and 3.7 abandoned with it | Both verify pages that were never written |
| 3 | Record work moved to the register-migration unit | Written against decision-record rules that were superseded three days later |
