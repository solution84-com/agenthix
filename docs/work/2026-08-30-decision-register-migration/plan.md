---
created: 2026-08-30
description: Migrating forty decision records onto the maintainers' current decision-record rules, and giving every decision inside a legacy record its own address.
---

# Implementation Plan · Decision Register Migration

**Design spec:** [`spec.md`](spec.md)

## Goal

Every decision in this register can be superseded on its own, and every record carries a state
the framework still defines.

**In scope:** the state vocabulary across all 40 records; section-level addressing for the
seven in-force multi-decision records; the record-level repairs in spec §5; `adr-0053`'s
removal; the framework and skill changes that make the new shape legal; and the retrofit of the
two prior units.

**Out of scope**, each for a reason in spec §10: extracting sections into their own records,
retrofitting records for decisions nobody wrote down, the architecture pages, triaging closed
records, and fixing code.

**Part of this unit lands outside this repository** — the decision-record rules and the tooling that teaches them are not
this codebase's to define. There is no cross-repository commit, so phase 1 is committed
separately, there. It is tracked here because it is the same intent, and because
an untracked dependency is the one that gets skipped.

## Approach

**The rule changes go first, and nothing here is touched until they land.** This is the
ordering the whole plan bends around. The maintainers' tooling for writing records currently teaches
`Proposed`, `Accepted, amended by <id>` and "record what acted on it" — each of which the
rules contradict and each of which this unit is removing. A session that follows that tooling
mid-unit will faithfully reintroduce what the previous task removed. The rules have to be true
before the work that honours them starts, and the installed copy is what agents
actually read, so refreshing it is part of the change rather than a follow-up.

**Mechanical repairs before judgement.** Phase 2 touches all forty files and decides almost
nothing: strip a forbidden field, add front-matter, unify two competing status formats. Phase 3
touches seven and is nearly all judgement. Keeping them apart means the large diff is boring
and reviewable by inspection, and the small diff is the one that gets read closely. Merged,
fifty-five judgement calls would arrive buried in four hundred lines of formatting.

**A record is triaged whole, and its index rows land with it.** The framework requires the
index and the record to change together, so each of phase 3's tasks is one record: read its
sections, apply both tests, mark the ones that earn a row, and write those rows. Batching the
triage and then batching the index would leave a window where the two disagree, and that
disagreement is a defect rather than an intermediate state.

**The triage is reviewed by a different reading than the one that produced it.** Spec §9 names
this as the unit's main risk. Applying two tests fifty-five times produces errors that are
quiet in both directions — a coupled section given its own row invites someone to supersede
half a decision, and an independent one left silent reproduces the defect this unit exists to
fix. The review pass re-derives the verdict from the record rather than checking the verdict
against the reasoning that produced it, because the second is not a check.

**Nothing is extracted and no content moves.** Every correction is a state, a row, or an
annotation. This is the constraint that makes the unit safe to run at all: a frozen record
keeps everything it says, so the worst case of a wrong triage call is a row that has to be
withdrawn, not a decision that has to be reconstructed.

## Decision records

| | Records |
|---|---|
| **Depends on** | **None.** The approach rests on the maintainers' decision-record rules, which are not a record in this repository. Phase 1 changes them, which is why it is a phase rather than a precondition |
| **Implements** | **None.** This is a register migration; it carries out no recorded decision |
| **Revisits** | `adr-0004`, `adr-0022`, `adr-0025`, `adr-0031`, `adr-0036`, `adr-0037`, `adr-0039` — the seven whose sections are triaged, any of which may yield a dead section. Plus `adr-0053`, removed from the sequence, and `adr-0005` and `adr-0008`, whose states are corrected |

**`adr-0017`, `adr-0020` and `adr-0026` were on this list and are struck.** Each was tested
against the system during design: execution is a site concern, task delegation is the model,
and heavy data stays on the site. All three hold. What is stale in each is a mechanism named in
passing, which is an annotation, not a revisit.

**Nothing under *Depends on* is undecided**, so nothing blocks.

## Key decisions

| Decision | Why |
|---|---|
| Framework and skill land before any record changes | The skill teaches the model being removed. Anyone following it mid-unit undoes the work, and the installed cache is what agents read |
| Mechanical repairs and section triage are separate phases | Fifty-five judgement calls buried in four hundred lines of formatting get reviewed as formatting |
| One phase-3 task per record, index rows included | The framework requires record and index to change together; batching them creates a window where they disagree |
| The triage gets a review pass that re-derives rather than checks | Checking a verdict against its own reasoning is not a check. Both error directions are silent |
| `Deprecated` is retained; `Withdrawn` and `Rejected` both removed | A record is born Accepted, so it has no in-flight state — neither to be pulled back from, nor to be declined from. Both were only reachable via `Proposed` |
| Section rows are addressed, not extracted | Extraction would write ~30 records whose options were never separately weighed — the sweep the framework warns against |
| **Decided against: fixing the records first and the framework after** | It is the tempting order, because the records are the visible problem. It means every record is repaired against rules that are not yet written, and re-repaired when they are |
| **No execution plan for any phase** | Nothing here is a line-by-line code change an executor could not derive from the task. Phase 1's edits are specified in spec §3, §4 and §8; phases 2 and 4 name their own records and files. What phase 2 needs is verification after the sweep, not instructions before it |
| **And for phase 3 an execution plan would be actively harmful** | It would mean writing down triage verdicts before reading the records. The previous unit did exactly that — its task 2.1 said *"write the superseding record for `adr-0022`"* and the evidence said amend — and recorded it as the same failure the unit existed to correct. Pre-writing fifty-five verdicts multiplies it |
| A walkthrough replaces them, written at the end of phase 3 | Acceptance here is a reading, not a run: filter the index by state and confirm the picture is true, resolve a sample of section rows, confirm no record disagrees with its rows |
| **Decided against: one phase per activity** | Framework, repair, triage and retrofit look like four activities, but only three of the seams are dependencies. The retrofit is grouped with close-out because pointing a prior unit here is only true once the work is done |
| **Decided against: renumbering or re-slugging anything** | Every citation is by id. The previous unit ruled the same way, and reversing it would break every inbound reference to buy tidiness |

## Work breakdown

Four phases. The seams are dependencies, not counts: phase 2 cannot be done under rules phase 1
has not written, phase 3 layers section states onto record states that phase 2 makes legal, and
phase 4 points two prior units at work that must already exist.

**No phase gets an execution plan**, for the reasons in Key decisions. The task list below is
the checklist, and the two verification tasks in it — 3.9's review pass and 3.10's index
reconciliation — do the job an execution plan would otherwise be relied on to do. A walkthrough
is written at the end of phase 3, when there is something to walk through.

### Phase 1 — Framework and skill
**Delivers:** the rules this unit honours are written down, and the skill installed in this
workspace teaches them.
**Starts when:** —
**Execution plan:** none. Every edit's content is specified in spec §3, §4 and §8.
**Committed in:** outside this repository, separately from everything below.

- [x] 1.1 Remove `Withdrawn` from the decision-record states and restore `Deprecated`, per spec §3
- [x] 1.2 Write the four-state ladder that separates Superseded, missing-decision and Deprecated
- [x] 1.3 Add `adr-XXXX-s-N` section addressing, including how unnumbered sections are numbered
- [x] 1.4 Add the admission gates — significance and contestedness — that the architecture unit's task 3.5 never landed
- [x] 1.5 Reconcile the tooling that teaches the decision-record rules to 1.1–1.4, removing `Proposed`, `Accepted, amended by <id>` and the implementation-status guidance
- [x] 1.6 Refresh the installed copy in this workspace and confirm it matches the source
- [x] 1.7 Raise `Withdrawn` as a proposal, recorded outside this repository

### Phase 2 — Record-level repairs
**Delivers:** all 40 records carry a state the rules define, in one consistent header
format.
**Starts when:** phase 1 has landed and the installed skill teaches the new model.
**Execution plan:** none. The tasks name their own records; the sweep across all 40 needs
verifying afterwards, not scripting beforehand.

- [x] 2.1 Add `created:` and `description:` front-matter to all 40 records, removing the duplicate `**Date:**` line
- [x] 2.2 Unify the status format across the folder — one form, not a `**Status:**` line in some and a `## Status` section in others
- [x] 2.3 Strip implementation status from `adr-0040`, `adr-0041` and `adr-0044`–`adr-0051`
- [x] 2.4 Remove the `Accepted, amended by <id>` state from `adr-0004`, `adr-0025`, `adr-0036`, `adr-0039` and `adr-0044`
- [x] 2.5 Remove `adr-0005`'s "marked historical" qualifier — it describes the current stack and stays Accepted
- [x] 2.6 Confirm `adr-0008` carries `Deprecated` with a reason that says what aged it out
- [x] 2.7 Annotate `adr-0017` and `adr-0020` where each names a mechanism that no longer exists
- [x] 2.8 Rewrite the index legend to the four states, and reconcile every index row to its record
- [x] 2.9 Re-type the storage-boundary proposal's issue from `Feature` to `Proposal`, delete `adr-0053`, and retire number 0053 in the index
- [x] 2.10 Remove `adr-0006` and `adr-0052` on the same test, retire both numbers, and drop `Rejected` from the state model

### Phase 3 — Section triage and index rows
**Delivers:** every decision inside the seven in-force multi-decision records that stands on
its own has its own index row and can be superseded independently.
**Starts when:** phase 2 reports — record states are legal, so section states layer onto
something true.
**Execution plan:** none, and deliberately so — writing one would mean fixing fifty-five triage
verdicts before reading the records they judge.

- [x] 3.1 `adr-0004` — triage its six sections, mark the membership model `Superseded by adr-0039`, land its rows
- [x] 3.2 `adr-0022` — triage its seven claims, mark §1 per spec §4, land its rows
- [x] 3.3 `adr-0025` — triage its nine sections and land its rows
- [x] 3.4 `adr-0031` — triage its four sections and land its rows
- [x] 3.5 `adr-0036` — triage its five sections, mark §4 `Superseded by adr-0049`, land its rows
- [x] 3.6 `adr-0037` — triage its eight sections and land its rows
- [x] 3.7 `adr-0039` — triage its eleven sections and land its rows
- [x] 3.8 `adr-0041` — give its `## Revision — 2026-08-11` section an assigned number and a row
- [x] 3.9 Review the whole triage by re-deriving each verdict from the record, not from the reasoning that produced it
- [x] 3.10 Check the index end to end — every row resolves, no record disagrees with its rows, no number claimed twice

### Phase 4 — Reading protocol, retrofit and close
**Delivers:** the register explains how to read itself, and neither prior unit points at
abolished rules.
**Starts when:** phase 3 reports — the retrofit can only say the work is done once it is.
**Execution plan:** none. Each task names the one file it changes.

- [x] 4.1 Write the reading protocol into the index — filter by state; read closed records to understand code of that vintage
- [x] 4.2 Verify whether any record was trimmed on 2026-08-21 — **none was**; nothing to annotate
- [x] 4.3 Add the dated pointer note to `2026-08-19-adr-state-integrity`, repointing `bl-0032` and `bl-0033` to their issues and naming this unit
- [x] 4.4 Remove `**Status:** Proposed` from both prior units' specs — the framework forbids a status on a spec
- [x] 4.5 Amend `2026-08-21-architecture-documentation`'s spec and plan to hand over tasks 3.1, 3.2, 3.4, 3.6 and 3.5's remaining half, and record it as a deviation there
- [x] 4.6 Settle spec §9's `source:` question — raised as its own issue and cited
- [x] 4.7 Answer spec §9's index-readability question — 66 rows, grouped by construction; the fallback was not needed
- [x] 4.8 Write the walkthrough — how to exercise the migrated register and decide to accept it
- [x] 4.9 Close the unit

## Close-out

**Decision records.** *Depends on* and *Implements* were both `None`, so neither needed closing.
Every record under *Revisits* is decided: `adr-0004`, `adr-0025`, `adr-0031` and `adr-0036` were
disproved in part and carry section-level states; `adr-0022`, `adr-0037` and `adr-0039` survived
and are left alone; `adr-0053` was removed; `adr-0005` and `adr-0008` had their states corrected.

**This unit created no records**, which was the point — every correction is a state, a row or an
annotation. Nothing it decided binds only this codebase: the state model, the `<id>-s-N` address
and the admission gates all bind every register the maintainers keep, so they are rules held outside this repository rather
than an ADR here.

**Made stale and fixed:** `adr-0036`'s references used the abolished *amended by*; the
architecture unit's spec and plan called the storage-boundary design a `Proposed` record.

**Filed, not fixed:** outside this repository — `Epic` should pin the two date fields and the `Effort`
options need descriptions. Neither is reachable through the API: pinning has no mutation, and the
option input carries no id, so writing descriptions may recreate the options and orphan existing
values.

**Not closed by this unit:** `2026-08-21-architecture-documentation` keeps its phase 2 and the two
checks that depend on it.

## Deviations

**Phase 4 — two.**

**Task 3.6 of the architecture unit was void, not merely stale.** It said to annotate *"the five
records trimmed on 2026-08-21"*. Nothing was trimmed: that unit's own spec §5 records trimming as
decided against, and the only files that lost lines that day did so as the old half of the
`docs/adrs/` → `docs/adr/` rename, plus `adr-0027`'s deletion. Carried over as a verification and
closed as nothing-to-do — which is why it was carried over as one rather than as an instruction.

**This unit began outside the queue.** Task 4.6 raised an issue so the spec's `source:` resolves, but
backfilling a citation does not undo the fact that work started before anything queued it. The
maintainers' rule that all work enters through a queue has no exception, and this was a breach of
it rather than a case it fails to cover.

**Phase 3 — two.**

**`adr-0022` produced no rows, and task 3.2 had assumed seven.** Read against the tests, its seven
numbered claims are one decision elaborated — remove MCP as an inbound third-party interface and
make `ClaudeSDKRuntime` canonical. Claim 4 cannot change while claim 1 stands, because Connectors
were the identity model *for* those connections; claim 6 was "based entirely on MCP reachability".
This is the case the framework names explicitly: *a record may elaborate one decision across
several, and a coherent model is not sprawl.* The existing annotation already says which points
reversed and why the decision holds.

**Five index anchors were wrong, and the mechanical check is what found them.** `adr-0037`'s
headings use spaced em-dashes, which do not collapse to the double hyphen assumed when the rows
were hand-written. Task 3.10 caught all five before anyone read the index — which is the argument
for having written it as a check rather than a proofread.

**Phase 2 — one.** Eight records — `adr-0004`, `0005`, `0006`, `0008`, `0009`, `0010`, `0011`
and `0021` — carry no date and never did. Git in this repository knows only the 2026-08-09
import; the archived pre-split monorepo pushes it back to `2026-04-27`, and that commit is
titled *"Initial monorepo commit"*, so the trail ends there rather than at an authoring date.
They carry `created: 2026-04-27` as the earliest date each is provably present. Everything
else was recovered: six from the archived monorepo's real history, two from this repository's,
the rest from the records' own `**Date:**` lines.

**Phase 1 — one.** The installed copy of the tooling would not refresh. Its update compares
versions rather than content, and the version had not moved since it was created,
so **ten** files had drifted between the source and the installed copy — the
reconciled one would have been the eleventh, written and read by
nobody. Task 1.6 therefore also bumped the version, which is what actually ships a
change. The lesson is recorded in that commit: a version bump belongs in the same commit as any
change to it.

| Phase | What changed | Why |
|---|---|---|
| 1 | Task 1.6 also bumped the tooling's version | The installed copy is keyed on version, so an in-place edit never reaches a workspace without a bump |
| 2 | Task 2.1 could not supply a true `created:` for eight records | Their authoring dates survive in no history anywhere. `2026-04-27` is used, which is the archived monorepo's own initial commit — an upper bound, not an authoring date |
| 4 | The architecture unit's task 3.6 was void | It named five trimmed records; none was trimmed, and that unit's own spec says trimming was decided against |
| 4 | `source:` issue raised part-way through | The unit began outside the queue; the issue makes the citation resolve but records a breach rather than an exception |
| 3 | `adr-0022` earned no section rows | Its seven claims elaborate one decision rather than holding seven; none can change while the others stand |
| 3 | Section-state flags were normalised to one form | The 2026-08-19 audit used `> ⚠️ **…**` and this unit had used `> **…**`; two forms in one folder is a scanning cost for nothing |
| 2 | Task 2.9 grew from one record to three, and the state model lost `Rejected` | `adr-0006` and `adr-0052` were the same shape as `adr-0053` — never accepted, so never binding. Removing all three left `Rejected` with no instances and, under *born Accepted*, no way to acquire one |
