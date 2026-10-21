---
created: 2026-09-28
description: Building person-scoped execution — containers keyed on boundary × runner with private harness homes, parallel runs in a shared project, visibility of what is running, closed conversations, and cleanup when a person leaves — as a shared contract first, then six lanes built in parallel and proved once together.
---

# Implementation Plan · Person-scoped Execution

> **Closed 2026-09-28; this plan is a record.** Merged to `main` as `a3366ec`. It is not edited again.

**Design spec:** [`spec.md`](spec.md) · **Issues:** person-scoped execution, as widened by the owner's comment of 2026-09-27, and the runner claim, which it absorbs

## Goal

In a project shared by several people, one person's harness state — their transcripts and the prompts
that carry their memory — cannot be read by another member's runs, while everyone in the project can
still work in it at the same time and see what is running.

**In scope:** everything in the spec's section 5 *In scope* list — the runner claim, the container key,
harness homes and id-based container paths (§1); the per-session queue, the wait-or-interrupt setting
and container sizing (§2); the running-now view and `list_active_runs` (§3); the pre-launch existence
check, `CLOSED`, the closed-conversation page, sessions pinned to their runtime, and membership-end
cleanup including instructions held for an offline site (§4); the protocol bump; the OpenCode spike;
and the decision records §5 lists.

**Out of scope:**

| What | Why it is out |
|---|---|
| Richer visibility — files a run touches, subagent trees, task working files | The owner's comment on the issue asks for mock-ups first; nothing here depends on it |
| Lifting one task per agent per project; heartbeat containers | The heartbeat rework changes task claiming and gives heartbeats a boundary; doing either here splits one decision across two milestones |
| How long records are kept after someone leaves | Its own issue |
| Recording several locations per session | Its own issue |
| Rebuilding a harness's context from our record | Rejected for now in spec §4; revisited only if closed conversations prove a nuisance |
| Git's lock files in shared working trees | Its own issue; the spec accepts conflicting edits and answers them with visibility |
| The native runtime's directory lock (`workspaceLockService.ts`) | It serialises only the native runtime's own file tools, and adr-0073 replaces that runtime with OpenCode. Removing it here is work on code that is about to be deleted |
| Building OpenCode | The model vendor independence unit, paused behind this unit; only the throwaway spike is here |

## Approach

**The shared contract lands first, on the base branch, before any lane starts.** Every lane trusts the
same few things: the runner claim in hq's signed capability, the container key that carries it, the
session's new status and runtime fields, the runtime interface's new existence check, and the
new control-channel messages — membership ending, and the read of a boundary's active runs. They are written once, by one agent, and merged to the
base branch — `feature/person-scoped-execution` — so each lane branches from a base that already
compiles against them. The runner claim is the security decision the whole design rests on (spec §1,
*Where the runner comes from*), so it is not left to whichever lane reaches it first.

**Every schema change is in the contract.** Both apps' `schema.prisma` gain fields in this unit — the
`CLOSED` status and its reason, the session's runtime, the wait-or-interrupt setting, and hq's store of
instructions held for an offline site. Migrations generated on parallel branches collide in their
ordering and in the generated client, so all of them are made in the contract phase, one migration per
app. All are additive; none needs data carried forward (pre-release, no migration of existing rows).

**The protocol takes a major bump, to 13.0.** The runner claim is a required field whose absence the
site must refuse — a site that accepted a capability without it would have to guess whose home to
mount. Under adr-0046 a required field added is a breaking change, so the handshake refuses a peer on
12.x rather than half-working with it.

**Then six lanes run in parallel, each on its own branch and worktree, each worked by a background
agent on the model the spec's table gives it**, with the lead as the bridge between them and the owner.
The OpenCode spike and the decision records are drafted beside the contract, from day one, since neither
needs code. Lane authors run typecheck and unit tests only, in their own worktree, with one test worker
(`VITEST_MAX_WORKERS=1`); integration, cross-app and smoke tests run once, by the lead, over all lanes
combined, because the apps use fixed ports and share one test database.

**Lanes are drawn by file, and where two meet, by block.** The spec left open whether lanes 1 and 3 could
run together, since both touch the site's launch code. Reading `runLaunch.ts`, `AgentEngine.ts` and
`ClaudeSDKRuntime.ts` shows the overlap is one file, `runLaunch.ts`, in two separate blocks:

- **Lane 1 (containers and homes)** owns the container key, container naming, the home layout and
  binding, mounts and container paths — `containerTypes.ts`'s implementation beyond the contract,
  `boundaryClaudeHome.ts`, `containerPrep.ts`, `locationResolver.ts`, `AgentContainerManager.ts`,
  `containerLabels.ts`, `agentDiskPaths.ts` — and, in `runLaunch.ts`, the block that resolves the
  container key and the home (steps 3d-1 to 3e).
- **Lane 3 (closing conversations)** owns the runtimes (`ClaudeSDKRuntime.ts`, `NativeRuntime.ts`), the
  runtime-selection lines in `runLaunch.ts` (the credential gate at 3a-1 and step 4, which move from the
  agent's runtime to the session's), and a new pre-launch check module that `runLaunch.ts` calls once
  the home and working directory are resolved. The check takes the home and working directory as
  inputs, so it does not depend on how lane 1 computes them.
- **Lane 2 (running in parallel)** owns `AgentEngine.ts`, `runQueueKey.ts`, `runCleanup.ts` and
  `agentCredentials.ts`. It keeps out of `boundaryClaudeHome.ts`, which lane 1 rewrites: the
  last-run-out rule for the credential (spec §2) is kept beside the existing credential hold in
  `agentCredentials.ts` and applied from the cleanup path.
- **Lanes 4, 5 and 6** are mostly on hq and touch none of the above. Lane 5's site half — stopping runs,
  removing the container and the home — calls lane 1's functions, so it is written against lane 1's
  names as the contract fixes them and merged after lane 1.

So lanes 1 and 3 run in parallel rather than in sequence, and are merged back to back — lane 1 first, the
lead reconciling `runLaunch.ts` when lane 3 is rebased onto it. `main.wasp` is the other likely shared
file (lanes 4, 5 and 6 each declare operations); those lanes say so in their reports and are reconciled
the same way.

**Merging back:** each lane is rebased onto the base branch's current head, its typecheck and unit tests
re-run, then merged with `--no-ff`, one lane at a time, so the base reads as one ordered line of grouped
blocks. Order: 1, 3, 2, 6, 4, then lanes 5 and 7, which are built on the merged base — the lanes other lanes' code calls go first. The base merges to `main`
once, after the full regression has passed on it and the owner says to.

**The end-to-end proof is by hand, in the running app.** The objective is about what an agent can read,
which unit tests prove only piece by piece. With the lanes combined, two people in one project each run
an agent that tries to read the other's harness state, and the other behaviours the spec promises are
walked the same way.

## Decision records

| | Records |
|---|---|
| **Depends on** | ADR-0041 (chat session privacy), ADR-0042 (hq is the org's own), ADR-0046 (protocol versioning), ADR-0050 (dispatch and status cross the control channel), ADR-0058 (memory of a person), ADR-0060 (authority comes from the boundary), ADR-0072 (an agent is defined once in hq), ADR-0073 (Claude keeps its own runtime; OpenCode replaces NativeRuntime) — all Accepted |
| **Implements** | Five new records, written in 1.9: ADR-0074 (a container is keyed on its boundary and its runner), ADR-0075 (work in a boundary runs in parallel; only a conversation is ordered), ADR-0076 (a conversation whose harness state is gone is closed, never silently restarted). ADR-0077 (within a boundary, a chat's existence is visible; its content is not — supersedes one section of ADR-0041) and ADR-0078 (a conversation keeps the runtime it started with — supersedes one section of ADR-0073). ADR-0079, written in 2.36 (access to a boundary is access to all of it; a workspace's settings are a guardrail for runs working in it). ADR-0080, written at close (a run never carries a person's own connected accounts) |
| **Revisits** | ADR-0041 and ADR-0073 — one section of each superseded, by ADR-0077 and ADR-0078; both records stay Accepted. ADR-0057 (a container is bound to one storage location) — superseded by ADR-0074: one boundary per container stands, the runner joins the key. ADR-0060 — expected to stand unchanged (spec §1); checked at close, as the milestone's first objective asks |

## Key decisions

| Decision | Why |
|---|---|
| The shared contract lands on the base before any lane branches | Every lane builds on the runner claim, the key and session types and the new messages; a lane that defined its own copy would be reconciled at merge, where a mismatch in a security claim is easiest to miss |
| Every schema change and both migrations are in the contract | Migrations made on parallel branches collide in order and in the generated client; one migration per app, made once, cannot |
| Protocol 13.0, a major bump | The runner claim is required and the site refuses its absence — a required field added is breaking under adr-0046 |
| Lanes 1 and 3 run in parallel, split by file and by block in `runLaunch.ts`, merged back to back | The overlap is two separate blocks of one file; sequencing them would cost a lane's worth of days for a reconciliation the lead can do in one sitting |
| The existence check takes the home and working directory as inputs | It lets lane 3 be written without waiting for how lane 1 computes them, and keeps "does this session exist?" a question each runtime answers the same way |
| A run's credential leaves the home only when the last run using it ends | Parallel runs share a home; today's per-run removal would pull the credential from under the runs still going. Found reading the code for this plan; the spec's §2 now says so |
| What is running is asked of the site each time, through a read that returns ids only; hq resolves the names | The site is the only party that knows a run is still going, so its answer cannot drift the way a list hq kept from status frames could; it holds only hq-issued ids, and ids are all the read needs to carry (spec §3). Chosen by the owner over hq's own list |
| Merge order 1, 3, 2, 6, 4, then lane 5 and lane 7 | Lanes whose code others call land first, so each later rebase meets the code it calls rather than a stub |
| The end-to-end check is walked by hand in the running app | The objective is about what an agent can read across containers; unit tests prove the pieces, not the whole |
| Each agent's model is the one spec §5's table gives it, passed explicitly | Opus where the work is a security boundary, a race or wording later work must honour; Sonnet where it is bounded. An agent given no model runs on the lead's |
| Not: lanes 1 and 3 in sequence | The overlap does not justify it (above) |
| Not: each lane makes its own migration | See the contract row; the cost of reconciling migrations is higher than writing them together up front |
| Not: a minor protocol bump with the site tolerating a missing runner | A site that tolerates it has to choose whose home to mount without being told — the exact decision the claim exists to take away from it |
| Not: remove the native runtime's directory lock here | It is scheduled for deletion with the native runtime (adr-0073); see *Out of scope* |
| Not: a pass for each lane through the full suite | Fixed ports and one shared test database make concurrent runs collide; the full suite runs once, over the combination |

## Work breakdown

**This is the source of truth for progress across the whole unit.** Tick a task here when it is done.

Four phases. The seams: the contract every lane builds on, with the records and the spike beside it;
the lanes, which are independent of one another once the contract exists; combining and proving them,
which needs every lane; and closing, which needs the proof.

### Phase 1 — The shared contract, the records and the spike
**Delivers:** the contract merged on the base branch with typecheck and unit tests passing, both
migrations made, the decision records drafted for the owner, and the spike's findings written down.
**Starts when:** —
**Execution plan:** none — spec §1 and §5 fix what the contract holds, the records are drafted from the
spec's own section 5, and a spike's output is unknown by definition.

- [x] 1.1 The runner claim in the capability: core's claim type, hq minting it (the person for a chat, the project for a task; a heartbeat keeps its own key until the heartbeat rework), the site refusing a capability without it
- [x] 1.2 Protocol version to 13.0
- [x] 1.3 The container key carries the runner; the key and session types every lane builds on
- [x] 1.4 The runtime interface gains "does this session still exist?", with a stub in each runtime
- [x] 1.5 Site schema and migration: `CLOSED` with its reason; the session's runtime
- [x] 1.6 hq schema and migration: the same on hq's session copy; the per-user wait-or-interrupt setting; held instructions for an offline site
- [x] 1.7 Control-channel messages for membership ending — left a project, left the organisation, project deleted — and the site's acknowledgement
- [x] 1.8 The active-runs read: for a boundary, each active run's id, session, agent, task and start time — ids only, no content
- [x] 1.9 Write ADR-0074 to ADR-0078, accepted by the owner
- [x] 1.10 OpenCode spike (spec §5): state in a per-person home, resume across a new container at the same id paths, `GET /session/:id` as the existence check, and where Claude files a session

### Phase 2 — The lanes
**Delivers:** each lane done on its own branch, with typecheck and unit tests passing in its worktree
and its report written.
**Starts when:** 1.1–1.8 are merged on the base. Task 2.12 also waits on 1.10, which says where Claude
files a session.
**Execution plan:** none — each lane builds one section of the spec, which says what it must do and why;
the boundaries between lanes are drawn in *Approach*, and the brief each agent is given carries them and
the working rules.

#### Lane 1 — Containers and homes (spec §1) · Opus

- [x] 2.1 Container key and name from boundary × runner; a person's own storage keeps today's single container
- [x] 2.2 Harness homes at `homes/users/<person>/personal/`, `homes/users/<person>/<project>/` and `homes/projects/<project>/`, outside storage
- [x] 2.3 Settle against the agent image whether the whole home or each runtime's folder is bound under `/home/appuser/`
- [x] 2.4 Container paths mirror the site's disk by id, and the prompt names each mounted folder's current name
- [x] 2.5 Tests: two members' containers in one project mount the same storage and neither home of the other; a renamed project keeps every container path

#### Lane 2 — Running in parallel (spec §2) · Opus

- [x] 2.6 The run queue is keyed on the session
- [x] 2.7 A run's credential leaves the home only when the last run using it ends, including a refreshed subscription token being reported back
- [x] 2.8 Container sizing for several harness processes at once: the per-container defaults and the site-wide run cap, which becomes configurable
- [x] 2.9 Tests: two conversations in one container run at once; turns of one conversation stay in order; the reset between runs waits for the last run

#### Lane 3 — Closing conversations (spec §4) · Opus

- [x] 2.10 A session records its runtime when created, on the site and in hq's copy; a run launches in the session's runtime, not the agent's current one
- [x] 2.11 The pre-launch check, called before resuming a conversation, acting the same way whichever runtime answers
- [x] 2.12 Claude's answer: whether the session's file is in the runner's home under the run's working directory
- [x] 2.13 The native runtime's answer, from wherever it keeps its conversation state
- [x] 2.14 A missing session closes the conversation with its reason, fails the run with a message the person can read, and replicates the status to hq
- [x] 2.15 Remove the silent fresh restart — `isStaleSessionError`'s retry and the `staleSession` flag
- [x] 2.16 hq's closed conversation: the full history, the notice, no message box, and *Start a new conversation* with the same agent
- [x] 2.17 Tests: deleted harness state closes the conversation; a failure with the state present — such as a misconfigured MCP server — does not

#### Lane 4 — Seeing what's running (spec §3) · Sonnet

- [x] 2.18 The site answers the active-runs read from its own rows, and hq resolves the ids to names from its records
- [x] 2.19 The running-now view on the project: agent, who or what started it, where, since when, and a flag when two runs share a workspace
- [x] 2.20 The `list_active_runs` platform tool, served by hq and forwarded by the site as `create_task` is, scoped to the run's boundary
- [x] 2.21 Tests: the scope follows the boundary; nothing of a run's content is included; an unreachable site gives the explicit error

#### Lane 5 — When membership ends (spec §4) · Opus

- [x] 2.22 hq sends the instruction when a member is removed from a project, a person from the organisation, or a project is deleted
- [x] 2.23 hq holds an instruction for a site that is offline and sends it when the site reconnects
- [x] 2.24 The site stops the person's runs there, removes the container, deletes the home, closes their conversations, and acknowledges
- [x] 2.25 Tests: each of the three cases; replay after a reconnect; the same instruction twice does no harm; the member folder and our record are untouched

#### Lane 7 — One mount per boundary, workspace settings as a guardrail (spec §1) · Opus

Added 2026-09-28, after the lanes above were built; see Deviations. Cut from the base once lanes 1, 3, 2, 6 and 4 are merged.

- [x] 2.29 A container mounts its boundary's folder once; per-workspace mounts, the mountable-workspace rule and the mount-set rebuild path go
- [x] 2.30 Remove the workspace access policy from hq: the record, its service, the toggle on the workspace page, and the run refusal
- [x] 2.31 Remove the policy's claims from the capability (`workspaceBlocked`, `blockedWorkspaceIds`, `mountableWorkspaceIds`) and the site's checks of them
- [x] 2.32 Drop the `WorkspaceAccessPolicy` table — a destructive migration, run with the owner's say-so
- [x] 2.33 A workspace's allowed tools apply only to runs working in that workspace, narrowing the agent's permissions and the project's override
- [x] 2.34 Remove story US-152 and its scenarios from the QA contract, and restate the workspace-settings story as a guardrail
- [x] 2.35 Tests: a workspace created while a container runs appears in it; one workspace's settings do not narrow a run working elsewhere; no rebuild when workspaces change
- [x] 2.36 Write ADR-0079

#### Lane 6 — Wait or interrupt (spec §2) · Sonnet

- [x] 2.26 The per-user setting on the person's settings page, wait by default
- [x] 2.27 With interrupt, a message into a busy conversation stops the running turn, records it as interrupted, and starts the new one
- [x] 2.28 Tests: both settings, and interrupt with no turn running

### Phase 3 — Combine and prove
**Delivers:** every lane merged on the base, the full regression passing on it, and the spec's promises
walked by hand in the running app.
**Starts when:** the Phase 2 lanes are done. Each is merged as it finishes, in the order *Approach* gives.
**Execution plan:** none — the regression is a fixed list of commands, and what a failure needs is not
known in advance.

- [x] 3.1 Rebase and merge each lane onto the base, running its typecheck and unit tests after each
- [x] 3.2 The full regression on the combined base: core, hq and site unit and integration tests, typecheck, the bundle checks and cross-app
- [x] 3.3 Fix what the regression finds, on the base — nothing to fix: every step passed on the first run
- [x] 3.4 Walk it in the running app: two people in one project, each agent unable to read the other's harness state; two chats running at once; a project renamed mid-conversation; a harness home deleted, closing the conversation; a member removed, their home gone
- [x] 3.5 Turn off the claude.ai connectors of the account behind a subscription for every run — found in 3.4
- [x] 3.6 A development switch to use a shared subscription with several people, so the walk-through could run on a subscription

### Phase 4 — Close
**Delivers:** the documents describing the present match the system, each objective verified with
evidence, and the unit closed.
**Starts when:** Phase 3 is done.
**Execution plan:** none — closing the unit is its own skill's checklist.

- [x] 4.1 Update the architecture and concept documents that describe containers, homes and session status
- [x] 4.2 Verify each of the milestone's objectives against the system and tick it on the roadmap, with how and when
- [x] 4.3 Record in the paused model-vendor-independence unit what the spike found and what OpenCode is now built on
- [x] 4.4 Close the runner claim's issue and the person-scoped execution issue
- [x] 4.5 Close the unit: notes on the records it implemented, ADR-0057 superseded

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 3 | Tasks 3.5 and 3.6 added: claude.ai connectors turned off for every run; a development switch for a shared subscription. Issues raised from the walk-through: a shared subscription's token is never refreshed in hq, and connectors a boundary owns | The walk-through found a project member's container connecting to the subscription holder's connector; the owner has no API key, so the walk-through needed the subscription with two people |
| 2 | Lane 7 added: the workspace access policy removed, each boundary mounted once, workspace settings applied only to runs working in that workspace; sandboxed workspaces queued as their own issue | Per-workspace mounts failed a person's parallel runs whenever a workspace was created; they existed only to enforce the policy, whose stated case personal storage already covers. The owner chose two layers: the project isolated by its container, a workspace guarded by the tool gate. The sandbox spike found Claude's sandbox runs in our container only with the container's protections loosened |
| 2 | Lane 5 split: its hq half built with the other lanes, its site half after lane 1 merged | The site half is built on lane 1's home and container functions |
| 1 | The two planned revisions of ADR-0041 and ADR-0073 became records of their own, ADR-0077 and ADR-0078 | The decision-record rules: a record is annotated, never revised; one decision inside an earlier record is superseded by its own record |
