---
name: Audit report — site-full
scope: site · story + scenario · accuracy + coverage + regression (full)
branch: qa/2026-06-18-site
started: 2026-06-21
updated: 2026-06-21
label: site-full
runs:
  run-01: 2026-06-21 11:59   # initial full audit + remediation
  run-02: 2026-06-21 19:10   # re-validation after fixes
verdict: accepted-with-conditions
---

# Audit report — 2026-06-21-site-full

## Summary

**31 → 11, and the work held.** run-01 found 31 issues and remediated them in-branch (story coverage 77%→100%, scenario citation 0.7%→~94%, 506→626 unit / 3→163 integration tests). run-02 re-ran the whole audit to check whether the gaps were correctly identified and closed.

Result — gap identification was **accurate, with one recall gap**:

- **No fixed defect re-surfaced** (zero false positives). F-007/F-021/F-023/F-024/F-010/F-011/F-016/F-022 all confirmed still fixed in code.
- **Every deferred issue reconciled** as Open exactly where expected (QI-001…QI-006); no drift.
- **Coverage held** — story 100%, scenario citation ~96%, 0 broken refs.
- **The re-run earned its keep**: it caught **3 new security bugs (F-032/F-033/F-034)** in the same "no server-side auth" family as the fixed F-021 — run-01 found one member of that family and missed three siblings. That recall gap is filed as **FI-001** (sweep the whole class).

**Recommended order (when the deferred items are picked up):** the 3 security first (F-033/F-034 are straightforward guards; F-032 needs a ruling — break-glass vs bootstrap-only), then the low residuals as one cleanup batch, then the citation stragglers, then the doc fix. **This run was a time-boxed close** — all run-02 items are deferred to the register (QI-008/009/010, FI-003), nothing fixed in-session.

## Runs

Two runs rolled into one report. `run-01` was the initial full audit + in-branch remediation; `run-02` re-ran the full audit to **validate gap identification** after the fixes. Each run's working scratch (cell reports + domains + logs) lives beside this file in `runs/{run-01,run-02}/`. Runs are numbered (not timestamped) so a campaign can span days without breaking ids; the actual datetimes are in the frontmatter. F-numbers are unique within this report and continue across runs.

| Run | Scratch | When | Purpose | Findings | Outcome |
|---|---|---|---|---|---|
| run-01 | run scratch, not kept | 2026-06-21 11:59 | initial full audit + remediation | F-001…F-031 | 27 fixed in-branch, 4 deferred (QI-004/005/006/007), F-001 → QI-001 |
| run-02 | run scratch, not kept | 2026-06-21 19:10 | re-validation after fixes | F-032…F-042 | 8 low parked · 3 security + doc pending decision |

## Measurements

One row per run (grows down as runs accumulate) — the durable trend rolled up from each run's cell reports (the itemised detail stays in `runs/run-NN/site/*.md`).

| Run | typecheck | unit | integ | e2e | cov (lines) | story cov | scenario cite | findings | accuracy verdict |
|---|---|---|---|---|---|---|---|---|---|
| run-01 | pass | 506 | skip (no DB) | skip | n/a | 77% (72 gaps) | 0.7% (140 uncited) | 31 | contract accurate; access-control → QI-001 |
| run-02 | pass | 626 | 163 | 3 (canary) | 23.87% | 100% (0 gaps) | ~96% (9 uncited) | 11 | contract accurate; no delta |

## Findings & decisions

### Column legend — possible values

| Column | Possible values |
|---|---|
| **ID** | `F-NNN` — unique within this report, continuing across runs. |
| **Run** | which run surfaced it (`run-01` / `run-02`). |
| **Source** | `story-accuracy` · `scenario-accuracy` · `story-coverage` · `scenario-coverage` · `regression`. |
| **Type** | `code defect` · `inaccurate AC` · `contract defect` · `coverage gap` · `capability gap` · `dead-code` · `doc defect`. |
| **Severity** | `critical` · `high` · `medium` · `low`. For coverage/capability gaps, severity reads as *QA priority*. |
| **Decision** | `fix now` · `defer` (→ `QI-NNN`) · `ignore` · `resolved` (done) · `pending`. |
| **Route / outcome** | where it went: `fixed (+test)` · `apply contract edit` · `QA remediation` · `QI-NNN` · `needs ruling` · `update strategy` · `parked`. |

### run-01 — initial audit (F-001…F-031) · all closed

| ID | Run | Source | Type | Severity | Finding | Decision | Outcome |
|----|-----|--------|------|----------|---------|----------|---------|
| F-007 | run-01 | scenario-accuracy | code defect | critical | "Remember me" persisted raw username + password to `localStorage` | resolved | fixed (username-only + legacy purge) + `/security-review` |
| F-017 | run-01 | story-coverage | coverage gap | high | 72/313 ACs (23%) had no covering scenario | resolved | 75 scenarios (SC-144–218) + tests |
| F-021 | run-01 | scenario-accuracy | code defect | high | MCP key mint/rotate actions had no auth — any caller could mint the site key | resolved | fixed (admin gate 401/403) |
| F-001 | run-01 | story-accuracy | inaccurate AC | medium | No server-side access-control ACs across write domains (UI-only rules) | resolved | recorded in QI-001 (no `unimplemented` AC) |
| F-004 | run-01 | story-accuracy | code defect | medium | `runTask`/`updateTaskState` disagree on backlog-task run | resolved | fixed (+test) |
| F-008 | run-01 | scenario-accuracy | code defect | medium | Invite tokens + voice keys stored/returned cleartext | defer | QI-004 (broadened) |
| F-009 | run-01 | scenario-accuracy | code defect | medium | Invite rate limiter per-pod in-memory, asymmetric counting | defer | QI-005 |
| F-010 | run-01 | scenario-accuracy | code defect | medium | Several mutations write client `status`/`data` unvalidated | resolved | fixed (+test) |
| F-011 | run-01 | scenario-accuracy | code defect | medium | `createProjectRepo` leaves project without deploy key on failure / 422 | resolved | fixed (+test) |
| F-018 | run-01 | scenario-coverage | coverage gap | medium | 140/141 scenarios uncited (tagging debt) | resolved | back-tagged → ~94% |
| F-019 | run-01 | scenario-coverage | capability gap | medium | Code coverage unavailable — provider not installed | resolved | `@vitest/coverage-v8` added |
| F-020 | run-01 | regression | capability gap | medium | Integration + e2e skipped — DB not running | resolved | DB self-start; 163 integration + e2e canary |
| F-022 | run-01 | scenario-accuracy | code defect | medium | `applyTemplate` not atomic — partial entities/orphan dirs on failure | resolved | fixed (+test) |
| F-023 | run-01 | scenario-accuracy | code defect | medium | `rejectManifest` re-queues then re-dispatches (not held for review) | resolved | fixed → BLOCKED, no re-dispatch |
| F-024 | run-01 | scenario-accuracy | code defect | medium | `updateAgent` no handle-collision check → P2002 500; disk/DB drift | resolved | fixed (409 + pending-rename) |
| F-002 | run-01 | story-accuracy | code defect | low | Onboarding role mismatch (`OPERATOR` vs `ADMIN`) | resolved | fixed |
| F-003 | run-01 | story-accuracy | code defect | low | Bootstrap state two disagreeing sources | resolved | fixed |
| F-005 | run-01 | story-accuracy | code defect | low | Wiki repo name + mount-path UI/server disagree | resolved | fixed |
| F-006 | run-01 | story-accuracy | code defect | low | `UsersPage` Remove wired to nothing; `createUser` no UI path | resolved | fixed (admin `deleteUser` + cascade test) |
| F-012 | run-01 | scenario-accuracy | code defect | low | `deleteLibrarySkill` orphans on-disk skill folders | resolved | fixed |
| F-013 | run-01 | scenario-accuracy | code defect | low | Bare `Error` instead of `HttpError(401)` in several queries | resolved | fixed (see F-036/F-037 residual) |
| F-014 | run-01 | scenario-accuracy | dead-code | low | Redundant dashboard queries + dual activity sources | defer | QI-006 |
| F-015 | run-01 | scenario-accuracy | code defect | low | Hardcoded hex backgrounds in two layouts | resolved | fixed |
| F-016 | run-01 | scenario-accuracy | code defect | low | Silent error swallowing (`syncOrgToFile`, `TeamTab`) | resolved | fixed (now logs) |
| F-025 | run-01 | scenario-accuracy | code defect | low | Import agent reports no per-file breakdown | resolved | fixed |
| F-026 | run-01 | scenario-accuracy | code defect | low | Run-all dispatched count discarded by UI (ui+site) | resolved | fixed |
| F-027 | run-01 | scenario-accuracy | code defect | low | `getActivitySession` 404 renders generic empty state | resolved | fixed |
| F-028 | run-01 | scenario-accuracy | code defect | low | Dashboard `ActivityFeed` rows not clickable | defer | QI-007 |
| F-029 | run-01 | scenario-accuracy | code defect | low | `reviveTask` bare `Error`→500 (extends F-013) | resolved | fixed |
| F-030 | run-01 | scenario-accuracy | code defect | low | `ConnectMobilePage` hardcoded hex (extends F-015) | resolved | fixed |
| F-031 | run-01 | scenario-accuracy | code defect | low | `updateBoardTemplate` name-only edit doesn't update disk JSON | resolved | fixed |

### run-02 — re-validation (F-032…F-042)

Ordered by severity. **All findings decided — deferred to the register** (audit closed 2026-06-21): the 3 security items and the low residuals are recorded as `QI`s for a later development cycle; the doc drift as an `FI` for a later review of the QA framework. None fixed in-session (reviewer call: time-boxed close).

| ID | Run | Source | Type | Severity | Finding | Decision | Route / outcome |
|----|-----|--------|------|----------|---------|----------|-----------------|
| F-032 | run-02 | scenario-accuracy | code defect (security) | medium | `SITE_ADMIN_KEY` mints ADMIN whenever the env key matches — any time, not just bootstrap (`inviteService.ts:40-42,108-110`). **New** (run-01 miss). | defer | **QI-008** (needs ruling: break-glass vs bootstrap-only) |
| F-033 | run-02 | scenario-accuracy | code defect (security) | medium | `getAgentRuns` has **no auth guard** — returns all users' runs to any caller (`sessions/queries.ts:54`). Same class as F-021. **New** (run-01 miss). | defer | **QI-009** |
| F-034 | run-02 | scenario-accuracy | code defect (security) | medium | `getHqConnection` leaks pairing `nonce`+expiry to any authenticated user (`settings/queries.ts`); `getHqSyncStatus` leaks counts. **New** (run-01 miss). | defer | **QI-009** |
| F-035 | run-02 | scenario-accuracy | code defect | low | `createAgent` handle collision throws bare `Error`→500 while update returns 409 (`agentService.ts:57`). F-024 fixed update only. | defer | **QI-010** |
| F-036 | run-02 | scenario-accuracy | code defect | low | `getBoardTemplates`/`getBoardTemplate` throw bare `Error` not `HttpError(401)` (`library/queries.ts:8,13`). F-013 residual. | defer | **QI-010** |
| F-037 | run-02 | scenario-accuracy | code defect | low | `getProductBySlug`/`getProgramBySlug` throw custom `Error`→500 not 404. F-013 residual. | defer | **QI-010** |
| F-038 | run-02 | scenario-accuracy | code defect | low | Project "completed/done" metric drift — detail uses `executionState`, card/HQ use `status`. | defer | **QI-010** |
| F-039 | run-02 | scenario-accuracy | code defect | low | `updateLibrarySkill` silently drops on-disk content for PLATFORM skills. | defer | **QI-010** |
| F-040 | run-02 | scenario-accuracy | code defect | low | `importAgent` overwrites by matching handle, no confirmation/ownership (data-loss under QI-001). | defer | **QI-010** |
| F-041 | run-02 | scenario-coverage | coverage gap | low | 8 scenarios uncited (5 user-facing + 3 internal; SC-004 deferred); some may be untagged-but-tested. | defer | **QI-010** |
| F-042 | run-02 | regression | doc defect | low | `qa-strategy.md` Deviations still lists site as missing coverage tooling (now installed). | defer | **FI-003** |

## Pre-existing issues *(reconciled against the QA issues list of the time)*

| QI | State (run-02) | Note |
|---|---|---|
| QI-001 | Open | Re-confirmed pervasively (all write domains auth-only). Not escalated (single-user). F-033/F-034 adjacent. |
| QI-002 | Open | `getSystemStatus` still unauthenticated; F-033 is same no-auth class. |
| QI-003 | Open | `stopAllSessions` + stop/deleteTaskSession unscoped. |
| QI-004 | Open | GitHub PAT plaintext at rest (broadened by F-008). |
| QI-005 | Open | Rate limiter in-process Map, asymmetric counting — exact re-confirm. |
| QI-006 | Open | Dashboard ring buffer + redundant aggregate queries. |
| QI-007 | Open (unverifiable) | Dashboard activity-row clickability — UI-interaction detail, not exercised by the code pass. |

## Framework issues raised

Filed to the QA issues list of the time, under framework issues. Resolved only by a later review of the QA framework.

| FI | Run | Issue |
|---|---|---|
| FI-001 | run-02 | **Sweep the whole class, not the first instance.** An accuracy pass that finds one systemic defect (a server op with no auth guard) should enumerate every sibling. run-01 found F-021 and missed three siblings (F-032/F-033/F-034). Candidate: a grep recipe in `qa-strategy.md` or a rule in `qa-audit`. |
| FI-002 | run-02 | **Subagent report paths must be absolute.** A relative `{{DOMAIN_REPORT_PATH}}` let the domain-10 subagent write into the wrong folder (`10-templates.md`), which was not gitignored. Detected at collation; corrected. Fix: fill absolute paths in the template. |

## Exit criteria

| # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | Every in-scope check ran or accounted for | met | both runs: typecheck + unit + integration + e2e canary green |
| 2 | Every finding decided | met | run-01 all resolved; run-02 all deferred to the register (QI-008/009/010, FI-003) |
| 3 | Story coverage gaps decided | met | 100% (no gap) |
| 4 | Scenario coverage gaps decided | met | F-041 → QI-010 |
| 5 | Decided contract remedies applied | met | run-01 contract edits applied; no new contract edits in run-02 (contracts accurate) |

## Outstanding items

All carried into the committed registers (the audit is closed; nothing is tracked only here):

| Item | Carried to | For |
|---|---|---|
| F-032 `SITE_ADMIN_KEY` unconditional ADMIN | **QI-008** | a ruling (break-glass vs bootstrap-only), then fix |
| F-033 `getAgentRuns` no auth · F-034 HQ nonce/sync exposure | **QI-009** | guards before multi-user / public exposure |
| F-035–F-041 low code-quality residuals + citation stragglers | **QI-010** | a maintenance pass |
| F-042 stale `qa-strategy.md` coverage note (+ downstream-routing/AS-001 drift) | **FI-003** | a later QA framework review |
| FI-001 sweep-the-class · FI-002 absolute subagent paths | **FI-001/FI-002** | a later QA framework review |

## Verdict

**[x] Accepted with conditions — audit closed 2026-06-21.** run-01 remediation **accepted** (31 findings resolved, no regressions, coverage established). run-02 re-validation confirmed the work held — no false positives, deferrals stable, coverage maintained — and surfaced 11, all **decided and carried to the register**: 3 security → QI-008/QI-009, 7 low → QI-010, 1 doc + framework drift → FI-003 (with FI-001/FI-002). Nothing remains open only in this report.
**[ ] Accepted** · **[ ] Not accepted**
