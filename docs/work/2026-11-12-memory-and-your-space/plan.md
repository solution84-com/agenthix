---
created: 2026-11-12
description: The phases of the memory and Your space unit — memory's new scope, kinds and recall, the one memory screen, Your space as a project place — run unattended by the lead with lane agents, beside the generated avatars unit.
---

# Implementation plan · Memory people can find, and Your space as a project place

## Goal

Memory becomes a person's, saved by an agent where it works, a Fact or a Rule, recalled with Rules weighted, and
found on one screen where the person promotes or forgets it; Your space and personal projects become project places
with Settings and the project Overview; "Secrets and variables" becomes Vault ([spec](spec.md),
[ADR-0188](../../adr/adr-0188-memory-is-a-persons-saved-by-an-agent-where-it-works.md),
[boards](boards/design-pass.html)).

**In scope:** everything in the spec's decisions 1–13 and its design, sections 1–9.

**Out of scope:**
- **Several agents or places per memory.** Decision 2 keeps it reachable; nothing needs it until collaboration rooms.
- **Knowledge search by meaning.** Already planned on its own; until then place facts are found by their words
  (decision 4's accepted cost).
- **A notice for sensitive saves**, as Claude shows. Left out until quiet saves are seen to worry people.
- **Skills found by meaning instead of a description list.** The same idea for skills, but its own work, and a vendor's
  harness decides how skills load on a site.
- **An agent page's own Overview.** Another kind of place; unchanged.

## Approach

**Memory changes from the inside out.** The record changes first: the scope becomes three columns (person, optional
agent, optional place), the kind becomes Fact or Rule, and pin and person-written memories go. Everything else reads
that record, so it lands first and alone. Recall keeps its shape (the search before the turn, the two tiers, `recall`
on demand) and gains two things: the scope check before the meaning search, and the Rule weight inside the tiers.
The tools keep their names; their `scope` arguments and old kinds are deprecated and still read, so a site on the
previous protocol keeps working (`docs/architecture/versioning.md`). A run's pinned memory becomes a run's recalled
memory: the same search, with the run's brief as the query, carried in a new run-context field.

**The screens come after the server they read.** The one memory dialog is built once and opened from the memory
screen, an agent's page and Show in a conversation. It is a view opened by a press, not a message, so ADR-0185's rule
about dialogs does not stop it; Forget, which cannot be undone, follows the `handling-errors` skill.

**Your space is the project place it already is underneath.** Your space is backed by the person's personal project
behind Chat; it is drawn by its own place code today. It switches to `useProjectPlace`, which gives it the project's
menu, Settings and Overview, with what concerns other people left out. This touches none of memory's files, so it
runs beside the memory phases.

**How the work is carried out.** Unattended, to the end (the owner's instruction, 12 Nov). The lead runs the phases
with lane agents (`running-lanes`): each lane one purpose, its own worktree and branch cut from the unit's branch,
merged by the lead one at a time as one commit rebased onto the head. The lead decides what can reasonably be
decided and records it in the running report; a decision with no obvious answer is built the most conservative way
and listed for the owner. A change of direction goes in *Deviations* and corrects the spec in place. Security,
critical and usability issues are fixed in the unit and reported. **The lead stops for the owner only for a real
blocker**: something only the owner can decide or unblock, or anything touching security or legal exposure.

- **Order:** Phase 1 (one lane) and Phase 3 (one lane) in parallel from the start: their files are disjoint but for
  the shared project's Memory section, which Phase 1's lane removes. Phase 2 (screens) after both. Phase 4 last.
- **Migrations:** lanes never write one. The lead generates hq's migration at lane A's merge. It is destructive (the
  memory table is emptied and reshaped), approved in principle before `0.1.0-rc.1` (the `database-migrations` skill);
  nothing is carried over.
- **Tests:** lanes run the unit tests and typechecks of what they touch, through the machine-wide lock. The lead runs
  the integration suite after lanes that change server operations or data, the site's container test after lane B,
  and the full regression once at the close, with every image built and started.
- **Reviews:** each finished lane goes to a reviewer agent that did not build it, against criteria written once from
  the spec and the boards. Critical and security findings are always fixed; should-fix when cheap, otherwise reported;
  minor reported only. Two rounds per lane at most. Besides: a security review of who may read, promote and forget a
  memory, and a design and usability review of every screen that changed.
- **Landing:** the owner walks the built work from the report. Merging to `main` and every push wait for the owner's
  say-so.

**Beside the generated avatars unit.** That unit runs at the same time on its own branch, in the main checkout. This
unit's branch is cut from `main` in its own worktree, `.worktrees/memory`, so neither waits for the other.
- **Shared machine:** both units' lanes take the same lock (`/tmp/agenthix-heavy.lock`) for every heavy command, and
  at most five copies of the app run across both.
- **Own development database:** this worktree's hq uses its own database on the same Postgres, so the two branches'
  migrations never meet. The integration suite's test database is shared; runs take the lock, and each brings it to
  its own branch's schema before running.
- **One hq at a time** on the fixed development ports: the owner's walk of one unit happens while the other's hq is
  stopped.
- **Landing second:** the owner's plan is to rebase this unit onto the avatars unit once that one merges. The rebase
  regenerates this unit's migration after the avatars one, moves the client protocol's minor version past the
  avatars unit's, and merges the shared lists: `versioning.md`, the protocol snapshots, `toolSchemas.ts`,
  `operations.ts`, the read-only queries list and the QA contract.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0122 (the parts that stand: memory in hq, recalled by meaning by one local model), ADR-0185 (dialogs and messages), ADR-0121 (the lead in hq) — all Accepted |
| **Implements** | ADR-0188 |
| **Revisits** | ADR-0122 (its scopes and pinned items, superseded by ADR-0188 at the start), ADR-0058 (the person no longer changes a memory's words) |

## Key decisions

| Decision | Why |
|---|---|
| The scope is three columns on the record, not a scope enum | Recall checks it before the meaning search with a plain query; widening to sets later is two linked tables beside it |
| Keep `scopeKey`, rebuilt from the three columns | The key's uniqueness within a scope stays one index; promoting moves a memory to another key space |
| The saving agent and place are stored apart from the scope | The switches flip back to them, and the dialog's *saved by* line reads them, after a promotion has emptied the scope |
| Deprecate the tools' `scope` argument and old kinds, and keep reading them | A site one protocol version behind keeps working; nothing is removed without a mark first |
| A run's memory comes from the same search, with the run's brief as the query | Pinned memory is gone; a run needs the memory its task calls for, found the same way a turn finds it |
| The bar tuner leaves out a Rule included only by its weight | Otherwise the weight would pull the calibrated bars down for every memory |
| One dialog for a memory, everywhere | One component to build and learn; the chat's docked, expanded and full-page layouts all fit a centred dialog |
| Your space through `useProjectPlace`, not a second set of project features in Chat's place code | It is a personal project underneath; one place code means one menu, Settings and Overview to keep right |
| Against: an execution plan for any phase | Each phase's steps follow from the spec and the code; a capable agent derives them from a brief |
| Against: a separate unit for Your space | Decision 3: the place decides where a way into memory sits, so the two are designed and walked together |
| Against: cutting this unit from the avatars branch | It would tie this unit to that one's progress; cutting from `main` and rebasing at landing costs one regenerated migration and a version bump |

## Work breakdown

Four phases. The record and recall are the base everything else reads; the screens need them; places stand apart and
run beside both; proof comes last.

### Phase 1 — The memory record, recall and tools
**Delivers:** memory saved, scoped, weighted and recalled as the spec says, through the tools, in turns and in runs.
**Starts when:** —
**Execution plan:** none — lanes. One lane: changing the record breaks every reader of it at once (the service, the
tools, the run, the conversation line), so they change together and the typecheck holds at the merge.

- [x] 1.1 The record: scope as three columns, `FACT`/`RULE`, saved-by agent and saved-in place; `pinned`, `scope` and
      `writtenByUserId` removed; the destructive migration
- [x] 1.2 The scope check before the meaning search, and the scope key; no memory for a turn or run with no person
- [x] 1.3 The near-duplicate rule by kind, in saving and in the tidy
- [x] 1.4 The tiers with the Rule weight; the outcome mark; the bar tuner leaving weighted Rules out
- [x] 1.5 The service: save without a scope, with `requested`; promote and flip back, with key clashes; forget within
      reach; recall's kind and tag filters
- [x] 1.6 `remember`, `recall` and `forget` for the lead and for runs, with the deprecations and the protocol version
- [x] 1.7 The lead's memory instructions: the kind, a Rule's situation in its body, place facts to Knowledge
- [x] 1.8 A run's recalled memory: the search with the run's brief, the run-context field, `pinnedMemory` deprecated
- [x] 1.9 The site writes the run's `memory` file
- [x] 1.10 The "Remembered" line: only for a requested memory, its target the memory's id, the old parameters deprecated

### Phase 2 — The memory screens
**Delivers:** the memory dialog, Settings › Memory, an agent's page › Memory, and Show in a conversation, as on the
boards; the old editor, tabs and Pin gone.
**Starts when:** Phase 1 has merged into the unit's branch.
**Execution plan:** none — lanes. One lane; the dialog first, since every other screen opens it.

- [x] 2.1 The client operations: the list with its filters, change the scope, forget; the old ones deprecated; the
      client protocol version
- [x] 2.2 The memory dialog
- [x] 2.3 Settings › Memory: the list, its badges, filters and words search, archived
- [x] 2.4 An agent's page › Memory: its own, then what every agent knows
- [x] 2.5 Show on the "Remembered" line opens the dialog, in every chat layout
- [x] 2.6 Removed: the editor, the add form, the tabs and scope names, Pin

### Phase 3 — Your space and personal projects as project places
**Delivers:** Your space drawn as a project place with Settings and the project Overview; personal projects with the
project Overview; a shared project without Memory; Vault.
**Starts when:** — (files disjoint from Phases 1 and 2; runs beside them)
**Execution plan:** none — lanes. One lane.

- [x] 3.1 Your space through `useProjectPlace`, its own section list removed; the menu less Sprints, Timeline,
      Workroom, Members and GitHub
- [x] 3.2 Your space's Settings: General with the description only, Task types, Custom fields, Runs and finished
      tasks; no Delete
- [x] 3.3 The project Overview for Your space and personal projects: no Lead or People; a Personal projects card for
      Your space
- [x] 3.4 A shared project's Memory section removed (built in Phase 1's lane, which removes that scope)
- [x] 3.5 "Secrets and variables" shown as Vault

### Phase 4 — Proof, documents and report
**Delivers:** the model checks' numbers, the user guide and QA contract current, the reviews done, the full
regression run, and the report for the owner's walk.
**Starts when:** Phases 1–3 have merged.
**Execution plan:** none — by hand and lanes. The model checks state their arms, calls per cell and cost before
running.

- [x] 4.1 Model check: the Rule weight, with and without, on questions whose words don't name the rule
- [x] 4.2 Model check: the kind and `requested` chosen as the person meant
- [x] 4.3 Model check: rules met only mid-work
- [x] 4.4 The user guide: memory, Your space, Settings, Vault
- [x] 4.5 The QA stories and scenarios, tests tagged
- [ ] 4.6 The security review, and the design and usability review
- [x] 4.7 The full regression, every image built and started
- [x] 4.8 The report

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 1 | A memory whose saved-in place is unknown (saved where the work had no place, or the place since deleted) flips back to "everywhere" instead of being refused | Both cases store no saved place and cannot be told apart; refusing would block flipping back a memory that never had a place |
| 1 | `MemoryOutcome` gains `weighted`, the mark the bar tuner skips | The spec's "mark saying so" needed a column |
| 3 | No deviations | |
| 4 | Model checks 4.1–4.3 are written (eight checks, `__modelchecks__`) and wait for the owner to agree their cost before they run; check 1 gained an arm with the Rule not shown at all | The real local embedder scores the motivating question 0.08 against the Rule, below both bars, so the weight never acts on it; the third arm measures what a person meets |
| 4 | 4.6: the security review ran on the code (no path to another person's memory; one finding fixed); the live design and usability review on the running app did not run, since the app's ports were held by the other unit until the end; the owner's walk stands in for it | The machine's fixed ports, shared with the generated avatars unit |
| 4 | The full regression ran once after rebasing onto main with the generated avatars unit, for both units: every suite passes; seven end-to-end tests fail the same way on main (Library, skills and Knowledge specs left behind by earlier screen changes), outside this unit | The two units landed one after the other, and the owner asked for one regression over both |
