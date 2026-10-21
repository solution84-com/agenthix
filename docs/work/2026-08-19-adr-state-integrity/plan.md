---
created: 2026-08-19
description: Reading every Accepted decision record against the code, and applying a disposition to each one that has drifted.
---

# Implementation Plan · ADR State Integrity

**Design spec:** [`design-spec.md`](design-spec.md)

## Goal

Every record marked `Accepted` either demonstrably describes the system, or has been given a disposition that says how it does not.

**In scope:** the 29 records currently marked `Accepted`.

**Out of scope:** `Proposed`, `Rejected`, `Superseded` and `Deprecated` records — only `Accepted` claims to describe the present, so only `Accepted` can be wrong about it. Also out of scope: fixing the code. Where a record turns out to be a live requirement the code never met, that is filed as work, not resolved here.

## Decision records

| | Records |
|---|---|
| **Depends on** | None. The approach rests on the maintainers' decision-record freeze rule, which is not a record in this repository |
| **Implements** | None. This is a backfill audit; it carries out no recorded decision |
| **Revisits** | `adr-0022`, `adr-0026`, `adr-0027` (removed — never a record). Confirmed drifted. Plus `adr-0004`, `adr-0036` and `adr-0037`, added by the phase 1 audit. The other fifteen were checked and struck — see Findings |

**The Revisits list is deliberately over-inclusive.** Phase 1's whole purpose is to find out which of the 17 belong on it. Listing them all up front and striking the ones that hold is the honest direction — the opposite order would let a drifted record leave the unit unexamined.

## Approach

**Read each record against the code, one at a time.** There is no mechanical test for "does this still describe the system" — `adr-0011` sat wrongly marked for months and no sweep would have caught it, because the error was in a claim nobody re-read. Each record needs a falsifiable statement pulled out of its Decision section and checked against the thing it names.

**Classify before disposing.** The three confirmed drifts are three different shapes — reversal, relocation, and degradation — and they do not take the same remedy. Applying dispositions record-by-record as they are found would set precedent by accident; the policy is settled once, between the audit and the corrections, when the full set of shapes is visible.

**Never revise an Accepted record.** This is the constraint the whole approach bends around. A drifted record cannot be edited to match the code, so every correction is a supersession, a deprecation, or an annotation — and superseding means writing a new record with its own options-considered section, which is why the correction phase is larger than it looks.

**Where drift is degradation, suspect the code first.** `adr-0027` specifies per-agent commit authorship and trailers; the code attributes everything to a generic identity. That is at least as likely to be an unfinished requirement as a stale decision, and the two have opposite remedies. Reading the record as stale is the failure mode to guard against — it silently converts an unmet requirement into a documented decision.

## Key decisions

| Decision | Why |
|---|---|
| Audit only `Accepted` records | Only that state claims to describe the present. The others are already marked as not doing so |
| Read every record, rather than sampling | The migration already sampled, which is how three drifts survived it. A partial audit leaves the same doubt it was meant to remove |
| Settle disposition policy between audit and correction | Deciding per record as it is found sets precedent by accident, and the early records get a different rule from the late ones |
| Two phases, split on discovery versus application | An audit's output is unknown in advance, so phase 1 cannot have an execution plan. Phase 2's is a list once the findings exist. That is a dependency, which is a seam; activity type on its own is not |
| Do **not** fix code in this unit | Mixing "the record is wrong" with "the code is wrong" in one unit means neither gets reviewed properly. Code defects are filed |
| Do not renumber or re-slug anything | Every citation is by id. Renumbering to make the sequence chronological would break every reference to buy tidiness |

**Decided against: three phases.** An earlier draft cut audit, correction and filing apart. Only the first cut is a seam — filing is what finishing the correction means, not a deliverable of its own, and a phase per activity is the same error as a folder per artifact type.

**Decided against: correcting records in place.** It is the obvious move and it is what the freeze rule exists to prevent. A log that is edited to agree with reality is no longer evidence of what was decided — and the drift it would hide is exactly the signal worth keeping.

## Work breakdown

Two phases, and the seam between them is that the second cannot be written until the first reports. An audit's output is unknown by definition — that is what makes it an audit — so phase 1 has no execution plan and cannot have one. Phase 2's changes are a list once the findings and the policy exist, so it gets one.

Close-out is not a third phase. Filing what the audit surfaced and closing the records is what finishing phase 2 means.

### Phase 1 — Audit

**Delivers:** every Accepted record read against the code, classified, and the reading recorded.
**Execution plan:** none. The work is discovery; there is no list of file changes to write in advance.

- [x] 1.1 `adr-0004` — workspace as the security boundary
- [x] 1.2 `adr-0025` — agent identity as a first-class org member
- [x] 1.3 `adr-0030` — task-scoped sessions, resumed by stored id
- [x] 1.4 `adr-0031` — project workspaces on the Site filesystem
- [x] 1.5 `adr-0032` — execution converges at TaskRunner via `run_task`
- [x] 1.6 `adr-0036` — run context as the permission boundary
- [x] 1.7 `adr-0037` — connectors, environments and approved workflows
- [x] 1.8 `adr-0039` — nested storage with permanent ownership
- [x] 1.9 `adr-0040` — hq-issued token lifetimes
- [x] 1.10 `adr-0041` — chat sessions private to their owner
- [x] 1.11 `adr-0044` — Execution Site registration flow
- [x] 1.12 `adr-0045` — request/response on the control channel
- [x] 1.13 `adr-0046` — protocol compatibility between hq and sites
- [x] 1.14 `adr-0047` — where a run may execute
- [x] 1.15 `adr-0048` — partitioning an agent's memory of a person
- [x] 1.16 `adr-0049` — the session is the container boundary
- [x] 1.17 `adr-0050` — dispatch and status cross the control channel
- [x] 1.18 `adr-0051` — live site data crosses as typed events
- [x] 1.19 Classify every drift by shape — reversal, relocation, degradation, or unrecorded change
- [x] 1.20 Record the reading for records that hold, so the audit is not repeated blind
- [x] 1.21 Strike from the Revisits list every record that holds

**A record is checked by pulling one falsifiable claim from its Decision section and testing it against the thing it names.** Not by reading it for plausibility — `adr-0022` reads perfectly and is wrong.

### Phase 2 — Apply dispositions and close

**Precondition:** phase 1 complete, and the design spec's §3 policy settled. Both, not either — the policy cannot be chosen without knowing which shapes are present.
**Execution plan:** yes. By this point every change is enumerable.

- [x] 2.1 Write `adr-0054` for the MCP surface — it **amends** `adr-0022` rather than superseding it
- [x] 2.2 Dispose of `adr-0026` per policy — annotated, decision intact
- [x] 2.3 Remove `adr-0027` from the sequence and queue its work — it binds nothing outside itself
- [x] 2.4 Dispose of every drift phase 1 added — `adr-0004`, `adr-0036` amended; `adr-0037` annotated
- [x] 2.5 Update the index — `adr-0054` added, `adr-0022` restated, next number `adr-0055`
- [x] 2.6 Verify no Accepted record cites a capability another record says was removed — clean
- [x] 2.7 File `adr-0037`'s `Connector` as outstanding work — `bl-0033`; the record binds and stays Accepted
- [x] 2.8 Establish where queued work goes — it has a home; 2.3 used it
- [x] 2.9 Close the unit

> **Pointer, added 2026-08-30.** Two things in this plan no longer resolve, and one is corrected
> here rather than in the body — the unit is closed and its findings stand as written.
>
> **The backlog ids are dead.** Queued work left git after this unit closed, and the items it
> filed are issues: `bl-0030` is agent commit authorship, `bl-0032` the missing record for hq's
> management MCP surface, and `bl-0033` the Connector model that is designed but not built.
> The decision index already repoints `bl-0030`; the other two are repointed by this note.
>
> **The register work continued in `2026-08-30-decision-register-migration`.** That unit migrated
> the folder onto the maintainers' current decision-record rules — three states rather than five, section-level
> addressing so one decision inside a legacy record can be closed on its own, and the removal of
> two further records this audit had left as `Rejected` on the grounds that they were never
> accepted. Its finding is this one's, carried one step further: *records go stale because they
> recorded something that was never a decision* — and two of the six here were that.

## Phase 1 findings

Eighteen records read against the code. **Fifteen hold; three do not**, bringing the unit's total to six drifted of twenty-nine Accepted.

### Hold

`adr-0025` (`primaryAgentId` gone, agent handle unique) · `adr-0030` (`resume: sdkSessionId` in ClaudeSDKRuntime) · `adr-0031` (`filesService` writes `ROADMAP.md` into the owner's files dir) · `adr-0032` (`run_task` across TaskRunner, AgentHeartbeat and the MCP server) · `adr-0039` (`paths.ts` implements `{root}/{ownerType-plural}/{ownerId}/workspaces/{id}` and `/files`, all four owner kinds — the closest match of any record) · `adr-0040` (`identityApi` pins the audience to the proved `X-Site-Id`) · `adr-0041` (`userId: context.user.id, sessionType: 'chat'`, plus the ownership check) · `adr-0044` (`connectionToken`) · `adr-0045` / `adr-0050` / `adr-0051` (`channel.request` and `site.event` in the protocol union) · `adr-0046` · `adr-0047` · `adr-0048` · `adr-0049` (`${prefix}-${handle}-${sessionId}`, exactly as written)

### Drifted

**`adr-0004` — the security boundary it names does not exist as described.** It defines a workspace as containing "Members (users)". `Workspace` carries `ownerType`/`ownerId` and no members relation, and `adr-0041` separately establishes that no user-to-project relation exists anywhere in the schema. Permanent *ownership* replaced membership, which is `adr-0039`'s model. The principle survives; the mechanism named is not the one built.

**`adr-0036` — a section is known-dead and the record does not say so.** `adr-0049` states plainly that §4's per-context runtimes "was never implemented, and on examination the framing does not survive contact with the cases", and lists §4 as superseded. `adr-0036` itself carries no annotation. It reads as wholly in force. The framework's partial-supersession mechanism exists for exactly this and was never applied.

**`adr-0027` and `adr-0037` — accepted, and the work never happened.** Neither is a stale record: nothing revisited either decision. What is missing is the implementation. `adr-0027`'s symptom is observable — reviewing a commit an agent made, nothing says which agent made it — and that record is what the work should be built against when it is picked up.

**`adr-0027` then failed a test the audit did not start with, and the framework did not yet hold.** Asked what it binds, the answer is nothing: no other part of the codebase had to be built a particular way because of it, and reversing it costs the one file that sets the author fields. It answers *what should we build* where a record answers *which way should this be built* — a feature request, filed as a record because this repository had nowhere else to file one.

The consequence is what made it worth a framework change rather than a one-off correction. Nobody supersedes a decision nobody depends on, so such a record sits Accepted indefinitely with no note of what acted on it — **indistinguishable from a decision that was carried out and never marked**. The index's one signal for an open loop gets spent on a record that never had a loop to close.

**It is removed from the sequence rather than rejected.** Rejected is a decision outcome — considered and declined — and applying it here would say the approach was refused, which is the opposite of what happened. A misfiling is corrected by filing it correctly, not by recording a decision nobody made. The number 0027 is retired in the index, pointing at where the work now lives; the record itself stays in git history, and the alternatives it weighed are carried into the backlog item in full, so nothing is lost but the wrong shelf.

**Where it went.** This repository already had a backlog — it was not missing, only unexamined — so the item was filed there rather than in a second list, which is how two backlogs start drifting. The convention it specified is `docs/concepts/workspace/github-commit-authorship.md`, which is Living and correctly placed under the *choice, not arrangement* rule; it now carries a flag saying the convention is specified but not built, because a concepts document describing behaviour that does not exist is the same failure one shelf over.

The bar itself, the removal path, and the reverse check at unit close are recorded in the maintainers' decision-record rules, outside this repository.

**`adr-0037` was tested against the same bar and passes.** Choosing GitHub Actions over a platform-owned runner binds where secrets live, what the platform executes and what it does not; reversing it is a rebuild. Its unbuilt `Connector` is an unbuilt part of a binding model, not a feature request wearing a record's shape. A separate observation, not acted on here: `Connector` could change while the execution-backend choice stands, which is the *one decision per record* test failing — the record holds more than one decision.

**`adr-0037` — accepted, and substantially unbuilt.** Of its three concepts, `Provider` exists and GitHub Actions execution exists (`hq/src/server/github/githubRuns.ts`), but **`Connector` is commented out** in `hq/schema.prisma` with the note "Uncomment and migrate when building the agent connector / secrets feature". The record describes stored, scope-resolved credentials as settled; they are a schema comment.

### A fourth drift shape

The design spec's §3 names three: reversal, relocation, degradation. `adr-0037` is none of them — it was accepted and the work simply did not happen. **"Accepted but unbuilt"** needs its own disposition, and it is a different question from the others: nothing is wrong with the record, only with the assumption that Accepted implies built. `adr-0036` is a fourth-and-a-half case — partly built, with the dead part recorded in a *different* record.

### Incidental

**hq runs an MCP server too** (`hq/src/server/mcp/mcpServer.ts`), alongside site's. This deepens `adr-0022`'s contradiction rather than softening it: the record says MCP was removed from the Site, and it is now running in both apps.


## Deviations

**Phase 1 — one.** The design spec's §3 anticipated three drift shapes; the audit found a fourth ("accepted but unbuilt", `adr-0037`) and a variant of partial supersession recorded on the wrong record (`adr-0036`). §3's policy question now has more shapes to answer than it was written against.

**Phase 2 — two.**

**Task 2.1 was written wrong and the work corrected it.** It said *"write the superseding record for `adr-0022`"*. Reading the record against the code showed most of it still true, so `adr-0054` amends rather than supersedes. The plan's wording had assumed the disposition before the evidence — which is the same failure the whole unit exists to correct, committed in the plan itself.

**Task 2.9 uncovered a stale reference document the audit did not create.** `docs/architecture/mcp/tools.md` still described tool scope as derived from the HQ connection, which the split replaced with the per-run capability. Corrected in place, since it is Living. Its per-tool table was **not** re-verified — that is its own audit, and claiming it was checked would be worse than leaving it.

## Phase 2 findings

> **Pointer, added 2026-08-21.** `adr-0054`, written by task 2.1 below, was removed later the
> same day. It was retrospective description rather than a decision anyone made, and that
> belongs in architecture — the surface it described is now `docs/architecture/mcp/tools.md`,
> and `adr-0022` carries its annotations in place. The findings below stand as written; only
> the disposition changed. See the retired-numbers table in the decision index.

### `adr-0022` is amended, not superseded — and that was the whole question

The task was written as *"write the superseding record"*. Reading the record against the code says otherwise. `adr-0022` makes seven numbered claims plus a headline; **five of the seven still hold, and the headline holds**. Only §1 is reversed, and §3 partly.

**The distinction that resolves it:** `adr-0022` removed MCP as an **inbound** interface for third-party agents. What returned is an **outbound** surface for the platform's own agent — the site serves `/mcp`, its own container connects with a per-run opaque token, and every data-touching tool forwards to hq, which keeps authorization. Same protocol, different question. Conflating the two is what made the contradiction look total, and superseding the record would have discarded five true statements to correct one.

**`adr-0020` never lost its footing.** Task delegation through an MCP tool stayed in the code throughout the period `adr-0022` said MCP was gone. It did not contradict the record so much as depend on a surface the record denied existing — which nothing would surface except reading them together.

`adr-0054` is written retrospectively and says so. Every claim in it was verified against the file it names.

### Two more missing records, one filed, one deliberately not written here

**hq runs a second MCP server** with a static admin-key path (`mcpKeyActions.ts`) — the management interface `adr-0022` predicted and explicitly called a future decision. That decision was taken and built and never recorded. Writing it needs answers this audit cannot supply — who the client is, why a static credential sits beside a run-scoped one — so it is filed as `bl-0032` rather than guessed at. `adr-0054` names the gap instead of papering over it.

**`adr-0037`'s `Connector`** is filed as `bl-0033`. The decision stands; only the implementation is missing.

### What the audit changed about the sequence

Twenty-nine records checked. **Twenty-three describe the system.** Of the six that did not:

| | |
|---|---|
| Amended by a later record | `adr-0004` → `adr-0039` · `adr-0036` → `adr-0049` · `adr-0022` → `adr-0054` |
| Annotated, decision intact, the change was never written down | `adr-0026` |
| Accepted, work never started — now queued | `adr-0037` → `bl-0033` |
| Never a decision record at all — removed | `adr-0027` → `bl-0030` |

**Not one of the six had been reversed by a person.** Four froze an arrangement rather than a choice, one was a feature request, and one was an undocumented reversal. That distribution is what drove the framework changes this unit produced, and it is the finding worth carrying forward: **records do not usually go stale because someone changed their mind. They go stale because they recorded something that was never a decision.**

