---
created: 2026-08-21
description: Making the current-state documentation the way this system is understood, so the decision records can go back to being a log book nobody has to read first.
---


# Architecture Documentation — Design

> **Amended 2026-08-30.** The record-layer half of this unit's §3 was carried out by
> `2026-08-30-decision-register-migration` instead. This spec was written on 2026-08-21, three days
> before the maintainers' decision-record rules were restructured — the states it names, and the
> dispositions §3 asks for, no longer exist. **What this unit still owns is §3's first four
> bullets: the architecture pages themselves.** The record-layer bullets are the other unit's, and
> its own spec supersedes what is written here about them.

**Succeeds:** the unit `2026-08-19-adr-state-integrity`, which is complete. That unit
audited every Accepted record against the code and disposed of six drifts. Its closing
finding is this unit's premise: *records do not usually go stale because someone changed
their mind — they go stale because they recorded something that was never a decision.*
This unit addresses why that kept happening.

---

## 1. The problem

**A new engineer has nowhere to learn how this system works.** There is no
`docs/architecture/README.md`. The twelve files that exist cover four areas — sites, mcp,
tools, site auth — and **seven of them were last touched on 2026-08-09**: before the
`hq` rename on 08-11, and before the entire topology cut landed on 08-18. An eighth was
touched on 08-21 and still describes **Firestore**, a datastore removed when `adr-0005`
pivoted the platform to Node.js and Postgres — so recency of edit is not evidence of
currency, which is why every file gets read rather than triaged by date.

So the living documentation is **staler than the records**, which is the worse failure of
the two. A dated record carries its own warning; a Living document is trusted as current.

**The consequence is that the decision records absorbed architecture's job.** They are the
only documentation anyone has maintained, so they became the only place the system is
described — which is why they read as specifications rather than as decisions, and why the
folder feels unusable. The five records with the heaviest specification content are also
the most heavily cited: `adr-0025`, `adr-0036`, `adr-0039`. They were not written badly.
They were asked to do a job that belongs to another document.

**Two mechanisms are broken as a result.**

*The reading protocol.* A decision folder is read by filtering on state: read the Accepted
ones to understand what is in force, and the closed ones only to understand code of that
vintage. That only works if the states are true. Four records marked **Accepted** describe
Firestore. `adr-0017` ("Agent Execution is a Site Concern") and `adr-0026` ("Workspace File
Serving via Site HTTP Endpoints") are Accepted, name Firestore, and use "Site" in the
**archived pre-split sense** — so a reader today resolves it to Execution Site and gets a
confidently wrong answer. Nothing in the repository tells anyone how to read the folder.

*The path from confusion to reason.* An engineer meets something counter-intuitive in the
code and should be able to reach the record explaining it. Today **5 of 12 architecture
files and 13 of 55 concept files cite any record at all**, so mostly that path does not
exist and the only way in is to search forty files by hand.

## 2. What this unit is for

**Current-state documentation becomes the way this system is understood.** A new engineer
reads `docs/architecture/` and can work, without opening a single decision record. The
records go back to being what they are for: a log book, consulted backwards, when
something in the code does not make sense.

Both halves matter. Writing the architecture without repairing the record layer leaves the
misleading Accepted records in place; repairing the records without writing the architecture
removes the only description of the system that currently exists.

## 3. The target state

- **`docs/architecture/README.md` exists** and describes the system as it is: the modules,
  the HQ / Execution Site topology, where data lives, and how a run travels end to end.
- **Every area a reader needs has a page**, including the ones nothing documents today —
  the control channel, storage and placement, the container runtime, identity and trust.
- **No Living document describes a system that no longer exists.** Every existing file is
  updated, rewritten or deleted, each with a reason.
- **Every architecture page names the decisions that shaped it, by id.** This is the bridge
  that makes reading backwards possible without digging.
- **Every Accepted record either describes the system or says how it does not.**
- **The reading protocol is written down**, in the decision index, where the reader is.
- **A qualifier exists** that distinguishes a decision from a specification, so this does
  not recur.

## 4. The constraint everything bends around

> **Never revise what a record decided. Always maintain how a reader finds their way to and
> from it** — its status line, its amendment markers, its citations.

Content is frozen; navigation is live.

This is the freeze rule read precisely, and it settles a question this unit would otherwise
reopen. The specification-heavy records are **not** rewritten to move their content into
the new architecture pages. Under a log-book reading, the historical detail in a record is
a feature — it says what the world looked like when the choice was made — and the reader
who wants it is exactly the reader who opened that record. The new pages are **written
fresh from the code**, and the old records keep everything they say.

What is repaired is navigation only: a state that is untrue, a missing amendment marker, an
absent citation.

## 5. What is deliberately out of scope

- **Rewriting or trimming any accepted record.** Per §4. An earlier draft of this plan
  proposed graduating specification content out of `adr-0025`, `adr-0036`, `adr-0037` and
  `adr-0039`. That is dropped.
- **Consolidating the pre-split records into a summary.** Fourteen of them are cited by the
  post-split records, and each closed record carries an option weighed and declined —
  which is the thing that stops it being re-proposed. The summary a reader wants is the
  architecture documentation, and that is §3.
- **`docs/concepts/`.** Fifty-five files, a different question — what the system *models*,
  rather than how it is *built*. It has its own audit.
- **Fixing code.** Where a record turns out to be a live requirement nothing met, it is
  filed as queued work, not resolved here.
- **The storage-boundary design.** Written here as `adr-0053`, which was removed on 2026-08-30 —
  a design nobody had committed to is a proposal, and it is now an issue.
  Nothing has been decided, so architecture still documents the system as built and its subject
  stays out of the pages entirely.
- **The developer playbook.** It exists — `CLAUDE.md`'s code conventions and
  `ui/DESIGN-SYSTEM.md`. Duplicating it here would create the second copy that drifts.

## 6. Why this will not simply recur

The audit that preceded this unit closed the loop for *drift*: a unit must now name the
records it implements and revisits, and write the implementation note at close.

It did nothing for the failure that actually produced these records, which is **admission**
— material entering the folder that was never a decision. Two gates are missing from the
bar, and both are standard: **significance** (does it touch structure, a quality attribute,
a dependency, an interface, or a construction technique?) and **contestedness** (was there
more than one viable option? if the choice was obvious there is no decision to record).
Adding them is small, and it is what stops the next specification being filed as a record.

The second guard is the architecture documentation itself. A record becomes a
specification when there is nowhere else for the description to go. Once there is
somewhere, the pressure comes off.
