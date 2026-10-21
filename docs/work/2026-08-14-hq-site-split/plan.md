---
created: 2026-08-14
updated: 2026-09-26
description: Record of the hq/site split's plans — what each delivered, where it merged, every change of direction, and where each leftover went. Frozen when the split's unit closed.
---

# HQ/Site Split — Implementation Plan

> **Closed 2026-09-26: this plan is a record.** It states what merged and how the work
> deviated from what was planned, and it is not edited again. The split's unit was closed
> together with its successor, [`../2026-09-15-hq-site-split-close-out/`](../2026-09-15-hq-site-split-close-out/plan.md),
> which took over everything the split left unfinished.
>
> **Where the leftovers went.** Every non-critical item the split left is either closed by
> the close-out unit or raised as its own issue on the repository; the last section says
> which, item by item. The close-out unit's register
> ([`issues.md`](../2026-09-15-hq-site-split-close-out/issues.md)) holds how each ended.
>
> **Tasks.** This plan never carried a task breakdown: task-level execution plans (the
> step-by-step documents a developer or subagent runs) were ephemeral, gitignored scratch,
> superseded by the code they produced. The acceptance criteria each plan delivered are
> stated in its entry under *Completed plans*, and each entry states its deviations, or that
> it had none.
>
> **What this document is not:** it is not the design. The design — how the two apps work,
> the token model, the authorization model, storage, transport — lives in the companion
> spec, [`spec.md`](spec.md), which records intent at the time and is not updated to match
> what was built.

---

## The plans at a glance

| Plan | Delivers | Status |
|---|---|---|
| 1 | Remove the retired delta-sync machinery | **Done** — merged to `main` in `2a99bf8` |
| 2 | Rename `site` → `hq`; create the new `site` module | **Done** — merged to `main` in `2a99bf8` |
| 3 | Identity & authorization: hq-minted tokens, local verification | **Done** — merged to `main` as `11fc624` |
| 4 | Execution Site registry, registration, placement | **Done** — merged to `main` as `c07c9fe` |
| 5a | Control channel: hq accepts a site's outbound socket | **Done** — merged to `main` in `b709254` |
| 5b-1 | Authorization model: borrowed authority, tool intersection, run token | **Done** — merged to `main` in `b709254` |
| 5b-2 | Site → hq data path: the control-plane API | **Done** — merged to `main` in `b709254` |
| 5c | Move workspace storage; site anchors | **Done** — merged to `main` in `b709254` |
| 5d-1 | Runtime in-place hardening: session containers, memory partition, path remap, read-only mounts | **Done** — merged to `main` in `b709254` |
| 5d-2 | The topology cut: move the runtime and its four models, dispatch over the channel | **Done** — merged to `main` in `b709254` |
| 5e | Move sessions, runs, transcripts | **Absorbed into 5d-2** (decision D1) — the model move landed there; only the several-locations session field remained, and it went to the close-out unit as an issue |
| 5f | Cross-app integration tier & relay decision (was: chat and voice relay) | **Done** — merged to `main` in `b709254` |

Plans 1 and 2 merged to `main` in `2a99bf8`, plan 3 in `11fc624` and plan 4 in `c07c9fe`,
each on its own branch. **Plans 5a to 5f did not merge one per plan as intended: they landed
together on one branch, `feature/execution-runtime-extraction`, and merged to `main` with
`--no-ff` as `b709254` on 2026-08-18** — the pattern the close-out unit later named as this
unit's failure and avoided.

### Sequencing

```
1 ─→ 2 ─┬─→ 3 ─┐
        └─→ 4 ─┴─→ 5a ─┬─→ 5c ─→ 5d-1 ─→ 5d-2 ─→ 5f
                5b-1 ─→ 5b-2 ─┘
```

Plans 3 and 4 were independent and could have run in parallel. 5a and the 5b pair are
independent of each other; everything from 5c onward is strictly ordered. 5b-2 must
complete before 5d, because the runtime cannot move until it can obtain control-plane data
over the network. **5e no longer appears in the chain** — its work landed inside 5d-2
(decision D1, below); what remained genuinely 5e's moved to the unassigned list.

---

## Changes of direction

The durable record of every reversal and re-scoping, so none is re-litigated and none is
invisible to a reader who arrives late. Newest last.

1. **2026-08-09 → 08-11 — which app moves.** The split's direction reversed three times.
   Settled by measurement, not argument: `site` (the original full app) is **renamed to
   `hq`** keeping its history, schema and all UI, and a new small `site` module receives
   only the execution layer — 88 files / ~8,000 lines move, instead of ~200 files /
   ~20,300 lines under the opposite direction, and the platform stays working at every
   intermediate step. The expensive work (rewiring the execution layer's direct database
   reads into capabilities and network calls) is identical either way.

2. **2026-08-11 — Plan 5 is six plans, not one.** The original Plan 5 bundled the
   runtime extraction, two transport mechanisms, and a two-way schema cutover. Split into
   5a–5f (control channel; data path; storage move; runtime move; session move; relay),
   each planned separately when its turn comes.

3. **2026-08-11 — `AgentSession` moves to site, with a full copy kept on hq.** ADR-0041
   originally kept the session row on hq for chat privacy. Keeping it there would have
   broken the delete cascades to runs and transcripts — silently orphaning bulk data on
   site. The session moves instead; hq keeps a whole-row copy with **exactly one side
   writing each field**, which is what keeps the copy from becoming the deleted delta-sync
   system. ADR-0041's conclusion (hq enforces chat privacy from its own data) survives;
   its mechanism changed.

4. **2026-08-12 — the site anchors reversed.** An `Agent` was "pure definition, no site";
   in fact it owns disk state it writes itself, so **`Agent` gains a required home site**
   (ADR-0047). A `User` had a chosen home site; in fact a person's files home exists on
   every site they work on, so **`UserSettings.homeSiteId` is removed**. `Workspace`
   gains its own `siteId`. The resulting rule: *an agent must be on the site holding
   every location the run works in.*

5. **2026-08-12 — what a run can physically reach was designed** (it never had been):
   structural boundaries over behavioural ones. An agent's memory of a person becomes a
   bind mount partitioned by invoker (ADR-0048), which requires containers keyed by
   session rather than by agent (ADR-0049).

6. **2026-08-12/13 — authorization settled, and grew 5b.** Two decisions: **an agent
   never holds authority of its own** (chat runs borrow the invoker's role; unattended
   runs carry none and are refused the ten org-escaping tools), and **a run's effective
   toolset is the intersection of every boundary's allowed-tools list** — agent,
   principal, each mounted workspace — in the one existing permission vocabulary.
   Both became preconditions for 5b's API, which made 5b too large for one plan.

7. **2026-08-13 — 5b split into 5b-1 and 5b-2.** 5b-1 is the authorization model
   (shipped); 5b-2 is the data path itself (next). The split exists because the
   authorization work turned out to be a full plan's worth — thirteen tasks plus four
   unplanned security fixes — and the API should not be built on an unsettled model.

8. **2026-08-13 — as built, the container carries a run token, not the capability.**
   Stronger than the spec asked: the least-trusted process holds an opaque token that
   resolves server-side to the run's live, renewing capability, so it never holds a real
   credential at all.

9. **2026-08-15 — 5d split at the topology line, as predicted.** Sized at ~30 tasks as
   one plan. **5d-1** is everything that makes the runtime site-shaped while it still
   runs inside hq — session containers, the memory partition, the `/workspace` remap,
   read-only mounts, the file splits whose import graph becomes the move audit.
   **5d-2** is the topology cut — the physical move, channel dispatch, severing
   control-plane Prisma via the data path, streaming, heartbeat pulses, audience pin.
   The cut is there because every 5d-1 item is testable against the running system with
   no throwaway work, while 5d-2's data seam should be designed against the real wire
   (the 5c lesson). Open question deliberately deferred to 5d-2's writing: whether the
   four runtime models move with the code (pulling 5e's move forward) — the runtime
   writes them on nearly every line, so code and models likely move together.

10. **2026-08-16 — 5d-2 absorbed 5e's model move, decided by measurement (D1).** The
    runtime writes the four runtime models (`AgentSession`, `AgentRun`,
    `TranscriptEntry`, `ToolCallLog`) at 36 call sites against 28 control-plane call
    sites — of which 14 are `TaskRunner`'s own `Task` state machine, which stays on hq
    regardless of where the models live. Building a site→hq network **write** path for
    the models, sized only to be deleted the moment 5e's turn came, was refused; the
    models moved in the same cut as the code. What genuinely remained 5e's —
    `AgentSession` carrying several mounted locations instead of one primary workspace
    triple — is a feature change, not part of the topology cut, and moves to "Work not
    assigned to any plan" below.

---

11. **2026-08-17 — the relay question settled as "no generic relay" (ADR-0051).** 5f's
    open question — whether the `run.stream` re-emit should generalize into a mechanism
    for arbitrary live site data — was answered no. On-demand reads already have their
    general mechanism (channel request/response, spec §7.3); live push stays a closed
    per-event vocabulary where each event kind gets its own validated hq-side handler,
    because the run-specific machinery (terminal latch, session-patch allowlist,
    synthesized `agentRunStatus`) is load-bearing and a generic passthrough would
    destroy it. Also decided: no GitHub Actions workflow ships with the tier — the repo
    has never been pushed, so a workflow file would be unverifiable; the tier being one
    self-provisioning command is the CI-readiness, and the workflow itself joins the
    deployment-shape plan.

## Completed plans

Feature-level record of what each plan delivered. The design details live in the spec;
the decisions live in `docs/adr/`.

### Plan 1 — Remove the retired delta-sync — done

The old Site↔HQ index-mirroring machinery (delta messages, tombstones, sync cursors,
mirror-id fields) existed for a data-sovereignty model ADR-0042 retired. Removed outright;
nothing replaces it, because hq now holds its slice of the real data directly.

**Deviations.** None. The direction of the whole split had reversed three times before this plan was written (Changes of direction, entry 1); the plan as executed is the one that survived.

### Plan 2 — Rename, and create the `site` module — done

- 512 files moved via `git mv` with history preserved; behaviour-verified (`c326c9e`).
- The new `site` module was born with the outbound HQ-link transport rather than empty,
  because that transport is genuinely self-contained and Plan 4's registration needed it.
- `site` has no Wasp `auth:` block by design — it holds no identity store.

**Deviations.** None after the plan began. Which app moves was settled beforehand, by measurement (Changes of direction, entry 1).

### Plan 3 — Identity & authorization — done

- hq mints RS256-signed **identity tokens** (users) and per-run **capabilities** (agent
  runs), publishes a JWKS; site verifies locally with no round trip.
- **`WorkspaceAccessPolicy`**: a policy record on a workspace blocks all agent access to
  it, checked before the agent's own permissions, not bypassed by `unrestricted`.
- Decisions: token lifetimes (ADR-0040 — identity 60 min, capability 15 min renewed at
  80%); chat privacy (ADR-0041 — chat is owner-only for every role, admins included).

**Deviations.** None.

### Plan 4 — Execution Site registry & placement — done

- hq holds an `ExecutionSite` registry; an admin issues a one-time registration token; a
  fresh site redeems it and receives a persistent **machine credential**. Both secrets
  stored hashed, shown once.
- Projects are created on an explicitly chosen site. Registration UX is token-upfront
  (ADR-0044) — the browser-approval variant was deleted as incompatible with "a site
  never accepts inbound connections."
- Both token types gained an audience claim naming their target site.

**Deviations.** None. The token-upfront registration it built (ADR-0044) was later replaced by registration with the installer's and an admin's consent, in the close-out unit (ADR-0064); that is a later decision, not a deviation from this plan.

### Plan 5a — The control channel — done, merged in `b709254`

- hq accepts a site's outbound WebSocket at `/hq-link`, authenticates the machine
  credential, enforces the protocol version, tracks `ONLINE`/`OFFLINE`/`lastSeenAt`, and
  can query a connected site over the same socket (request/response correlation added to
  the envelope). Decision record: ADR-0045.
- Fixed a Plan 4 defect: registration previously returned a socket URL with no path, so
  every registered site would have failed to connect with nothing in its log to say why.
- Still owed from its acceptance criteria: the **cross-app integration tier** (both real
  halves running together) does not exist yet; the seam is covered by each half's own
  suite plus a manual walkthrough. Carried forward — owed before the split is called done.

**Deviations.** None. The cross-app integration tier it left owed was delivered by plan 5f.

### Plan 5b-1 — The authorization model — done, merged in `b709254`

The design is the spec's authorization section; this plan built it.

- **Capabilities carry authority:** chat-minted capabilities carry the invoking person's
  role; task and heartbeat mints carry none — and the ten org-escaping MCP tools refuse
  a role-less caller. Role floors also gate the three browser actions that create
  projects or apply workforce templates.
- **The tool intersection:** `Workspace.allowedTools` (one additive migration) is
  intersected with the agent's list at capability mint; a workspace's list caps the whole
  session while mounted.
- **The credential swap:** agent containers no longer receive the permanent site-wide MCP
  key. They hold an opaque, run-scoped token that resolves server-side to the live
  capability; the MCP handler and git-credential endpoint authorize from verified claims,
  and the self-asserted agent-handle header is ignored on that path.
- **Defect fixes beyond the plan**, found by per-task review: voice-socket session
  hijack, manifest approval without ownership, session location validation (a fabricated
  workspace id could evade the workspace cap), an onboarding regression from the tool
  regrouping, and a seam where a chat turn inside a task session computed its mint and
  its mounts from different task ids.
- Verified: 1042 unit tests, 178 integration tests, clean `wasp build`, QA
  requirement→scenario→test chain whole (US-157, SC-298..305 in `docs/qa/`).
- **Known-deferred, explicit:** unrestricted agents escape the intersection for runtime
  built-in tools until 5d's read-only mounts; `Workspace.allowedTools` has no editing UI
  yet *(closed by 5b-2)*; capability verification runs without an audience pin until 5d
  (documented in code; the data and renewal endpoints pin it since 5b-2 — the MCP
  handler's interim remains); browser role floors lag MCP floors *(closed by 5b-2;
  QI-001 re-scored to medium)*.

**Deviations.** The plan grew: the authorization work turned out to be a full plan's worth — thirteen tasks and four unplanned security fixes — so 5b was split and the data path became 5b-2 (Changes of direction, entry 7). The container carries an opaque run token rather than the capability itself, stronger than the spec asked (entry 8).

### Plan 5b-2 — The site → hq data path — done, merged in `b709254`

The execution layer stops reaching into hq's database directly.

- **Control-plane service layer:** all 34 data-touching MCP tool operations moved into
  `hq/src/server/controlplane/` — one registry keyed by tool name, authorization enforced
  inside the operations rather than the transport wiring. `mcpServer.ts` shrank from 916
  to ~210 lines of schema-and-wiring.
- **`POST /api/v1/data`:** authenticated by the site's machine credential plus a
  capability whose audience is pinned to that site (no interim here — the caller names
  itself), with every operation's arguments schema-validated on both transports.
  Integration-proven against a real database. `site` carries a typed client, deliberately
  unconsumed until 5d.
- **Confinement and identity:** unattended runs are confined to their capability's
  project across the whole tool surface (nineteen tools previously accepted bare ids),
  and the acting agent always comes from verified claims, never a tool argument.
- **Renewal hardened:** the renewal endpoint authenticates the calling site, pins the
  audience, and refuses a renewal whose re-resolved site differs from the caller;
  identity tokens for a missing settings row default to VIEWER, not OPERATOR.
- **Browser floor parity:** seventeen browser actions carry the same role floors as
  their MCP twins through one shared helper; the §H2 inversion is closed and QI-001
  re-scored high → medium (remaining exposure is ownership gates, a different class).
- **Workspace tool caps configurable:** `Workspace.allowedTools` gained its
  OPERATOR-gated, catalogue-validated write path (a mistyped or legacy-shaped value can
  no longer silently lock out every tool) and a workspace-page editor whose defaults
  keep the always-injected task tools.
- **Review-caught beyond the plan:** a VIEWER chat floor lost in porting, a
  cross-project board hole in `create_task`, a mass-assignment hole on the new HTTP
  path (nested Prisma relation writes), prototype-chain operation names, and raw
  database error text leaking through refusals — all fixed and regression-tested.
- Verified at completion: 1265 unit tests, 182 integration tests, clean builds in both
  apps, QA chain whole for US-158 / SC-306..313.

**Deviations.** None beyond the split from 5b-1 (Changes of direction, entry 7). The defects review caught along the way were fixed inside the plan.

### Plan 5c — Workspace storage move & site anchors — done, merged in `b709254`

The first models crossed the database boundary — deliberately the smallest pair, as the
cheap test of the whole cross-database pattern. The pattern held.

- **The anchors:** `Workspace.siteId` and `Agent.homeSiteId` as real foreign keys
  (optional on hq while it still held the rows; required from birth in site's schema),
  set at creation, backfilled by a boot self-heal. Adding an agent to a project on a
  different site, or assigning it a task there, is refused with an error naming both
  sides. The capability's site resolves project → agent's home → local installation;
  `UserSettings.homeSiteId`, the lazy assignment and the site-picker modal are gone
  (the drop migration destroyed zero rows; user-approved).
- **The topology turn:** site registration was verified end to end against running
  apps, and one idempotent boot-time re-key adopts the registered site app as the
  local site — observed firing live in the closing walkthrough (three projects, one
  agent, two placements moved; placeholder retired). A single shared resolver answers
  both the registry-id and logical-id forms of "the local site", so the two id spaces
  are structurally unable to disagree.
- **The move:** site's schema owns `Workspace`/`RepoAttachment` and gained its first
  real-database test harness; the control channel serves thirteen data methods; hq
  reads them through a typed store (bare ids resolve via hq's two-column placement
  index — written only by hq — and failures are explicit: site-unreachable, dangling
  placement, placement mismatch, never a silent null). Every hq call site was rewired,
  the rows copied with verified matching counts, and hq's tables dropped
  (user-approved). hq keeps only the placement index and the access policies.
- **Fail-closed, proven live:** the mint refuses when the owning site is unreachable
  or a session's workspace no longer exists (closing 5b-1's dangling-location ledger
  item); the walkthrough drove a real block/unblock through the browser over the
  channel, killed the site app mid-flight (exact specified 503, page surfaces it),
  and watched reconnection recover with no special path.
- **Review-caught along the way:** a policy re-key that would have silently unblocked
  every blocked workspace after adoption; an FK deadlock that would have made adoption
  fail silently forever; a mint fail-open on null workspace reads; a renewal that
  turned a transient outage into a terminal session-over signal; and a boot heal that
  had crept onto request paths at full-table-scan cost.
- Verified at completion: 1343 hq unit + 193 hq integration tests, 70 site unit + 8
  site integration (the new harness), clean `wasp build` in both apps, QA chain whole
  for US-159 / SC-314..324.

**Deviations.** None during the plan. Its anchors were settled by a reversal recorded before it began (entry 4). The close-out unit later reversed part of that: an agent no longer has a home site, because an agent became a versioned package with no disk of its own (ADR-0056 replaces ADR-0047).

### Plan 5d-1 — Runtime in-place hardening — done, merged in `b709254`

Every structural boundary the runtime needs before it can move, built and proven while
the code still runs inside hq. Nothing here is throwaway — each boundary survives the
move verbatim.

- **A container belongs to a session** (ADR-0049): named `<prefix>-<handle>-<sessionId>`
  with neither project nor person in the name; context (agent, session, invoker, task)
  rides Docker labels, scoped per install so co-hosted installs cannot cross-delete.
  Memory and process-count limits on every container; idle teardown with boot adoption,
  a grace floor, and an in-flight-removal handshake (a review probe demonstrated the
  post-decision race — a resuming user handed a container mid-deletion — before the fix).
- **Memory of a person is a mount** (ADR-0048): `agents/<handle>/users/<userId>` binds at
  `/memory` only for person-invoked runs, under the capability-grade predicate
  (deliberately stricter than the invoker label — a chat turn inside a task session
  mounts nobody's memory); task and heartbeat runs mount none. The legacy in-workspace
  convention is migrated at boot; conflicts are quarantined *outside* the workspace so
  the cross-person readability actually closes. The mount participates in the container
  reuse signature, so a mount change forces recreation rather than leaking the previous
  invoker's partition.
- **`/workspace` remap** (E1): the agent workspace mounts at `/workspace`; no container
  path or prompt line reveals the host layout (the review found the prompt builder
  independently recomputing host paths — the leak the remap exists to close — and the
  headline test needle unable to match; both fixed, and prompt previews now show what a
  run actually receives).
- **Read-only mounts** close the 5b-1 gap: when write tools fall out of the effective
  set, every work-location bind (files homes, workspaces, task dir, knowledge) goes
  read-only — proven live with a real kernel refusal against an unrestricted agent.
  The agent workspace and `/memory` stay writable by design.
- **Project knowledge** (spec §8.3) mounts at `/projects/<slug>/knowledge` for project
  runs, labelled in the prompt — the model's one shared memory.
- **The file splits** pre-stage 5d-2: `AgentEngine` (898 → five modules) and
  `ClaudeSDKRuntime` (629 → three) both under the stop rule; `agents/workspaceService`
  divided into `agentDiskPaths` (site-machine disk — its importers ARE the moving set)
  and `assetPaths` (hq content), with all 33 importers and 34 test mocks re-pointed.
- **Walkthrough against real containers:** boot sweep removed a pre-plan container via
  the fallback branch; three concurrent containers for one agent with correct labels;
  `/memory` present in chat, absent in heartbeat; a real read-only-filesystem refusal;
  a mid-session cap flip recreating the warm container; migration's both branches
  firing; idle sweep adopting then removing all four leftovers; recreate-on-resume with
  migrated memory readable at `/memory`.
- **Environmental finding:** SDK runs fail at auth — the seeded OAuth credential expired
  months ago (the §9.4 rotation problem; its detect-and-notify fix is 5d-2 scope). Runs
  fail cleanly with the error surfaced; everything this plan built happens before that
  point.
- Verified at completion: 1428 hq unit + 193 hq integration, 70 site unit + 8 site
  integration, 22 core; clean `wasp build` in both apps; QA chain whole for US-160 /
  SC-325..336. Review rounds caught, beyond the above: a teardown policy that a
  mistyped env var would have INVERTED (NaN comparisons sweeping at 60 s instead of
  30 min), an orphan-sweep ordering whose regression would have deleted every live
  container at boot (mutation-pinned), and four pre-existing defects now ledgered —
  including `read_file`/`write_file` being silently dead for every native-runtime agent.

**Deviations.** 5d was cut in two at the topology line, before this plan began (Changes of direction, entry 9); this plan is the half that made the runtime site-shaped while it still ran inside hq. Four pre-existing defects found in review were ledgered rather than fixed here; the one that left `read_file` and `write_file` dead for native-runtime agents was fixed in 5d-2.

### Plan 5d-2 — The topology cut — done

The execution runtime physically moved to `site`, and absorbed 5e's model move in the
same cut (decision D1, above): the runtime writes the four runtime models on nearly
every line, so an interim network write path built only to be deleted the moment 5e's
turn came was refused. hq now dispatches every run over the control channel; site
executes and reports back. Decision record: ADR-0050.

- **Protocol 7.0** (`core/src/protocol/runtimeData.ts`): a `RunDispatchPayload` carrying
  a pre-resolved `RunContextPayload` (agent config, task/board/project detail,
  membership mounts, roster, risk rules, the resolved LLM key) so the runtime never
  needs a control-plane read mid-run; one-way `site.event` frames (`run.status`,
  `run.stream`, `site.credentialHealth`) with no request/reply pairing, enforced at the
  type level.
- **The four runtime models moved**: `AgentSession`, `AgentRun`, `TranscriptEntry`,
  `ToolCallLog` live in site's schema with their delete cascades intact. hq keeps a
  whole-row `AgentSession` copy — hq authors the creation-time fields once, site writes
  the runtime fields back through a `sessionPatch` applied via an explicit six-field
  pick (spec §10's one-writer-per-field rule, now structural rather than a convention a
  caller could violate).
- **hq dispatches, site executes.** Every chat message, task run and heartbeat pulse
  goes out as `run.dispatch`; hq's drivers (`ChatRunner`/`TaskRunner`/`AgentHeartbeat`)
  shrank to dispatch calls plus a status-frame listener. hq's task state machine stays
  on hq (spec §7.1's work queue) driven by `run.status` frames, with a per-run terminal
  latch, per-task serialization of concurrent frames, and reconcile-on-reconnect plus a
  held-task drain replacing acked delivery — a site-unreachable dispatch returns its
  task to `QUEUED` with a held reason instead of failing or retrying the socket call.
- **hq's reads cross the channel** through a typed store (`siteRuntimeStore.ts`) —
  transcripts, runs, tool-call logs, run stats, session lifecycle — all served from
  site's database, all failing with an explicit site-unreachable error rather than
  degrading silently.
- **Site executes locally**: MCP and the git-credential endpoint moved with the
  runtime; roughly 30 of 37 MCP tools forward to hq's data path unchanged, the
  remainder resolve on site. The GitHub App's private key never leaves hq —
  `resolve_git_credential` stays an hq-only forwarded operation.
- **Credentials (§9.4)**: seeding is freshest-wins between the shared seed and each
  agent's copy in both directions (re-seed on start, write back on container stop); a
  dead grant is detected at container start, fails the run fast with a remediation
  message, and raises a `site.credentialHealth` event that becomes an hq admin
  notification (deduped per site/agent/state/day).
- **hq's own tables dropped** — `AgentRun`, `TranscriptEntry`, `ToolCallLog` removed
  from hq's schema (destructive, user-approved) after a row-count-verified copy
  (19 sessions / 33 runs / 93 transcript entries / 161 tool-call logs; idempotent
  re-run copied zero). A dangling-copy reconciler flags an hq session copy whose site
  row is gone, distinguishing "not found" from "site unreachable."
- **Inherited fixes landed alongside**: the native `read_file`/`write_file` pair
  revived with scoped path validation (including a symlink-escape close found in
  review); the 5b-1 mint residual (an unrestricted agent's omitted write tool escaping
  the workspace cap) closed; the preview bind's host-path translation; `stopAgent` no
  longer removes a container under a live run.
- **The accepted behaviour change 5e specified**: deleting a `User` or `Agent` is no
  longer database-blocked by runs or transcripts, because those tables left hq's
  database entirely. Only the `AgentSession` copy still references them; a dangling
  scalar id on site is the same accepted cross-database trade every hq-issued
  reference already makes (spec §3).
- **A live two-app walkthrough** verified the whole loop against real containers:
  channel connect/reconnect, session creation round-tripping the same id on both
  sides, a chat dispatch through container start to the expired-credential fail-fast
  path (with the admin notification observed), a rename/archive round-trip, the
  held-task drain on reconnect, the dangling-copy flag firing after a site row was
  deleted, transcript reads over the wire, heartbeat pulses dispatched and stopped, and
  a chat-privacy refusal decided entirely from hq's copy with no site call. Streaming
  deltas, live manifest approval and long-run restart scenarios needed a live LLM
  credential or long-running work the environment didn't have; each is covered instead
  by the unit and integration suites.
- Verified at completion: 1356 hq unit + 203 hq integration, 463 site unit + 24 site
  integration, 25 core tests, clean `wasp build` in both apps, QA chain whole for
  US-161 / SC-337..354.
- **What remains, explicitly not this plan's scope**: `AgentSession` carrying several
  mounted locations instead of a single primary triple (5e's other acceptance
  criterion — a feature change, not part of the cut, now on the unassigned list); the
  automated cross-app integration tier and the client relay generalization (5f,
  rescoped below); several colocated-interim surfaces D6 left on hq deliberately
  (listed under "Work not assigned to any plan").

**Deviations.** It absorbed 5e's model move (Changes of direction, entry 10, decision D1) after a measurement of the runtime's write sites. Cut for needing a schema field it did not scope: the credential-health indicator on the Execution Sites page, which the close-out unit dropped in favour of showing each site's link to hq (its Phase 1). Left for later, as stated above: several mounted locations per session, the prompt preview's sections, site-side session naming, and the colocated-interim disk access.

---

### Plan 5f — Cross-app integration tier & relay decision — done, merged in `b709254`

Executed 2026-08-17 on `feature/execution-runtime-extraction` (task plan: ephemeral
scratch). The last plan of the split — with it the sequence 1 → 5f is fully landed.

- **The cross-app integration tier exists**: `tests/cross-app/` (run as
  `npm run test:cross-app` from repo root) boots BOTH apps against isolated test
  databases (`agenthix_test`@4109, `agenthix_site_test`@4209 — both test-DB wrappers
  now self-provision), registers site with hq over the real HTTP + WebSocket path, and
  proves at a new test level what only manual walkthroughs covered before: token mint →
  headless registration → ONLINE both sides; uniform refusal of consumed/unknown/expired
  tokens; hq restart → offline-at-boot → automatic redial without re-registration →
  local-site adoption; chat dispatch round-tripping to a terminal status with the
  `run.status` relay asserted on a real socket.io client and a no-secrets check on
  site's stored dispatch blob; rename/archive replication; chat privacy refused from
  hq's own copy with a zero-leak socket assertion; explicit 503s (reads AND chat
  dispatch) with the site named; and a held task drained over a genuine reconnect,
  QUEUED-held → drain → frame-driven terminal. 15 tests, 4 suites, ~1 minute per run,
  API-level vitest — no browser, no Docker, deterministic FAILED-terminal probes by
  design (empty `SITE_ROOT`, no credential seed).
- **The relay decision landed as ADR-0051** (no generic relay — direction entry 11),
  and its hardening with it: `run.stream` frames are now validated at hq intake
  (closed name/room vocabulary from core's new runtime consts, session-existence
  check behind a promise-keyed TTL/LRU cache so cold-cache bursts stay in arrival
  order, `agentRunStatus` barred from the stream path) — SC-355/AC-161g. The
  `run.status` scalar residual is stated honestly in the ADR, not claimed fixed.
- **Product fixes the tier itself surfaced**: `triggerAgentRun` now maps
  `SiteUnreachableError` to the explicit 503 (it previously escaped as a bare 500
  through Express's finalhandler — found because the tier asserted SC-340's chat half
  and the wording didn't match); the site-unreachable message widened to "its runs and
  workspaces are unavailable" now that chat surfaces it.
- **The tier caught a between-apps bug during its own construction**: the first intake
  guard draft dropped `taskSessionStarted` frames (`runId: null` by design) — site's
  unit suite and hq's unit suite each passed alone; only the tier went red. That is the
  failure class the tier exists for, observed on its first opportunity.
- Verified at completion: 2,098 tests across 215 files all passing — core 27, hq 1,366
  unit + 203 integration, site 463 unit + 24 integration, cross-app 15 — plus clean
  `tsc --noEmit` and `wasp build` in both apps; QA chain reverse-clean (309 cited ids,
  zero broken references).
- **Known gap, deliberately carried**: SC-331 (legacy-memory migration) turns out to be
  branch-introduced and uncited, not a pre-existing main-side gap as 5d-2's sweep
  assumed — see the corrected entry in the unassigned list; it must be resolved at the
  finish gate.

**Deviations.** Rescoped from "chat and voice relay" to the cross-app integration tier and a relay decision, which answered no (Changes of direction, entry 11). No CI workflow shipped with the tier, because the repository had never been pushed and a workflow would have been unverifiable.

## Remaining plans

None — the split's plan sequence was complete at plan 5f. What it left is listed below with where
each item went.

## Decision records

**Implements.** [ADR-0042](../../adr/adr-0042-hq-is-the-orgs-own.md) — the plans built the split it
decides, and the record carries a dated note saying so.

**Written during the split, all Accepted or closed by a later record** (none is Proposed):
[ADR-0040](../../adr/adr-0040-hq-issued-token-ttls.md) token lifetimes ·
[ADR-0041](../../adr/adr-0041-chat-session-privacy.md) chat privacy ·
[ADR-0044](../../adr/adr-0044-execution-site-registration-flow.md) registration flow, whose registration
decision the close-out unit superseded with ADR-0064 · [ADR-0045](../../adr/adr-0045-request-response-on-the-control-channel.md) request and response ·
[ADR-0046](../../adr/adr-0046-protocol-compatibility-between-hq-and-sites.md) protocol compatibility ·
[ADR-0047](../../adr/adr-0047-where-a-run-may-execute.md), [ADR-0048](../../adr/adr-0048-partitioning-an-agents-memory-of-a-person.md)
and [ADR-0049](../../adr/adr-0049-the-session-is-the-container-boundary.md), which the close-out unit superseded
with ADR-0056, ADR-0058 and ADR-0057 · [ADR-0050](../../adr/adr-0050-dispatch-and-status-cross-the-control-channel.md)
dispatch and status · [ADR-0051](../../adr/adr-0051-live-site-data-crosses-as-typed-events-not-a-generic-relay.md) no generic relay.
The plans did not list decision records up front, so there is no Depends-on or Revisits list to
confirm; the records that later work superseded were closed by the unit that disproved them.

## Leftovers at the close — where each went

What the plans deliberately left, and where each item ended. Every item is either built by the
close-out unit or raised as its own issue; none is left in this file.

- **Project knowledge** — the mount and prompt direction were delivered in 5d-1. Its directory convention
  and any listing of it are raised as their own issue.
- **The operator console's authentication** — settled by removing the console: the site has no operator
  page (ADR-0065) and registers by consent (ADR-0064). Close-out Phase 11.
- **Site decommissioning** — raised as its own issue.
- **Deployment shape** — built in close-out Phase 12 (ADR-0066 to ADR-0069).
- **hq's own outbound connection client and `HqConnection`** — removed in close-out Phase 1.
- **`AGENTS.md` / `README.md`** — `AGENTS.md` was brought up to the present shape as the close-out unit ran;
  the rest is the roadmap's *Open to outside users* objective.
- **Roadmap review** — done in the September 2026 planning cycle, which planned the close-out unit.
- **`AgentSession` carrying several mounted locations** — raised as its own issue.
- **hq's colocated-interim disk access** — moved to the control channel in close-out Phase 7; two
  expressions remain at hq's boot and in the dispatch payload, named in the close-out register (R-011).
- **Prompt preview flattened to one section** — close-out task 1.15.
- **`ExecutionSite` credential-health stamp and badge** — dropped in favour of showing each site's link
  status, close-out task 1.17.
- **Site-side session naming unwired** — close-out task 1.16 wired it and removed hq's copy.
- **`memoryMigration.ts` has no test (SC-331)** — moot: memory of a person moved to hq and the migration was
  deleted (close-out Phase 5c); the scenario was retired.
- **The multi-site placement prompt branch (SC-288)** — moot: placement follows storage, and the scenario was
  retired (close-out task 13.3).
- **CI workflow for the cross-app tier** — the roadmap's *Open to outside users* objective.

## How this document was maintained

While it was live: a plan completing moved its entry to Completed with what actually shipped, and any change
of direction was a dated entry in Changes of direction, however small. When the split's unit closed, what
describes the present system stayed in `docs/architecture/` and `docs/concepts/`, decisions stayed in
`docs/adr/`, and this file was frozen as a record.
