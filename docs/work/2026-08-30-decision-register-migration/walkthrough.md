---
created: 2026-08-30
description: How to exercise the migrated decision register and decide whether to accept it.
---

# Walkthrough · Decision Register Migration

**Acceptance here is a reading, not a run.** Nothing executes, so every check below is something
you look at. Five minutes if it holds.

---

## 1 · The index tells the truth about itself

Open [`docs/adr/README.md`](../../adr/README.md).

- [ ] The state legend lists **three** states — `Accepted`, `Superseded by <id>`, `Deprecated` —
      and explains why `Proposed`, `Withdrawn` and `Rejected` are each absent.
- [ ] **How to read this folder** appears above the index and says to filter on state rather than
      read front to back.
- [ ] The retired-numbers table accounts for `0006`, `0027`, `0052`, `0053`, `0054`, and holds
      `0042`/`0043` unused. Next number is `adr-0055`.
- [ ] No row anywhere says `Proposed`, `Rejected` or `amended by`.

## 2 · A section row resolves to a flagged section

Pick any three rows whose id contains `-s-`. For each:

- [ ] The link opens the parent record **at that section**.
- [ ] If the row's state is closed, the section's **first line** is a matching flag —
      `> ⚠️ **Superseded by <id> — this section only.**` or `Deprecated`.
- [ ] The parent record's own status is still `Accepted`.

`ADR-0031-s-3` is the clearest one to try: the row says `Superseded by adr-0032`, the section
carries the flag, and the record stays in force.

## 3 · A closed verdict survives your own check

Take one closed section row and test it yourself rather than reading the reasoning:

- [ ] `ADR-0004-s-5` says missions were superseded by `adr-0030`. Search the codebase for
      `Mission` — the only hits should be *"Mission / Vision"* in a roadmap template and an org
      profile field. Neither is the mission model.
- [ ] `ADR-0031-s-3` says the two-phase heartbeat was superseded. Search for `generateObject` —
      it should appear nowhere.

## 4 · No record carries what a record must not

- [ ] No record's status line names a branch, a plan number, or says *Implemented on…*.
- [ ] Every record opens with `created:` and `description:` front-matter, and carries its date
      only there.
- [ ] `adr-0037` has **no** note saying its `Connector` is unbuilt — whether a decision has been
      carried out is not a record's business. Its own issue holds that.

## 5 · The prior units point here

- [ ] [`2026-08-19-adr-state-integrity/plan.md`](../2026-08-19-adr-state-integrity/plan.md) opens
      with a dated pointer repointing `bl-0032` and `bl-0033` to their issues, and naming this unit.
- [ ] [`2026-08-21-architecture-documentation/plan.md`](../2026-08-21-architecture-documentation/plan.md)
      shows tasks 3.1, 3.2, 3.4, 3.5 and 3.6 struck and moved, with the reason in Deviations.
- [ ] Neither spec carries a `**Status:**` line.

## 6 · The other half landed outside this repository

The maintainers' own rules and tooling, in a separate repository:

- [ ] The decision-record rules have three states and the `<id>-s-N` migration.
- [ ] The tooling that teaches them says the same, and its version is bumped so the installed copy matches.
- [ ] The proposal and unit-of-work rules each carry one Mermaid diagram.

---

## What would make you send it back

**A section row whose flag says something different from the index.** The two are meant to be one
claim in two places; a disagreement is a defect, not an ambiguity.

**A closed verdict you can disprove.** The weakest is `ADR-0004-s-6` — the execution queue is
attributed to `adr-0049`, which decided container-per-session rather than replacing a lockfile by
name. `Deprecated` is arguable there.

**Anything in `docs/adr/` that reads as a description of how the system works today.** That is
architecture's job, and a record claiming it is the failure this unit exists to correct.
