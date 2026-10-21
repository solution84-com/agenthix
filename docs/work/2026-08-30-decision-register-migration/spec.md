---
created: 2026-08-30
description: Migrating the decision register onto the maintainers' current decision-record rules, so a single decision inside a record can be superseded without disturbing the rest.
---

# Decision Register Migration — Design

**Succeeds:** the unit `2026-08-19-adr-state-integrity`, which is complete, and takes over the
record-layer half of `2026-08-21-architecture-documentation`, which is not. Both are
retrofitted by this unit — see §7.

---

## 1. The problem

**A decision cannot be superseded without disturbing the record it sits in.** Seven in-force
records hold several independent decisions each. `adr-0039` has eleven numbered sections,
`adr-0025` has nine, `adr-0037` has eight. When one of those decisions is later reversed,
there is nowhere to say so: the record's own status is a single value, and setting it to
`Superseded` would discard the eight decisions that still hold. The result is a record that is
half true, marked as though it were wholly true.

This is not hypothetical. It has already happened twice and both times the correction had
nowhere to go:

- `adr-0049` states that `adr-0036` §4's per-context runtimes "was never implemented, and on
  examination the framing does not survive contact with the cases". `adr-0036` reads as wholly
  in force.
- `adr-0039` replaced `adr-0004`'s membership model with permanent ownership. `adr-0004` still
  describes members.

**The register also predates its own rules.** The maintainers' decision-record rules were
restructured on 2026-08-24. Every record here was written before that, and the folder carries
the vocabulary of the superseded model — a `Proposed` record, five different status
formulations, implementation status on ten records, and an `Accepted, amended by <id>` state
that no longer exists.

**And the instrument that would correct it teaches the old rules.** The
maintainers' tooling for writing records still describes `Proposed`, `Accepted, amended by <id>`,
"acceptance is the freeze point", and "record what acted on it" — each of which the rules
now contradict. It was edited twice after the rules changed and both edits touched only
its description line. **Until it is reconciled, anyone following it undoes this unit.**

## 2. What this unit is for

**Every decision in the register can be superseded on its own.** A reader filtering the index
on state gets a true picture at the granularity of a decision rather than of a file, and the
correction for a reversed decision has somewhere to go.

Three things follow from that and are equally in scope: the state vocabulary the records carry,
the framework and skill changes that make the new shape legal and durable, and the two prior
units that were left pointing at rules which no longer apply.

## 3. The state model

**Three states. `Proposed`, `Withdrawn` and `Rejected` are all absent, and for the same reason.**

| State | Means |
|---|---|
| **Accepted** | Agreed and in force |
| **Superseded by `<id>`** | Was in force; the named record replaced it |
| **Deprecated** | Was in force, no longer applies, and nothing replaced it |

**Every record is born `Accepted`, so every state describes something that was once in force.**

**A record is born `Accepted`**, so there is no in-flight state — and `Withdrawn` presupposes
one. You can only withdraw something that has not yet landed. Once a decision is in force it
can be replaced, or it can age out; it cannot be pulled back to a state it never occupied.
`Withdrawn` is the right state for a **proposal**, which does have an open period, and the
wrong one for a record.

**`Deprecated` is what covers ageing out**, and whether it aged out on its own or because
someone decided to stop is carried by the record's reason line rather than by a second state.
That distinction is real but it is not load-bearing: the reader's question is *does this still
bind me*, and the answer is the same either way.

**The ladder that disambiguates all three:**

| Still applies? | Something replaced it? | State |
|---|---|---|
| Yes | — | **Accepted** — annotated if a mechanism it names is gone |
| No | Yes, and it is recorded | **Superseded by `<id>`** |
| No | Yes, but nothing recorded it | **A missing decision** — write the record, then Superseded |
| No | No | **Deprecated** — the reason says whether it was pulled or aged out |

**`Rejected` went with `Proposed`, and for the same reason.** It was only ever reachable from a
record that existed before it was decided. Each thing it carried has a better home: an option
weighed and declined belongs in the *Options considered* of the record that won, a design
nobody committed to is a proposal, and a decision *not* to do something is an accepted record
whose answer is no. Two records here were `Rejected` and both were never accepted — see §6.

**`Deprecated` is a claim, not a shrug.** Applying it asserts that nothing replaced the
record, and that has to be checked. "I did not look" is not `Deprecated`, and the
missing-decision row above is what it is usually hiding.

**This does not weaken the missing-decision rule.** That rule fires where something *did*
replace a record and nobody wrote it down. `Deprecated` covers only the case where genuinely
nothing did, so the pressure to write missing records stays where it was.

## 4. Section-level decisions

**A decision inside a legacy record gets its own index row, and stays in the file it is in.**
Nothing is extracted, no new records are written, and no content moves.

**Addressed as `adr-XXXX-s-N`** — `s` for section, `N` its number within the record. So
`adr-0039-s-2` is the nested-storage decision inside `adr-0039`. The parent record keeps its
own row and its own state.

**Where a record's sections are not numbered, `N` is assigned in document order** and the
index row names the section's heading so it is findable. `adr-0041`'s `## Revision —
2026-08-11` is the case: it holds a second decision written into a frozen record, and it needs
an address even though the record never numbered anything. An assigned number is claimed once
and never reused, exactly as a record number is — so a later section cannot take it.

**A section earns a row only if it passes both tests:**

> **Independence** — if this section's decision changed, would the parent record have to change
> to accommodate it? If yes, it is coupled and stays silent inside the parent.
>
> **The bar** — does it bind work outside itself, and would undoing it cost materially more
> than having chosen differently? This is the ordinary test any record has to pass.

**Most sections will fail one of them, and that is the expected result.** A record may
elaborate one decision across several headings, and a coherent model is not sprawl. Taking
`adr-0039` as the worst case: of eleven sections, roughly seven are independent decisions, one
is elaboration of the section above it, and three describe how something is surfaced in the
interface — an arrangement, which the framework keeps out of records entirely and which
therefore earns no row.

**An arrangement section is not moved out.** The record is frozen and keeps everything it says.
The architecture pages that describe those arrangements are written fresh from the code by the
unit that owns them, never lifted from a record.

**The records in scope are the seven in force:** `adr-0004`, `adr-0022`, `adr-0025`,
`adr-0031`, `adr-0036`, `adr-0037`, `adr-0039`. Closed records are not triaged — a superseded
or deprecated record binds nothing, so nothing inside it needs to be independently supersedable.

**Two corrections land as section states rather than as new records**, which is what the
notation exists for. `adr-0036` §4 becomes `Superseded by adr-0049`; `adr-0004`'s membership
model becomes `Superseded by adr-0039`. Both superseding records already exist. This is the
whole point: the correction was already known and had nowhere to be written.

**Sections take states from §3's ladder like any record.** `adr-0022` §1 said MCP was removed
from the Site, and the split brought it back with nobody deciding to reverse it — a
`Deprecated` section inside an `Accepted` record, which today cannot be expressed at all.

## 5. Record-level repairs

**Nothing here touches a decision.** Every item is metadata, which the framework permits to
change.

| | |
|---|---|
| **States** | `adr-0008` keeps `Deprecated`. The five records marked `Accepted, amended by <id>` lose a state that no longer exists; what those amendments recorded becomes section rows under §4 |
| **Implementation status** | Stripped from the ten records carrying it — `adr-0040`, `adr-0041`, `adr-0044`–`adr-0051`. The framework forbids it outright, and these also cite plan numbers, which it excludes as provenance. Which plan landed what is in the `2026-08-14-hq-site-split` unit and in git |
| **Front-matter** | `created:` and `description:` added to all 40, per `conventions.md`. The duplicate `**Date:**` line comes off, so the date lives in one place |
| **Status format** | One form across the folder. Today some records use a `**Status:**` line and others a `## Status` section |
| **`adr-0005`** | Its status reads "Accepted — marked historical", which is not a state. It describes the current stack; the qualifier comes off and it stays `Accepted` |
| **Annotations** | `adr-0017` and `adr-0020` each name a mechanism that no longer exists — the pre-split "Site" and the Firestore routing listener. Both decisions hold; both get a line saying what replaced the mechanism |
| **`adr-0041`** | Its `## Revision — 2026-08-11` section holds a second decision written into a frozen record. It becomes a section row under §4 rather than being extracted |

**The four records the previous units flagged as stale all hold.** `adr-0017` (agent execution
is a site concern — it is), `adr-0020` (delegate tasks, defer sub-agents — it does),
`adr-0026` (heavy data stays on the Site — it does; only the endpoint placement moved, and
that was annotated on 2026-08-19), `adr-0031` (project workspaces and roadmap memory — it
does). **No record is retrofitted.** Writing a decision nobody made, reconstructed from code,
is what `adr-0054` did and why it was retired the same day it was written.

## 6. Three records leave the register

**It is a proposal, and proposals are issues.** `adr-0053` is `Proposed` — a state that no
longer exists — and it is a weighed design for work nobody has committed to, ending with a
section titled "Before this can be accepted". The framework is explicit that a design nobody
has committed to is a proposal, and that a design spec cannot exist outside a unit of work.

**The issue already exists.** The storage-boundary proposal carries the design in full and
already records the problem in its own body: *"a backlog item is normally a piece of work; this
is a design awaiting a decision, which is a third thing."* The `Proposal` issue type now exists
at the org level, which is the home that was missing when it was filed.

So: re-type that issue from `Feature` to `Proposal`, delete `adr-0053`, and retire number 0053 in the
index pointing at the issue. Same disposal shape as `adr-0027`, which the previous unit
removed for the same reason — a file in the register that never held a decision.

## 7. Retrofitting the two prior units

**Neither is rewritten. Both are pointed at this unit**, because a plan that sends a reader to
abolished rules is worse than one that says where the work went.

**`2026-08-19-adr-state-integrity` — closed, and stays closed.** It gets a dated pointer note
repointing the backlog ids that died when the backlog left git — `bl-0032` to the issue on hq's
management MCP surface, `bl-0033` to the issue on the unbuilt Connector model — and naming this unit as where the register work continued. Its findings
stand as written. The precedent is its own: that plan already carries a "Pointer, added
2026-08-21" note for exactly this purpose. Its spec's `**Status:** Proposed` line comes off,
which the framework forbids on a spec.

**`2026-08-21-architecture-documentation` — phase 3's record work moves here.** That phase was
written on 08-21, three days before the framework changed, and running it as written would
produce deprecations and amendment markers under rules that no longer hold.

| Moves to this unit | Stays with the architecture unit |
|---|---|
| 3.1 dispose of `adr-0017` and `adr-0026` | Phase 2 in full — the architecture pages |
| 3.2 annotate stale references in Accepted records | 3.3 dispose of whatever phase 2 adds to Revisits |
| 3.4 the reading protocol in the decision index | 3.7 verify every page's citations resolve |
| 3.6 annotate the five records trimmed on 08-21 | 3.8 close the unit |
| 3.5's unfinished half — the admission gates | |

**Task 3.5 is half-landed and the plan does not say so.** The design-versus-decision separator
reached the framework as *a record holds a choice, not an arrangement*. The admission gates —
significance and contestedness — did not. This unit finishes them.

Each unit ends with one job: that one writes the pages, this one repairs the register.

## 8. What lands outside this repository

**These are changes to the maintainers' rules, and there is no cross-repository commit.** Each is a separate
commit there, and **they land before any record here is touched** — otherwise the
work is done against rules that are not yet written, which is the failure this unit exists to
correct.

| Change | Why |
|---|---|
| Remove `Withdrawn`, restore `Deprecated`, per §3 | A record has no in-flight state, so it cannot be withdrawn |
| Add `adr-XXXX-s-N` section addressing | §4's mechanism does not exist in the framework today |
| Add the admission gates — significance and contestedness | The architecture unit's 3.5, never finished |
| Reconcile the tooling that teaches the decision-record rules to all of the above | It teaches the superseded model, and anyone following it undoes this unit |
| Refresh the installed copy in this workspace | The installed copy is what agents here actually read |

**No longer flagged — fixed.** `proposal.md` gave a proposal two closings and called them
load-bearing; GitHub has three, and the set is fixed. It now names all three, says `not planned`
carries both *rejected* and *withdrawn* with the closing comment separating them, and gives
*duplicate* its own line as bookkeeping rather than an answer. Adding a field to carry the
outcome was weighed and refused, and that refusal is itself a rule now. The proposal is
closed.

**Also fixed, found on the way:** the `Effort` field of the maintainers' issue tracking existed and was documented nowhere,
and no issue type said which fields it carries. Both are now written down there.

## 9. Open questions

**Does this unit need a `source:` issue? — settled: yes.** One was
raised part-way through and cited. The rule holds without an exception;
what happened is that this unit began outside the queue, which is the thing the one-entry-path
rule exists to prevent. Backfilling makes the citation resolve but does not undo it — recorded as
a deviation rather than tidied away.

**Who validates the section triage?** §4's two tests are judgement calls applied roughly
fifty-five times. A wrong call in either direction is quiet: a coupled section given its own
row invites someone to supersede half a decision, and an independent one left silent
reproduces the problem this unit exists to fix. The triage needs a review pass that is not the
same reading as the one that produced it.

**Is the index still readable? — settled: yes, at 66 rows.** Thirty-seven records and twenty-nine
section rows. The fallback was never needed because the rows are grouped by construction: each
sits directly beneath its parent and is marked with a leading `↳`, so the table reads as
thirty-seven entries some of which expand, rather than sixty-six flat ones.

## 10. Out of scope

- **Extracting sections into their own records.** Deliberate, per §4. The rule is
  to extract on relevance, and a wholesale sweep would write roughly thirty records whose
  options were never separately weighed.
- **Retrofitting records for decisions nobody wrote down.** Per §5. Not every decision is
  captured, and inventing one after the fact is description wearing a record's shape.
- **The architecture pages.** They are the other unit's phase 2, and they are what actually
  answers "how does this system work" — this unit only makes the register readable behind them.
- **Triaging closed records.** A superseded or deprecated record binds nothing.
- **Fixing code.** Where a record turns out to be a live requirement nothing met, it is queued.
