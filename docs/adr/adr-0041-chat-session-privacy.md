---
created: 2026-08-11
description: Chat sessions readable only by the user who owns them, for every role including admin.
---

# Chat Sessions Are Private to Their Owner

**Status:** Accepted

## Context

The hq/site split design settles *agent*-to-workspace access (§2a capabilities, §2b workspace access policy) but says nothing about **user-to-user** access: may one person read another person's conversation with an agent? The spec flags this explicitly as undesigned, and notes it matters more under this design than it otherwise would, because §4a routes and renders **all** chat through hq while §1 leaves the Execution Site with no identity store. hq is therefore the only place such a rule can be enforced at all.

The question is live because sessions are not uniform. `AgentSession.sessionType` distinguishes:

- **`chat`** — a user's own 1:1 conversation with an agent;
- **`task`** and **`heartbeat`** — agent activity on org work. These are *owned* by an arbitrary admin purely as an implementation detail: `TaskRunner` and `AgentHeartbeat` pick `userSettings.findFirst({ where: { role: 'ADMIN' } })` as the session's user because a session row needs one. Their visibility to everyone is deliberate, and an existing comment in the code says so.

Roles live on `UserSettings.role` (`ADMIN | OPERATOR | VIEWER`); there is no org-membership model. Full multi-user RBAC is out of scope here and deferred to Phase 15.

## Decision

> ⚠️ **Superseded by adr-0077 — this section only.** A chat is no longer hidden from the other
> members of its boundary: adr-0077 lets them see that it is running, its agent, who started it, where
> it is working and since when. **Still standing:** a chat's content, title included, is readable only
> by its owner for every role, ADMIN included (adr-0077 restates this); a task session is readable by
> its project's members; refusals return 404; and the rest of this record, including adr-0041-s-1.

**An org admin may not read another user's chat session or transcript.** Chat-session content — the session row, its transcript entries, its runs' input and output text, its tool-call logs, its manifests, and its live event stream — is readable **only by the user who owns it**, for every role, ADMIN included.

**A task session is readable by the members of its project**, and by no one else. A task session is agent activity on org work, so it is not private to one person the way a chat is — but it is not org-wide either. Project membership is the boundary: if you are not a member of the project, you cannot read its tasks' sessions or transcripts.

Refusals return **404, not 403**, so a response never confirms that a session exists.

### The task rule is not enforceable yet, and today's behaviour is an interim

`ProjectMember` links a Project to an **Agent**, not to a User (`schema.prisma`, `model ProjectMember`), and no user-to-project relation exists anywhere in the schema — the only `User` relations are `UserSettings`, `MobileAuthToken`, `AgentSession` and `PreviewSession`. As users, a project's member set is therefore empty, and there is nothing to scope a task session against. `getMyStorage` records the same gap from the other side: *"Unscoped today (single-tenant); per-owner filtering arrives with Phase 9."*

So the code currently shipped scopes chat sessions to their owner and leaves every non-chat session readable by any authenticated user. **That is an interim consequence of the missing data model, not this ADR's rule.** It is tolerable only because the deployment is single-tenant today, where all users are the org.

Closing it requires user-level project membership — a schema and permissions change touching project creation, invites, and every project-scoped query. That belongs with Phase 15 (RBAC), not here. When it lands, the task-session queries must move from "any authenticated user" to a project-membership check, and this ADR is the statement of what that check must be.

**Heartbeat sessions are deliberately not covered by this ADR.** Whether the heartbeat mechanism survives at all is an open question, and enshrining an access rule for it would give a contested feature the appearance of a settled one. They follow today's non-chat behaviour until that question is answered.

Enforcement is in hq, and hq alone. The Execution Site exposes no chat surface to anyone: it has no users to log in, and its operator console (whose own authentication is still undesigned) verifies hq-issued tokens to show **operational state only** — site config, the HQ link, install diagnostics, run and container status. **Standing design constraint: the operator console must never grow a transcript browser**, or the deferred console work would silently undo this decision.

## Consequences

### Positive
- Privacy-preserving by default, which is the right default to start from — loosening later is a deliberate act, whereas tightening later breaks expectations users have already formed.
- One rule, one discriminator (`sessionType`), applied identically across every read path.

### Negative
- There is no support or compliance path to read a user's conversation. If one is ever needed it should be built explicitly — an audit-logged export with the user's knowledge — not by quietly widening a read query. Revisit at Phase 15 (RBAC).

### Where the data lives, and what that forces

Today `AgentSession`, `TranscriptEntry`, `AgentRun` and `ToolCallLog` all live in **hq's** database, so this rule is enforceable with ordinary local queries. Spec §1 currently plans to move all four to the Execution Site when the execution-runtime extraction lands, leaving hq *"a lightweight index — exists, status, count"* (§4a).

**That plan and this rule are in conflict**, and this ADR flags it rather than leaving it to be discovered mid-cutover. The rule keys on `AgentSession.userId` — and, for task sessions, on `Task.projectId` plus project membership. If the session row moves to site, the field the rule depends on sits in an app that has no `User` table, cannot authenticate a browser user, and that browsers never reach; hq remains the only possible enforcement point but no longer holds what it needs. "Exists, status, count" cannot answer "is this yours."

**Resolution this ADR asks the execution-runtime extraction to adopt: `AgentSession` stays on hq; only `TranscriptEntry`, `AgentRun` and `ToolCallLog` move.** The session row is identity-bound — `userId`, `agentId` and `taskId` are all hq concepts and only `primaryWorkspaceId` points at site — so it is an hq row with a site-side pointer rather than machine-owned runtime state. The transcript *content* is the genuinely machine-owned part. This also keeps the project-membership check entirely hq-side, since `Task`, `Project` and any future user membership all stay on hq, so authorizing a read needs no cross-app call.

The alternative — move the session and widen hq's index to carry `userId`/`sessionType`/`taskId` — is workable but starts hq holding a mirror of site-owned rows, which is the shape of the delta-sync system that was deliberately removed. Reintroducing it to answer an authorization question is the wrong trade.

Either way, one constraint is absolute: **site must never serve a transcript read except through hq's authenticated relay**, or the app boundary becomes the bypass for everything above.

### Trust-boundary caveat, stated rather than glossed
After the execution runtime moves, transcripts physically live in the Execution Site's own database. Whoever administers that machine can read that database directly; application logic cannot prevent root access. **This ADR is an application-level guarantee enforced at hq**, and under ADR-0042's single-owner model that is coherent — the org can read the org's own disk. Mitigations, if ever required, are operational (encryption at rest, host access control), not architectural, and are out of scope here.

## Implementation notes

Writing this rule down required closing a number of paths that were already open — worth recording, because the count is the interesting part: the rule was not one check but a class of them, and each was found by auditing rather than by reasoning from the design.

**Read paths, now owner-scoped for chat:**
- `hq/src/sessions/queries.ts` — `getAgentRuns` (which had **no authentication check at all**), `getActivitySession`, `getRecentActivity`.
- `hq/src/agents/manifestQueries.ts` — `getToolCallLog` (returned any run's tool inputs and outputs, including file contents and bash commands, to any authenticated user), `getSessionPendingManifest`, `getRunManifestStatus`.
- `hq/src/agents/queries.ts` — `getAgentDetail`, which returned recent runs' `inputText`/`outputText` — the literal text of conversations — and session titles, which `namingService` derives verbatim from the user's first message.

**The real-time path**, which the read-path fixes alone would not have covered:
- `hq/src/agents/runtime/socket.ts` — `subscribeToSession` joined any `session:<id>` room on request with no authorization whatsoever, so any browser socket could stream another user's conversation live as it was written. It now verifies ownership before joining. Task and board room subscriptions are deliberately unchanged, matching this ADR's visibility rule.

Already correct and left alone: `getSessions`, `getSession`, `getTaskSessions`, `getTaskSession`, `getTaskRuns` (the last three are safe by construction — chat sessions always have a null `taskId`).

**Known gaps, deliberately not closed here** — both are authorization gaps on *mutations* rather than content leaks, so they fall outside this ADR's rule and want their own decision:
- `hq/src/sessions/actions.ts` — `clearAgentRuns`, `stopTaskSession`, `deleteTaskSession`, `stopAllSessions` perform no ownership check, so one user can cancel or delete another's runs and sessions.
- `hq/src/agents/manifestActions.ts` — `approveManifest` / `rejectManifest` likewise approve or reject a pending manifest with no session-ownership check.

One further limit worth knowing: the socket fix gates **joining** a room, not continued membership. A user who already holds an open subscription is not evicted if their session later becomes invalid. That matches the threat this ADR addresses; eviction on session invalidation would be a separate enhancement.

---

## Revision — 2026-08-11: `AgentSession` moves to site, and hq keeps a copy

> **This is a second decision, written into a frozen record.** *(annotated 2026-08-30)* It was made
> later than the record it sits in and should have been its own. It is addressed as
> **`adr-0041-s-1`** and carries its own state in the index, so it can be superseded without
> disturbing the privacy rule above. Nothing is moved: the record keeps what it says.

**This revises the mechanism, not the conclusion.** hq still enforces chat privacy, still from its own data. What changes is where the canonical session row lives.

### Why it needed revisiting

This ADR asked the execution-runtime extraction to keep `AgentSession` on hq while `AgentRun`, `TranscriptEntry` and `ToolCallLog` moved to site, reasoning that the privacy rule keys on `AgentSession.userId` and site has no `User` table to enforce against. That reasoning was sound. Its cost was not examined.

Planning the extraction surfaced the cost in the schema:

```prisma
TranscriptEntry.session → AgentSession   onDelete: Cascade
AgentRun.session        → AgentSession   onDelete: Cascade
```

Deleting a session currently removes its runs and its full transcript automatically. Split across two databases that cascade **cannot exist**. It becomes application-level cleanup, and the failure mode when that cleanup is missed is silent: the transcript — the largest thing in the system — stays on site forever, orphaned and invisible.

The comparison the original decision did not make:

| Keep `AgentSession` on hq | Move it to site |
|---|---|
| loses two `Cascade` relations | both survive |
| — | loses `user → User` and `agent → Agent` (`Restrict`), and `task → Task` (`SetNull`) |

Three broken references against two, so worse by count — but not by consequence. Keeping it on hq orphans **bulk data**. Moving it leaves **dangling scalar references**: a session row pointing at a deleted user, agent or task. Small, detectable by a periodic check, and exactly the trade the split already accepts elsewhere for `Workspace.ownerId`.

Storage that grows silently is the worse failure.

### Decision

**`AgentSession` moves to site with its runs and transcript, and hq keeps a full copy of the session row.**

The copy is what preserves this ADR's conclusion: hq answers "whose session is this?" from its own table, with no round trip and without trusting the app that cannot enforce the rule. It also keeps session lists, the dashboard and the activity feed working while a site is unreachable.

**The whole row is copied, not a chosen subset.** It is roughly twenty small columns — the transcript is the large thing, and that stays on site. Choosing a subset only creates an argument later about which side of the line a new field falls on.

**Exactly one side writes each field.** This is the rule that keeps the copy from becoming the delta-sync system that was removed from this codebase:

| hq authoritative — written once, at creation | site authoritative — written by the runtime |
|---|---|
| `id`, `sessionKey`, `createdAt` | `title` (auto-named from the first message) |
| `userId`, `agentId`, `sessionType` | `status`, `model`, `metadata` |
| `taskId`, `primaryOwnerType` / `primaryOwnerId` / `primaryWorkspaceId` | the four token counters, `updatedAt`, `expiresAt` |

hq creates sessions — `createSession` is an hq action, and browsers only ever talk to hq — so nothing on site writes the left column and it cannot diverge. The right column reaches hq over the status stream the control channel already carries.

> *(annotated 2026-10-18)* The `createSession` action is gone with the chats from before. hq still creates every session: a
> task's when it is dispatched, and a conversation's workers through the conversation's lead.

The removed sync machinery needed cursors, tombstones and reconciliation because it was **bidirectional**: both sides could write the same field, so drift was possible and had to be resolved. One direction per field needs none of that. **If that rule ever slips, this becomes the thing that was deleted** — that is the line to watch in review, not the number of columns.

### Consequences

- **Deleting a session becomes a two-database operation.** The cascade is safe inside site, but hq's copy must also go. The extraction plan must say what detects a half-completed delete, rather than assuming both halves succeed.
- **Deleting a `User` or `Agent` stops being blocked.** Today the database refuses while sessions exist (`Restrict`); afterwards it succeeds and leaves dangling ids. A real behaviour change, and one that should be surfaced in the UI rather than discovered.
- The privacy rule and every path this ADR closed are unaffected — they read `userId` from hq, which still holds it.
- `AgentRun.agent → Agent` becomes a logical reference. That was true under either choice.
