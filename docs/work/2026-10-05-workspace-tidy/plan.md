---
created: 2026-10-05
description: Workspace chores before the next milestone — a shorter AGENTS.md that a contributor can follow without anything outside this repository, and a decision on how hq is structured and tested, with the code moves it calls for.
---

# Implementation Plan · Workspace tidy

**Branch:** `chore/workspace-tidy`

**Closed 2026-10-06**, merged to `main` in `eedc53fe`. **QA contract:** the unit changed no behaviour a person
sees, so it adds no stories or scenarios; the scenario files name the tests' new paths.

An operational unit: no design spec. It finishes before *Agenthix is usable — every screen reviewed* starts
(scheduled 2026-10-07), and earlier is better.

## Goal

The next milestone starts on a workspace that is cheaper to work in: `AGENTS.md` carries only what applies to
every task, everything a contributor must follow is in this repository, and hq's structure and tests have a
decided direction, with the moves it calls for done. Phase 2 is held to the numbers in [`measures.md`](measures.md), measured before and after.

## Approach

- **In order, each step making the next cheaper:** `AGENTS.md` first, then hq.
- **Self-contained for contributors.** This repository is public. A contributor must be able to work from what
  is committed here alone, so nothing they must follow lives only in tooling outside it, and committed files do
  not describe the maintainers' own tooling.
- **No execution plans.** Each step is small or decided with the owner as it goes; the hq moves, where they need
  parallel work, run as lanes with a short brief each and one shared set of rules.
- **Documents wait for the owner's approval before they are committed.**
- **hq moves are behaviour-neutral**: code and tests move, nothing a person sees changes. The full regression
  runs after each lane merges. Parallel lanes follow the resource strategy in `AGENTS.md` (lock around heavy
  commands, the lead watching the machine).
- Phase 1 on `chore/workspace-tidy`, merged to `main` `--no-ff` on its own; phase 2 on its own branches, each merged when its part is done. Each merge with the owner's approval.

## Work breakdown

### Phase 1 — A shorter `AGENTS.md`

- [x] 1.1 Sort every section: applies to every task, reference for some tasks, out of date
- [x] 1.2 Move reference into `docs/architecture/` or skills committed in this repository (migrations, tailnet
      mode and the like are procedures for a skill); remove what is out of date
- [x] 1.3 `AGENTS.md` keeps the always-on rules and an index to the rest; nothing it pointed to is lost
- [x] 1.4 Nothing a contributor must follow lives only outside this repository: what every contributor needs is
      in `AGENTS.md` or a committed skill
- [x] 1.5 Committed files stop naming or describing the maintainers' private tooling

### Phase 2 — How hq is structured and tested

- [x] 2.1 Measure: which tests mostly assert mocks, which overlap integration tests, the slowest and largest
      files, which modules break from distant changes; how Wasp 0.21 apps split `main.wasp` and organise by domain
- [x] 2.2 Options on one page for the owner, with the numbers; the owner decides — upgrade Wasp first, then a
      feature layout, then the testing changes
- [x] 2.3 A decision record for what binds how code is built: the feature layout and the testing rules
- [x] 2.4 Upgrade hq to Node 24 and Wasp 0.25: the declarations in the new format, the image and its web server's
      fallback, the typecheck command, and the documents that name the old format
- [x] 2.5 Feature folders, each with its own declaration file beside its pages and operations
- [x] 2.6 The testing changes the owner chose
- [x] 2.7 Measure hq again and fill in the After column of [`measures.md`](measures.md)

## Deviations

| Phase | What changed | Why |
|---|---|---|
| — | The unit's first step, a change to the maintainers' own tooling, left this plan and is tracked outside this repository; the phases were renumbered | This repository is public, and that work is neither here nor needed by a contributor |
| 1 | Added 1.4 and 1.5 | A contributor will not have the maintainers' tooling once the repository is public |
| 2 | Phase 1 merged to `main` on its own; phase 2 continues on a new branch from 2.2 | The measurements (2.1) showed phase 2 may include a Wasp upgrade (0.21 → 0.25) and moving most of hq, so the owner chose to land phase 1 first |
| 2 | 2.3–2.6 replace "the moves it calls for": a Wasp upgrade comes first | Wasp 0.21 cannot split its declarations; a feasibility check found the upgrade to 0.25 small (about 2–3 days, no blockers), and doing it first means restructuring hq once, on the platform it keeps. The screen-review milestone still starts on 2026-10-07 |
| 2 | The Wasp upgrade (2.4) merged to `main` before the feature layout | The owner chose to land the upgrade on its own once it was walked through; 2.5 onward continue on a new branch |
