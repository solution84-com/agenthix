---
created: 2026-09-25
description: The close-out register — every open item the unit surfaces, append-only, until each is fixed or raised as its own issue.
---

# Close-out Register · hq/site Split Close-out

**Plan:** [`plan.md`](plan.md) · **Spec:** [`spec.md`](spec.md)

Items this unit surfaces may stay open between phases; **none stays open past the close** (spec §3).
This register holds every one and replaces the plan's former Open items section.

## Rules

- **A row is the smallest thing that can be fixed, or raised as one issue, on its own.**
- **IDs are sequential, carry no meaning, and are never reused or renumbered.**
- **Append-only.** A row is never deleted or reworded. A new finding is a new row; retiring one means
  closing it.
- **Fields:** *Kind* — Bug, Debt, Feature or Chore, the org's issue types. *Status* — `open` or
  `closed`. *Resolution* — `—` while open; when closed, one of `fixed (commit)`, `raised as #N`,
  `not a fault`, or `moot`.
- **Nothing else lives here** — no priority, no grouping, no proposed order. Which items a pass takes,
  and why, is decided outside this file.
- A critical item — broken code, or a security risk — is fixed, or its issue is marked **Blocks
  release**.
- **An item that needs a design change corrects the spec in place.** No appended section and no note
  that it revises an earlier one — while the unit is open the spec reads as the design as it now
  stands, and git holds its history. The change of direction is recorded in the plan's Deviations. A
  decision record is never revised: a changed decision is a new record that supersedes it.
- Find an item with `grep -A 12 "^### R-014"`, and list what is open with `grep -B 3 "Status:\*\* open"`.

---

### R-001 · The QA scenario contract describes behaviour this unit removed

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (72a8016)

**The QA scenario contract describes behaviour this unit removed**, in several places and from more
than one phase: the cross-site refusals, the session-keyed container, the agent workspace mount and its
skills remap, the agent-addressed artefact route, the chat context field that went off the wire, and
the per-person memory mount an earlier phase removed. Phase 6 removed the scenario tags from tests that
had been retagged onto identifiers asserting the opposite, so no test now claims to fulfil a scenario
that contradicts it — but the scenarios themselves are for the close-out audit, which writes contracts
against finished behaviour

---

### R-002 · The file-sharing concept document describes removed mechanisms

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (3b79fe9)

*From “Two concept documents describe removed mechanisms”:* The file-sharing document still documents the agent-addressed artefact route, the path artefacts used to live at, an immutability claim the read-write mount makes false, and two tools that do not exist in the code. Its staleness note names one unrelated thing and says the core model is current, so it reads as authoritative for exactly the parts that are wrong.

---

### R-003 · The prompt-builder concept document still names the removed chat context field

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (3b79fe9)

*From “Two concept documents describe removed mechanisms”:* The prompt-builder document still names the chat context field that was removed.

---

### R-004 · A decision record still says CPU quotas remain unset

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (73e7fc3)

*From “Two decision records have risks this phase resolved, and neither is annotated”:* One still says CPU quotas remain unset; this phase set one. A record is annotated, never revised.

---

### R-005 · A decision record's residue-between-runs annotation should say processes as well as files

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (73e7fc3)

*From “Two decision records have risks this phase resolved, and neither is annotated”:* The other's residue-between-runs risk is closed by this phase's reset, and its annotation should say processes as well as files, because the reset now terminates what a run left running before clearing what it wrote. A record is annotated, never revised.

---

### R-006 · The member folder holds only the agenda

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

**The member folder holds only the agenda.** The design gives it a person's drafts too; nothing writes
them yet

---

### R-007 · A container reused after a slow reset

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (3da3633)

**A container reused after a slow reset.** When the reset's deadline passes, the command is abandoned
rather than cancelled, so the container's cached signature is invalidated and the next run recreates
it. A daemon that resolves the abandoned request after the recreate could still reach the replacement —
strictly better than the guaranteed reuse it replaces, and untested

---

### R-008 · hq lists workspaces when it mints a capability; site lists them at run start

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (1fe70d3)

**hq lists workspaces when it mints a capability; site lists them at run start.** A workspace created
*and* blocked inside that window is mounted without a policy check. Pre-existing and structural — the
old task-run path had the same two-listing shape — but nobody had written it down

---

### R-009 · The VPS environment example is gitignored

- **Kind:** Chore
- **Status:** closed
- **Resolution:** moot — the VPS files it names were removed with the old deployment (ad7083e)

**The VPS environment example is gitignored**, so guidance added to it does not travel. Whether that
example should be tracked the way its two siblings are is a decision about the ignore rule rather than
about one file

---

### R-010 · Every mount segment is held by convention, not construction

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (7b262a4) for files, workspaces, members and tasks; the knowledge segment is R-167

**Every mount segment is held by convention, not construction.** The mount resolver builds its
container paths by its own concatenation and does not call the path module, so renaming a directory in
both mirrored copies keeps the drift test green while the agent writes one name and hq reads another.
The artefacts segment is now pinned by a test; the others are not

---

### R-011 · hq's reach into a site's disk is narrowed, not ended, and the phase says so

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

**hq's reach into a site's disk is narrowed, not ended, and the phase says so.** hq performs no
filesystem operation under an Execution Site's root on behalf of anything crossing the control
channel — a location is named by its owner and the site holding it is asked. **Six expressions
remain**, each named in `hq/src/server/siteRoot.ts`. Three reach the root through that module: the
one-time boot relocation, which reads and then empties four directories beneath it; preview's path
builders, whose result goes to `docker run -v` and is therefore a write path; and the dispatch
payload's `roadmapPath` — the one site-root path that does cross the channel, as an opaque string
the site derives nothing from rather than as an operation. Three more reach a site's disk through
the container-side path rather than the root, and none crosses the channel: the kernel's credential
bind in the voice cache, and both halves of onboarding — the credentials path an operator is shown
and the bind in `pingRuntime`. Preview ends with Phase 9, whose deliverable is that hq starts no
containers; the relocation ends when it is no longer needed

---

### R-012 · Preview's copy of the storage layout is deliberately unguarded

- **Kind:** Debt
- **Status:** closed
- **Resolution:** moot — preview no longer lives in hq (d4a5493)

**Preview's copy of the storage layout is deliberately unguarded.** A drift test would make it look
sanctioned. Confirmed by mutation: the layout can be changed on the site with every test in both
apps still passing

---

### R-013 · An agent is handed an attachment link it cannot fetch

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (5510bde)

**An agent is handed an attachment link it cannot fetch.** `attach_file` returns a URL to the agent
that called it, and an agent carries a run capability rather than a session, so it answers 401. True
before this phase, which only makes the refusal deliberate rather than accidental. What an agent may
read back over the channel is undecided

---

### R-014 · A stale `index.lock` wedges a location permanently

- **Kind:** Bug
- **Status:** closed
- **Resolution:** raised as its own issue

**A stale `index.lock` wedges a location permanently.** After a shutdown kill mid-write, every later
repository operation there fails, the reason only in the site's log, the remedy needing machine
access, and retrying never clears it. Silent to the person who hits it

---

### R-015 · hq's browser task and board operations are still ungated for a private project's contents

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (de24728)

**hq's browser task and board operations are still ungated for a private project's contents** —
`getBoard`, `getAllBoards`, `getBacklogTasks`, `updateTask`, `archiveTask`, `deleteTask`,
`createTask`, `addTaskComment`, `runTask`, `createBoard`. §8.3b owns them. This is what keeps the
control plane's remaining scope checks defensible: their stated justification is that the person
could reach the same data in the browser, which stays true only while these are open

---

### R-016 · A site that is killed outright still orphans git

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

**A site that is killed outright still orphans git**, and a shutdown handler registered after this
module's would have its own shutdown cut short. Neither is coverable in pure node

---

### R-017 · A credential-bearing repository URL would sit in the process table

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (93b7a76)

**A credential-bearing repository URL would sit in the process table**, and the askpass script
answers the username prompt with the token as well, which proxies log in plaintext. Neither is
reachable today because hq builds the URL

---

### R-018 · hq's integration suite is not reliably green under contention

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (64e0134)

**hq's integration suite is not reliably green under contention.** Two runs failed with Postgres
`TRUNCATE` deadlocks — 21 tests, then 6, different files — and five consecutive runs since have
passed, as has `main` in the same environment. Not attributable to this branch. The suite runs
serially by configuration, so the contention comes from outside it

---

### R-019 · A decision record names a provisioning function that exists nowhere but in that record

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (550333b)

*From “Two decision records are now wrong and need annotating”:* one names a provisioning function that exists nowhere but in that record, and gives storage homes to two owner kinds a later record removed. A record is never revised, so each needs a deliberate annotation.

---

### R-020 · A decision record's annotation is wrong about unguessable-URL authentication and a deleted config endpoint

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (550333b)

*From “Two decision records are now wrong and need annotating”:* the other's annotation is wrong about unguessable-URL authentication and about a config endpoint this phase deleted. A record is never revised, so each needs a deliberate annotation.

---

### R-021 · A concept document describing agent file serving is wholesale wrong

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (550333b)

**A concept document describing agent file serving is wholesale wrong** — a public no-auth file
route, site-key config editing, public images — and it carries the same "the core model is current"
note this phase removed from its sibling. A decision record points at it as the convention reference

---

### R-022 · A QA domain's file list names a directory that does not exist

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (72a8016)

**A QA domain's file list names a directory that does not exist**, so the whole list is stale rather
than one entry

---

### R-023 · @SC-142 and @SC-246 have no implementation

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (72a8016)

**`@SC-142` and `@SC-246` have no implementation**, both describing behaviour this phase deleted.
`@SC-244` was re-attached to coverage that moved to the site

---

### R-024 · An agent's Claude home is shared across everyone who talks to it

- **Kind:** Bug
- **Status:** closed
- **Resolution:** moot — accepted and documented (dc57f58)

**An agent's Claude home is shared across everyone who talks to it** — the directory is bound
read-write into every container for that agent whoever invoked the run, and the runtime persists
each run's session there, including the prompt with that person's memory in it. So a later run by
a different person can read it. The channel already carries the whole conversation, so this is not
new exposure, but ADR-0058's "an agent's memory of a person never reaches another person's run"
now leans on a boundary that mount does not honour. Phase 6 removes agent-scoped mounts outright
(§6.1 rule 6) and §5.2/§5.3 decide where an agent's own writes go. **Check this again when Phase 6
closes**: it should be gone with the mount, and if it is not, it needs its own fix before the unit
closes

---

### R-025 · The spec implies an agent owns its layer; the person owns both

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (550333b)

**The spec implies an agent owns its layer; the person owns both** — §6.1's table says the
per-agent layer is "written by: that agent, as it works", and ADR-0058 repeats it once. The user
settled this: the person owns their memory throughout, and "agent memory" names only its scope —
it is the person's memory for that one agent, reachable by nobody else. The built behaviour already
matches (a person adds, edits, deletes and promotes in either layer, and each item records whether
the agent or the person wrote it), so nothing is blocked. **Wording to correct at the polish
phase:** §6.1's table, the agent-facing description of the recording tool ("yours alone", whose
next clause already contradicts it), and an annotation on ADR-0058 — a record is written once, so
it is annotated rather than revised. Consider showing each item's writer in the interface, which is
stored and not displayed

---

### R-026 · Comments elsewhere cite rulings from plans that are not in this repository

- **Kind:** Chore
- **Status:** closed
- **Resolution:** raised as its own issue

**Comments elsewhere cite rulings from plans that are not in this repository** — several files
outside this phase carry identifiers from earlier plans' working notes, which are gitignored and so
unresolvable to anyone who clones this. Two were corrected in passing; the rest want a sweep of
their own

---

### R-027 · Nothing proves the interface refreshes after a write

- **Kind:** Chore
- **Status:** closed
- **Resolution:** raised as its own issue

**Nothing proves the interface refreshes after a write** — the memory list's update after adding,
editing, promoting or deleting rests on the framework's entity invalidation, which a test that
mocks the operations module necessarily mocks away. It is on the walkthrough instead

---

### R-028 · The concurrency test needs twenty database connections

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (64e0134)

**The concurrency test needs twenty database connections** — fewer, and a pool timeout surfaces as a
confusing assertion failure rather than an obvious infrastructure problem. Commented, not solved

---

### R-029 · Hand-written runtime mirrors of core's types

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (64e0134)

**Hand-written runtime mirrors of core's types** — site validates the dispatch payload with a zod
schema that no type relates to `RunContextPayload`, and the same pattern exists for other channel
methods. The dispatch one is now pinned by a drift test; the others are not, and the same silent
break is available to any of them

---

### R-030 · A second React in `ui/node_modules`

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

**A second React in `ui/node_modules`** — `react`, `react-dom` and `lucide-react` are
peerDependencies of `@agenthix/ui`, and npm installs peers, so a `ui` component rendered from
hq's test runner binds to that second copy and every hook reads a null context. Aliasing around
it in `hq/vitest.config.ts` works but leaves the run unable to exit. The last-admin display rule
is therefore tested as a rule (`isLastAdmin`) rather than a render, and no `ui` component has a
render test

---

### R-031 · @SC-199 and @SC-309 need retiring

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (72a8016)

**`@SC-199` and `@SC-309`** — the product wiki scenario now has no test (the spec was deleted, the
feature never existed) and the `list_products` scenario asserts a pin to the acting agent that no
longer exists. Both need retiring at the unit's close

---

### R-032 · A VIEWER is a member of every open project

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (5510bde)

**A VIEWER is a member of every open project** — so a VIEWER can start runs in one. That is what
open means, and §6.4 leaves "whether a reader class is wanted" open rather than deciding it

---

### R-033 · A suspended site's held tasks say "held for reconnect"

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (f53a0bc, face845)

**A suspended site's held tasks say "held for reconnect"** — a task queued for a site with a version
mismatch is held correctly, but its reason names a reconnect rather than an upgrade. The reason
string is matched by the drain, the claim, the re-hold and the revoke sweep, so it cannot change
without a separate field for what is displayed

---

### R-034 · Content handlers must end their half

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (6929192)

**Content handlers must end their half** — a site-side content handler that resolves without ending
its writable side leaves the stream open until the connection drops, and one that reads with
`for await` destroys the stream before it can reply. Neither is reachable while the registry is
empty; the contract needs stating when Phase 5b adds the first handler

---

### R-035 · A stale mismatch write

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (f53a0bc)

**A stale mismatch write** — two site processes on one credential can race, and a mismatch recorded
by one can land after the other has been marked online

---

### R-036 · Content transport tests not written

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (f53a0bc, face845)

**Content transport tests not written** — the site stopping mid-handshake, the store clearing a
mismatch when a site comes online, and a site-side buffer overflow

---

### R-037 · hqConnection.ts is over 400 lines

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

**`hqConnection.ts` is over 400 lines** — the control channel's connection manager on the site, past
the point where it should be split

*From “Smaller Phase 11 leftovers”:* the site's connection module is at 455 lines.

---

### R-038 · A project's override files can be written by the agents running there

- **Kind:** Bug
- **Status:** closed
- **Resolution:** moot — accepted and documented (dc57f58)

**A project's override files can be written by the agents running there** — any agent running in a
project can write `.agenthix/agents/<any agent id>/instructions.md` in the project's files, and that
text joins that agent's prompt on every later run there, with no admin involved. Tools and autonomy
still come from hq, so capability is not widened. §6.2 puts these overrides on the boundary's disk;
whether agents should be able to write them is undecided

---

### R-039 · An agent authoring a skill for itself has no tool

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

*From “Packages not yet built”:* an agent authoring a skill for itself has no tool (§6.2).

---

### R-040 · A boundary cannot pin a package version

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

*From “Packages not yet built”:* a boundary cannot pin a version.

---

### R-041 · A library skill added by a newer hq is not installed into an existing org's package

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

*From “Packages not yet built”:* a library skill added by a newer hq is not installed into an existing org's package.

---

### R-042 · There is no project-wide skill for every agent

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

*From “Packages not yet built”:* there is no project-wide skill for every agent.

---

### R-043 · There is no control to remove an org skill

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

*From “Packages not yet built”:* there is no control to remove an org skill.

---

### R-044 · A deleted agent's package versions are kept

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (92f9df7)

*From “Packages not yet built”:* a deleted agent's package versions are kept.

---

### R-045 · The `Agent` row still holds behaviour columns

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

**The `Agent` row still holds behaviour columns** — written only when a version is published; Phase 8
drops them

---

### R-046 · The override form offers pricier models

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (f560b4e)

**The override form offers pricier models** — choosing one is refused only when saving

---

### R-047 · Shipped assets name removed tools

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (6a3d6a1)

**Shipped assets name removed tools** — `request_product_git` and `request_project_git` in a platform
skill and in workforce templates' tool lists

---

### R-048 · The proc-descriptor check is skipped on Linux CI

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (3da3633)

*From “Package and override residuals”:* the proc-descriptor check is skipped on Linux CI.

---

### R-049 · Hard links are outside the link rule

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (3da3633)

*From “Package and override residuals”:* hard links are outside the link rule.

---

### R-050 · The skills staging folder sits in a folder the container can write

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (3da3633)

*From “Package and override residuals”:* the skills staging folder sits in a folder the container can write.

---

### R-051 · An import onto an existing agent publishes and then renames outside one transaction

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (e8abdac)

*From “Package and override residuals”:* an import onto an existing agent publishes and then renames outside one transaction.

---

### R-052 · The archive reader uses JSZip internals and caps entries only after parsing

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

*From “Package and override residuals”:* the archive reader uses JSZip internals and caps entries only after parsing.

---

### R-053 · A capability's workspace list and its override follow different projects

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (4183392)

*From “Package and override residuals”:* a capability's workspace list follows the session's stored project while its override follows the task's current one.

---

### R-054 · An autonomy-only edit that resubmits a now-pricier model override is refused

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (ee0ef7b)

*From “Package and override residuals”:* an autonomy-only edit that resubmits a now-pricier model override is refused.

---

### R-055 · Source files past the size marks: dispatchService.ts, runtimeData.ts, queries.ts, workforceTemplateService.ts, skillStaging.ts

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

**File size** — `dispatchService.ts` is 491 lines (the next change there splits it first),
`runtimeData.ts` 429, `queries.ts` 402, `workforceTemplateService.ts` 330 and `skillStaging.ts` 320

---

### R-056 · A skipped run, a reconnect reconciliation and a throwing capability check never deliver the site's title to hq

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (9901cc1)

*From “Session titles”:* a skipped run, a reconnect reconciliation, and a capability check that throws before a run starts never deliver the site's title to hq's copy.

---

### R-057 · A rename in the gap before a deferred run's final frame can still be overwritten

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (9901cc1)

*From “Session titles”:* a rename in the gap before a deferred run's final frame is sent can still be overwritten.

---

### R-058 · Revoking a site: a chat mid-reply keeps showing "sending" until reload

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (f53a0bc)

*From “Revoking a site”:* a chat mid-reply keeps showing "sending" until reload.

---

### R-059 · Revoking a site: hq's copies of task sessions stay unarchived

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (f53a0bc)

*From “Revoking a site”:* hq's copies of task sessions stay unarchived.

---

### R-060 · Revoking a site: heartbeats for agents homed on it keep firing and failing

- **Kind:** Bug
- **Status:** closed
- **Resolution:** moot — agents no longer have a home site

*From “Revoking a site”:* heartbeats for agents homed on the site keep firing and failing.

---

### R-061 · Revoking a site: a late deferred-approval frame can move a failed task to blocked

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (ee0ef7b)

*From “Revoking a site”:* a late deferred-approval frame can move a failed task to blocked.

---

### R-062 · Revoking a site: the sweep can trigger the next task twice

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (f53a0bc)

*From “Revoking a site”:* the sweep can trigger the next task twice.

---

### R-063 · Revoking a site: the sweep reads every running or held task in the org rather than filtering by site

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (f53a0bc)

*From “Revoking a site”:* the sweep reads every running or held task in the org rather than filtering by site.

---

### R-064 · A reassigned task in a project with no site resolves the old agent's site

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (f22b6de)

*From “Session ownership gate”:* a reassigned task in a project with no site resolves the old agent's site.

---

### R-065 · Session owner lookups are cached for 60 seconds

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

*From “Session ownership gate”:* owner lookups are cached for 60 seconds.

---

### R-066 · A stream of foreign frames logs every frame

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (ee0ef7b)

*From “Session ownership gate”:* a stream of foreign frames logs every frame.

---

### R-067 · The session ownership gate's concurrency test is sequential

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (64e0134)

*From “Session ownership gate”:* its concurrency test is sequential.

---

### R-068 · taskId is not covered by the location access rule

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (e8abdac)

**Storage access** — `taskId` is not covered by the location access rule (same owner only)

---

### R-069 · A malformed sections payload returns an error instead of falling back

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (ee0ef7b)

*From “Prompt preview”:* a malformed `sections` payload returns an error instead of falling back.

---

### R-070 · No site test for prompt preview in task mode or for a heartbeat with no sections

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (7b262a4)

*From “Prompt preview”:* no site test for task mode or a heartbeat with no sections.

---

### R-071 · TaskRunner.ts and AgentEngine.ts are past the size marks

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (f53a0bc, 9901cc1)

**File size** — `TaskRunner.ts` is 477 lines and `AgentEngine.ts` 403

---

### R-072 · Tests that check source text

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (9901cc1)

**Tests that check source text** — the comment-absence, dial-out-absence and title-writer tests pin text
rather than behaviour

---

### R-073 · hq still provisions a SiteSecret of type HQ

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (6a3d6a1)

*From “Pre-split leftovers outside §4.7”:* hq still provisions a `SiteSecret` of type `HQ`.

---

### R-074 · hq keeps the inert siteKeyAuth middleware

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (6a3d6a1)

*From “Pre-split leftovers outside §4.7”:* keeps the inert `siteKeyAuth` middleware.

---

### R-075 · core still carries hqUserId types

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (6f31ed0)

*From “Pre-split leftovers outside §4.7”:* `core` still carries `hqUserId` types.

---

### R-076 · CLAUDE.md's destructive-migration command is untested

- **Kind:** Chore
- **Status:** closed
- **Resolution:** raised as its own issue

**Destructive migrations** — CLAUDE.md's `echo "y" | wasp db migrate-dev` is still untested: Task 1.10's
attempts failed to connect to the dev database and never reached Prisma's prompt. Run it against a
reachable database before changing the instruction, since it is reported to have worked before

---

### R-077 · QA contract: SC-132, SC-133 and SC-140 describe removed code, and the QA domain file names removed things

- **Kind:** Chore
- **Status:** closed
- **Resolution:** moot — the code the row names still exists; the contract was corrected (72a8016)

**QA contract** — scenarios SC-132 and SC-133 describe deleted code, SC-140 names hq's removed naming
service, and `docs/qa/domains/site.md` names the removed dial-out client and naming service (task 8.2)

---

### R-078 · Avatar and cover images

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (80faa96)

**Avatar and cover images** — the 31 bundled presets carry no licence or source information, and are
JPEGs named `.png`; check both before the repository goes public

---

### R-079 · SVG presets

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (6a3d6a1)

**SVG presets** — the agent preset tool accepts `.svg`, and the image route refuses it; no bundled
preset is an SVG today

---

### R-080 · refreshGithubInstallations has no sign-in check

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (20536c7)

*From “Holes found while planning Phase 2, after its scope froze — operations with no sign-in or ownership check”:* `refreshGithubInstallations` has no sign-in check.

---

### R-081 · disconnectGithubApp has no role floor and deletes every GitHub App and installation row

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (20536c7)

*From “Holes found while planning Phase 2, after its scope froze — operations with no sign-in or ownership check”:* `disconnectGithubApp` has no role floor and deletes every GitHub App and installation row.

---

### R-082 · Any signed-in user can importAgent with handle kernel and overwrite the kernel

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (009f2ef) — importing an agent now needs an admin; an admin can still import handle kernel

*From “Holes found while planning Phase 2, after its scope froze — operations with no sign-in or ownership check”:* any signed-in user can `importAgent` with handle `kernel` and overwrite the kernel's settings, identity files and skills.

---

### R-083 · Wasp api routes were not scanned for a missing sign-in check

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (310ee31): the api routes were scanned; the plain Express routes are R-202

*From “Holes found while planning Phase 2, after its scope froze — operations with no sign-in or ownership check”:* A scan of all 190 operations in `hq/main.wasp` found no other missing sign-in check beyond Phase 2's; Wasp `api` routes were not scanned.

---

### R-084 · updateProject has no role floor and writes client fields straight to the database

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (219c615, 9202dd5)

*From “Holes found while planning Phase 2, after its scope froze — client fields written straight to the database”:* `updateProject` (no role floor — a signed-in user can change a project's site or id, or write relations).

---

### R-085 · The browser updateProduct and updateProgram actions write client fields straight to the database

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (20536c7)

*From “Holes found while planning Phase 2, after its scope froze — client fields written straight to the database”:* the browser `updateProduct` and `updateProgram` actions.

---

### R-086 · updateAgent writes isKernel and homeSiteId straight to the database

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (009f2ef)

*From “Holes found while planning Phase 2, after its scope froze — client fields written straight to the database”:* `updateAgent` (`isKernel`, `homeSiteId`).

---

### R-087 · An agent rename writes workspace/.git/config through a planted link

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (92f9df7, 009f2ef)

*From “Holes found while planning Phase 2, after its scope froze — paths built from unchecked input, and links an agent plants”:* an agent rename writes `workspace/.git/config` through a planted link.

---

### R-088 · createDirectory checks only that the path text starts with agents, and follows links

- **Kind:** Bug
- **Status:** closed
- **Resolution:** moot — the operation was deleted (dc91794)

*From “Holes found while planning Phase 2, after its scope froze — paths built from unchecked input, and links an agent plants”:* `createDirectory` checks only that the path text starts with `agents` and follows links.

---

### R-089 · deleteAgent's best-effort removal can leave a folder, links included, for the next agent with that handle

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (92f9df7)

*From “Holes found while planning Phase 2, after its scope froze — paths built from unchecked input, and links an agent plants”:* `deleteAgent`'s best-effort removal can leave a folder, links included, for the next agent with that handle.

---

### R-090 · A second loose parseRepo in githubClient.ts

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (6f31ed0)

*From “Holes found while planning Phase 2, after its scope froze — also noticed”:* a second loose `parseRepo` in `hq/src/server/github/githubClient.ts`.

---

### R-091 · Repos linked before task 2.14 keep a raw URL the site's credential lookup cannot find

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (f560b4e)

*From “Holes found while planning Phase 2, after its scope froze — also noticed”:* repos linked before task 2.14 keep a raw URL site's credential lookup cannot find.

---

### R-092 · deleteProject leaves projects/<id>/ on disk

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (1fe70d3)

*From “Holes found while planning Phase 2, after its scope froze — also noticed”:* `deleteProject` leaves `projects/<id>/` on disk.

---

### R-093 · projectService.ts is 705 lines

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (face845)

*From “Holes found while planning Phase 2, after its scope froze — also noticed”:* `projectService.ts` is 705 lines.

---

### R-094 · The create-agent form still offers handles the server refuses

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (19bfdf1)

*From “Holes found while planning Phase 2, after its scope froze — also noticed”:* the create-agent form still offers handles the server refuses after 2.15.

---

### R-095 · siteEventHandler.ts duplicates the handle rule

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (ee0ef7b)

*From “Holes found while planning Phase 2, after its scope froze — also noticed”:* `siteEventHandler.ts` duplicates the handle rule.

---

### R-096 · The site's own writes under agent folders were not examined

- **Kind:** Chore
- **Status:** closed
- **Resolution:** moot — the site writes nothing under agent folders any more (92f9df7)

*From “Holes found while planning Phase 2, after its scope froze — also noticed”:* site's own writes under agent folders were not examined.

---

### R-097 · hq's real-path checks leave a check-then-use race

- **Kind:** Bug
- **Status:** closed
- **Resolution:** raised as its own issue

*From “Phase 2 residuals”:* hq's real-path checks leave a check-then-use race (a folder swapped for a link between the check and the read or write).

---

### R-098 · In subprocess mode an agent can replace a location's or its workspace's root itself

- **Kind:** Bug
- **Status:** closed
- **Resolution:** moot — subprocess mode is the development mode, with no isolation at all; the deployed compose file turns isolation on

*From “Phase 2 residuals”:* in subprocess mode, where no container mounts the folders, an agent can replace a location's or its workspace's root itself.

---

### R-099 · Repo URLs stored in http:// or www.github.com form no longer resolve in Operations until relinked

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (f560b4e)

*From “Phase 2 residuals”:* repo URLs stored in `http://` or `www.github.com` form before task 2.14 no longer resolve in Operations until relinked.

---

### R-100 · "Path not allowed" is 403 on agent config and image writes but 400 on skill writes

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (e8abdac)

*From “Phase 2 residuals”:* "Path not allowed" is 403 on agent config and image writes but 400 on skill writes.

---

### R-101 · Link resolution in the file listing runs one at a time

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (93b7a76)

*From “Phase 2 residuals”:* link resolution in the file listing runs one at a time.

---

### R-102 · The task-archive log no longer names the task's final state

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (ee0ef7b)

*From “Phase 2 residuals”:* the task-archive log no longer names the task's final state.

---

### R-103 · The owner-lookup retry test spends real time

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (ee0ef7b)

*From “Phase 2 residuals”:* the owner-lookup retry test spends real time.

---

### R-104 · Two profile regexes must stay in step

- **Kind:** Debt
- **Status:** closed
- **Resolution:** moot — the profile frontmatter sync is gone (009f2ef)

*From “Phase 2 residuals”:* two profile regexes must stay in step.

---

### R-105 · realPathWithin.ts depends on agent path helpers

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (92f9df7, dc91794)

*From “Phase 2 residuals”:* `realPathWithin.ts` depends on agent path helpers.

---

### R-106 · A capability has no field naming the boundary a run acts as

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

**A capability has no field naming the boundary a run acts as** — `role` doubles as that signal, so
the git-credential gate infers "this run acts as this person" from a non-null role plus a matching
user id, an invariant owned by capability minting and not checkable where it is relied on. It is
pinned by a test rather than by a type. Making it explicit changes a signed-token contract a site
verifies, so it is the user's call rather than a fix round's

---

### R-107 · A task key is an existence oracle

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (5510bde)

**A task key is an existence oracle** — reading a task by its readable key answers 404 before the
membership check, so any signed-in person can learn whether a project key exists. The same
convention the project lookup already uses; hiding it is a surface-wide decision, not one
operation's

---

### R-108 · Whether "a run happened against a private project" is itself sensitive

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (5510bde)

**Whether "a run happened against a private project" is itself sensitive** — the activity summary
no longer names the project, but run-completed and session-started entries still say a run
happened, and the same question reaches the top-agent list and the run statistics. A policy
question the spec does not answer

---

### R-109 · A caller-supplied assigned agent is unchecked

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (face845)

**A caller-supplied assigned agent is unchecked** — creating or updating a task accepts an agent id
with nothing confirming that agent is assigned to the task's project. The same shape as the
destination-board hole, but not an authority hole under ADR-0060, since a run's reach comes from
its boundary rather than from which agent it is. Worth a deliberate look

---

### R-110 · A non-member gets 404 from a chat session and 403 from a task session

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (47dfc00)

**A non-member gets 404 from a chat session and 403 from a task session** — both defensible per
rule, because they are two different rules rather than two answers to one question. The contract
should say which it wants; making it uniform means editing scenario-tagged tests, which is the
close-out audit's work

---

### R-111 · The org skill library page renders controls nobody but an admin may use

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (f560b4e)

**The org skill library page renders controls nobody but an admin may use** — create, update,
delete and install are shown to every signed-in person while all four require an org admin on the
server. Two of the four already behaved that way before this phase. Gating the page is product work
with its own shape

---

### R-112 · A subscription's expiry is parsed assuming milliseconds or ISO

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (a6c24b7)

**A subscription's expiry is parsed assuming milliseconds or ISO** — if Claude Code writes epoch
seconds, the stored expiry is wrong by decades. Display-only today, and it needs one real
credentials document to settle

---

### R-113 · A session pointing at a deleted task falls through to location resolution

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (e8abdac)

**A session pointing at a deleted task falls through to location resolution** — the run-boundary
resolver returns a project only while the task row exists, so such a session could present as a
person's boundary. Pre-existing, and the one seam in the invariant the resolver leans on

---

### R-114 · The refresh event's owner check is per-site, not per-run

- **Kind:** Bug
- **Status:** closed
- **Resolution:** moot — accepted and documented (dc57f58)

**The refresh event's owner check is per-site, not per-run** — it proves the claimed person's
storage placement names the connecting site, not that any run acted as that person. A compromised
site could overwrite the hq copy of the subscription of every person whose storage it holds; the
strictly-increasing expiry guard narrows it. Narrowing it properly means carrying a run id or the
run's capability on the event, which is a decision about the wire and made once

---

### R-115 · Two agents in one boundary share Claude Code's whole home read-write

- **Kind:** Bug
- **Status:** closed
- **Resolution:** moot — accepted and documented (dc57f58)

**Two agents in one boundary share Claude Code's whole home read-write** — not only the credential,
but settings, session transcripts and history. One agent can read another's earlier transcripts in
that boundary, and a settings file one run writes applies to every other agent's run there.
Person-to-person isolation was never present, so this is a re-partition rather than a new class of
exposure, but agent-to-agent isolation inside a boundary is genuinely lost, and ADR-0057's
container-per-boundary is what implies it

---

### R-116 · A refreshed token whose send drops on a closed channel is destroyed

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (3da3633)

**A refreshed token whose send drops on a closed channel is destroyed** — the end-of-run removal
takes it, where before it survived on disk for the next run. Silent, and it only bites a long run
whose hq copy has since expired

---

### R-117 · The end-of-run credential removal sits outside the deadline

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (3da3633)

**The end-of-run credential removal sits outside the deadline** that bounds the rest of the
container work, so a wedged mount could hold the queue slot that bound exists to protect

---

### R-118 · The model API key is still passed on `docker run`'s argv

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (3da3633)

**The model API key is still passed on `docker run`'s argv**, so it is visible in the host's process
table and in `docker inspect`. Predates this phase

---

### R-119 · The heartbeat's container and home are still keyed by the agent's handle

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

**The heartbeat's container and home are still keyed by the agent's handle** — the one remaining
agent-keyed thing, left that way while it is undecided whether the heartbeat survives the storage
boundary model at all

---

### R-120 · projectService.ts, sessions/actions.ts and sessionActions.integration.test.ts are past the size marks

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (face845)

**File size** — `projectService.ts` is 775 lines and `sessions/actions.ts` 449, both past the
repository's marks; `sessionActions.integration.test.ts` is 683 lines and pre-existing. The next
change in each splits it first

---

### R-121 · The kill-switch scenario asserts the ungated behaviour as known-bad, and its one test is skipped

- **Kind:** Chore
- **Status:** closed
- **Resolution:** moot — the test is not skipped and already asserts admin-only; the scenario text was corrected (72a8016)

*From “QA contract, from this phase”:* the kill-switch scenario asserts the ungated behaviour as known-bad and its one test is skipped rather than rewritten.

---

### R-122 · The dead-grant scenario's second half describes the seed-and-write-back pair this phase deleted

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (72a8016)

*From “QA contract, from this phase”:* the dead-grant scenario's second half describes the seed-and-write-back pair this phase deleted and needs revising to name hq as the holder and the boundary home as the destination.

---

### R-123 · A scenario-tagged test title still names the removed per-run key field

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (7b262a4)

*From “QA contract, from this phase”:* a scenario-tagged test title still names the removed per-run key field.

---

### R-124 · A dynamic-only import breaks the server bundle, silently to every check the repository runs

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (64e0134)

**A dynamic-only import breaks the server bundle, silently to every check the repository runs** —
a module nothing imports statically becomes a second Rollup chunk, and the generated server bundles
to `output.file`, which refuses more than one. `tsc --noEmit` passes, `wasp build` passes because
it never runs the bundle step, and only booting the app shows it. Worth a check that fails on it
rather than a convention nobody can see

---

### R-125 · The approval page's "Connecting from" address can be faked, from Phase 11

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (6f00c16) — the trusted proxy count is one setting, HQ_TRUSTED_PROXIES

**The approval page's "Connecting from" address can be faked, from Phase 11.** hq trusts one
proxy hop, so when nothing sits in front of it a caller sets the address through
`X-Forwarded-For` — on the page ADR-0064 names as the admin's only way to tell their own machine
from someone else's, and in the per-address throttles on the two approval endpoints. The proxy
setting predates Phase 11; it matters now because approval relies on it. Either make the trusted
hop count configurable, or show the socket address beside the forwarded one

---

### R-126 · hq's browser tests cannot run on a database that was never onboarded, from Phase 11

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

**hq's browser tests cannot run on a database that was never onboarded, from Phase 11.** The e2e
seed creates users but no organisation, so enrolling a site throws and the rewritten approval tests
fail; the placement test expects 400 where Phase 4's admin check now answers 403; and the e2e
cleanup script names tables that moved to the site. The approval flow itself passes in the
cross-app tier; its two browser tests have not yet passed anywhere

---

### R-127 · The first request for an approval code is not retried on a network blip

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (93b7a76)

*From “Smaller Phase 11 leftovers”:* the first request for an approval code is not retried on a network blip, though polling is.

---

### R-128 · The invite and approval rate limiter reads then writes, and its rows are never cleared

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (e8abdac)

*From “Smaller Phase 11 leftovers”:* the invite and approval rate limiter reads then writes rather than counting atomically, and its rows are never cleared.

---

### R-129 · A site whose socket path exceeds the Unix length limit boots without its control socket

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (8884c0f) — a site whose socket path is too long refuses to start

*From “Smaller Phase 11 leftovers”:* a site whose socket path exceeds the Unix length limit (104 bytes on macOS) boots without its control socket and only logs it.

---

### R-130 · A second site started on the same SITE_ROOT silently takes over the first one's socket

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (93b7a76)

*From “Smaller Phase 11 leftovers”:* a second site started on the same `SITE_ROOT` silently takes over the first one's socket.

---

### R-131 · Unregistering is covered by unit tests but not by the cross-app tier

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (64e0134)

*From “Smaller Phase 11 leftovers”:* unregistering is covered by unit tests but not by the cross-app tier.

---

### R-132 · A leaked credential still does not expire on its own

- **Kind:** Feature
- **Status:** closed
- **Resolution:** fixed (423f3a9)

*From “Three issues the unit worked on are only partly resolved, and stay open for the close-out”:* the credential-rotation issue asks that a leaked credential expire on its own, which spec §6.8 declined (the machine credential has no lifetime) — the issue needs that ruling recorded against it, or an expiry built; the rotate endpoint also leaves channels open on the old credential, and a leaked credential can itself rotate the real site out.

---

### R-133 · Stopping all sessions is not scoped to the caller

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (face845)

*From “Three issues the unit worked on are only partly resolved, and stay open for the close-out”:* an issue asks that stopping all sessions be scoped to the caller, which Phase 8 declined (org-wide, gated to the admin); its skipped scenario test still asserts the old ungated behaviour.

---

### R-134 · Invite tokens and the site's machine credential are stored in plaintext

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (423f3a9)

*From “Three issues the unit worked on are only partly resolved, and stay open for the close-out”:* the plaintext-secrets issue still has invite tokens stored in the clear and returned whole by the invite list, and the site keeps its machine credential in plaintext in its own database

---

### R-135 · `SITE_ADMIN_KEY` leftovers after the bootstrap-only fix

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (423f3a9)

**`SITE_ADMIN_KEY` leftovers after the bootstrap-only fix** — two simultaneous bootstrap requests could both
create an admin, and the settings page still lists the key as always required

---

### R-136 · The org-wide fallback credential only ever takes an API key

- **Kind:** Feature
- **Status:** closed
- **Resolution:** fixed (e8bb1ee)

**The org-wide fallback credential only ever takes an API key.** `hq/src/server/identity/modelCredential.ts`'s `orgApiKey()` reads `Provider` (`service: 'llm'`), which has no subscription form. A single-person org that wants their own subscription to serve as the org default has no way to do it, and a project or task run has nothing to fall back to when no API key is set anywhere. Spec §6.3 states the reason a subscription is person-only as a deliberate rule, reasoned from the provider's own subscription terms ("a personal subscription covers that person's own use... the person accepts the terms that come with it") — so extending it is not only a schema and resolution change, it reopens that rule and its terms-of-service reasoning. Whoever picks this up needs to settle whether a solo-org owner running every run through their own subscription is genuinely within the provider's terms, not only build it

---

### R-137 · Registering a site while hq keeps running leaves two Execution Site rows, and the wrong one is offered by default

- **Kind:** Bug
- **Status:** closed
- **Resolution:** moot — hq no longer creates a placeholder site, so registering leaves no second row (150144c)

**Registering a site while hq keeps running leaves two Execution Site rows, and the wrong one is offered by default.** hq creates a credential-less placeholder (`"<name> (this machine)"`) the first time it boots with nothing registered; `adoptLocalSite()` (`hq/src/server/sites/adoptLocalSite.ts`, called from `hq/src/server/setup.ts:151`) is meant to delete it and re-key everything onto a real registration, but it only runs at hq's own boot. Register a site without restarting hq and both rows exist side by side; the New Project dialog offers both, pre-selects the unreachable placeholder, and gives no hint which one is live. A restart clears it. Fix direction: run `adoptLocalSite` right after a device-token approval succeeds, not only at boot; or have the site picker exclude or clearly label a credential-less placeholder

---

### R-138 · hq's onboarding has no path to connect an Execution Site

- **Kind:** Feature
- **Status:** closed
- **Resolution:** moot — onboarding no longer mentions a runtime; with no site connected hq shows an explicit notice and error instead (150144c)

**hq's onboarding has no path to connect an Execution Site.** Its runtime-check step just reports "unreachable" with nothing pointing at registration, because onboarding predates the split and assumes a site is already there. Two directions, undecided: an explicit "connect a site" step ahead of the runtime check; or let an admin explore hq freely and gate only at the point they try to execute something, with a clear "no Execution Site connected" message. Not mutually exclusive

---

### R-139 · The profile page's subscription instructions only work on Linux, or inside a container

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (a6c24b7)

**The profile page's subscription instructions only work on Linux, or inside a container.** `hq/src/pages/settings/ModelCredentialSection.tsx` tells every person to run `claude login` "locally" and paste `~/.claude/.credentials.json` — on macOS and Windows, Claude Code stores that credential in the OS keychain instead, so the file never exists at that path. The platform-independent path already exists elsewhere in the product (running `claude login` inside a container that has the Claude CLI, as onboarding's own Docker branch already does) and should replace or supplement this instruction

---

### R-140 · Two bootstrap screens still carry pre-rename wording

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (19bfdf1)

**Two bootstrap screens still carry pre-rename wording.** `hq/src/pages/auth/AcceptInvitePage.tsx` labels hq's own first-admin setup "Set up your site" and asks for "your `SITE_ADMIN_KEY`" — both leftovers from when this module was itself called `site`, now confusing once "site" means the Execution Site.

---

### R-141 · The environment variable SITE_ADMIN_KEY is named for the module's old name

- **Kind:** Chore
- **Status:** closed
- **Resolution:** raised as its own issue

*From “Two bootstrap screens still carry pre-rename wording”:* The environment variable itself is named the same way. A rename touches env files, docs, code and tests across both apps, so it is its own piece of work, not a two-line fix

---

### R-142 · The site's `agent-image` build service collides with the agent container name prefix

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (93b7a76)

**The site's `agent-image` build service collides with the agent container name prefix.** It exists only to build the `agenthix-agent` image and exits immediately, but its container name falls inside the prefix the orphan sweep matches, so every boot logs it as a removed orphan. Harmless — cosmetic only — fix by naming it outside the `agenthix-<name>-agent-` prefix

---

### R-143 · The image resolves `ui`'s shared packages differently from local development

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

**The image resolves `ui`'s shared packages differently from local development.** hq's Docker build symlinks `react`, `react-dom`, `lucide-react` and their `@types` from hq's own `node_modules` rather than installing `ui`'s own copies, to avoid two physical copies of React; local development still gets `ui`'s own install. A type error that shows up in only one of the two is possible until this is settled properly

---

### R-144 · Deleting `.github/workflows/deploy.yml` does not erase what it already put in public history

- **Kind:** Bug
- **Status:** closed
- **Resolution:** raised as its own issue

**Deleting `.github/workflows/deploy.yml` does not erase what it already put in public history** — a server IP address and the names of its deploy secrets (not their values) are in commits this repository keeps

---

### R-145 · Agent containers can reach the host machine's own ports, and on a cloud VM, the provider's instance-metadata address

- **Kind:** Bug
- **Status:** closed
- **Resolution:** moot — accepted and documented (dc57f58); enforcement is raised as its own issue

**Agent containers can reach the host machine's own ports, and on a cloud VM, the provider's instance-metadata address.** Pre-existing, not introduced by this phase; each agent network still allows egress to the host gateway

---

### R-146 · The site's Docker health-check calls have no timeout

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (93b7a76)

**The site's Docker health-check calls have no timeout**, so a wedged Docker daemon blocks the site's boot with no message, and the network sweep's own Docker calls share the same exposure on its one-minute tick

---

### R-147 · Wasp warns on every start that .env files should be .env.server or .env.client

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (554ecdf)

Phase 12 gave each module a compose environment file (`hq/.env`, `site/.env`, from each `.env.example`), and both now sit in the Wasp project root, where Wasp ignores them and warns. `wasp start` prints: "Wasp .env files should be named .env.server or .env.client, depending on their use." Which app printed it is unconfirmed; both have one. Harmless to boot, but it is noise on every dev start and hides real warnings. Options: keep the compose env file outside the Wasp root and pass it with `--env-file`, or name it so Wasp does not scan it.

---

### R-148 · The hand-synced forwarded-tool table

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

The site's `forwardedToolSchemas.ts` duplicates hq's tool definitions, and the preview container name prefix is not shared either. Debt, not critical; the move to `core` was deferred.

---

### R-149 · There is no root LICENSE

- **Kind:** Chore
- **Status:** closed
- **Resolution:** raised as its own issue

Only `core/LICENSE` exists. Relevant to the *Open to outside users* milestone and to the repository being public.

---

### R-150 · The plan cites gitignored execution/ paths

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (550333b)

The plan's phase headers cite `execution/phases/…` files. `execution/` is gitignored, and a committed document never cites a gitignored path, because the path is dead for anyone who clones the repository.

---

### R-151 · The QA contract files named site.md hold hq's contract

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (72a8016)

`docs/qa/scenarios/site.md`, `docs/qa/stories/site.md` and `docs/qa/domains/site.md` still say `site` but hold hq's contract. The QA strategy says renaming them is deferred. References to them are in `AGENTS.md`, `docs/qa/qa-strategy.md`, two hq test files and the mobile-responsive unit's spec.

---

### R-152 · Close the Phase 2 security issues when the unit closes

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (98384e6): those issues and the stop-all scoping issue closed as completed on 2026-09-26, then the unit's own issue

Recorded while the unit runs, triaged at its close (Phase 13, task 13.5). Critical items already raised as issues are not repeated here: write-path entitlement (Blocks release, fixed in Phase 8), and the run list's visibility, real-path checks on file reads, terminal-frame archiving and the session-owner lookup (fixed in Phase 2, closing when the unit closes).

The run list's visibility, real-path checks on file reads and terminal-frame archiving were fixed in Phase 2 and stay open until the unit closes; write-path entitlement was fixed in Phase 8 and the session-owner lookup is already closed.

---

### R-153 · Site decommissioning

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

Only revoke exists: no delete, no un-revoke, and no way to move a project off a site, though the revoke dialog says projects stop "until they are moved". `Project` and `Agent` foreign keys `Restrict` deletion, and `WorkspacePlacement.siteId` has no foreign key. The risk grows once more than one site is real. Out of scope for this unit by the plan.

---

### R-154 · An AgentSession cannot carry several mounted locations

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

It is still a single primary triple in both schemas and in the protocol. Out of scope for this unit by the plan.

---

### R-155 · The project knowledge convention and listing

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

Today there is only a prompt instruction to keep `INDEX.md`; no storage UI lists it, and `getKnowledgeDir` has no callers. Out of scope for this unit by the plan.

---

### R-156 · The credential-health badge on the Execution Sites page

- **Kind:** Feature
- **Status:** closed
- **Resolution:** moot — superseded by credentials held per organisation, project or person, the admin banner and the dead-login notification

Task 1.18 folded it into 1.17 because who owns an agent's Claude login was unsettled; the admin notifications the site already raises are unchanged. No schema field and no badge exist. A small additive migration.

---

### R-157 · Agent-authored skills have no inactive state

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

A design question from the split spec's open problems, not queued work; several belong to the run security boundary this unit designed. Decide whether it is an issue, a proposal or a decision record.

---

### R-158 · Project knowledge is a shared writable surface

- **Kind:** Feature
- **Status:** closed
- **Resolution:** moot — accepted and documented (dc57f58)

A design question from the split spec's open problems, not queued work; several belong to the run security boundary this unit designed. Decide whether it is an issue, a proposal or a decision record.

---

### R-159 · Unattended runs have no human approver

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

A design question from the split spec's open problems, not queued work; several belong to the run security boundary this unit designed. Decide whether it is an issue, a proposal or a decision record.

---

### R-160 · The site permission layer — egress and machine limits

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

A design question from the split spec's open problems, not queued work; several belong to the run security boundary this unit designed. Decide whether it is an issue, a proposal or a decision record.

---

### R-161 · Who owns a site's label — site.identity_update is ignored

- **Kind:** Feature
- **Status:** closed
- **Resolution:** fixed (423f3a9)

A design question from the split spec's open problems, not queued work; several belong to the run security boundary this unit designed. Decide whether it is an issue, a proposal or a decision record.

---

### R-162 · Task attribution, and cross-site migration

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

A design question from the split spec's open problems, not queued work; several belong to the run security boundary this unit designed. Decide whether it is an issue, a proposal or a decision record.

---

### R-163 · An API-key runtime credential for larger installs

- **Kind:** Feature
- **Status:** closed
- **Resolution:** fixed (850e5d0)

A design question from the split spec's open problems, not queued work; several belong to the run security boundary this unit designed. Decide whether it is an issue, a proposal or a decision record.

---

### R-164 · Every user's files appear at /users/personal/files, which is wrong once there is more than one user

- **Kind:** Feature
- **Status:** closed
- **Resolution:** not a fault

A design question from the split spec's open problems, not queued work; several belong to the run security boundary this unit designed. Decide whether it is an issue, a proposal or a decision record.

---

### R-165 · Record how this unit's wrap-up worked, for the maintainers' workflow

- **Kind:** Chore
- **Status:** closed
- **Resolution:** moot — recorded as a note for the organisation's workflow and handed to the owner

The maintainers' workflow runs a unit as spec, plan, phases and a single close, which assumes the spec holds
up as the work proceeds. On this unit it did not: the design changed as it was built, and each phase
left open items behind. Phase 13 became an open-ended wrap-up that loops — triage what is open, do
the design and the work, walk the result, repeat — until the work is acceptable, and a QA audit and a
close follow it. The register, corrected-in-place spec and numbered passes are how it was managed.

Keep a note, as the unit runs, of what worked and what did not: how the register's shape held up,
how many passes it took and what decided each one's contents, where the workflow's close-out rule
and the wrap-up loop disagreed, and where the phase and sub-phase numbering got in the way. Until the
unit closes there is no evidence for what to change, so nothing is proposed now. When it closes,
decide whether the workflow should gain a repeatable wrap-up stage, and if so raise
it as a proposal rather than editing the workflow from here.

Added 2026-09-26, at the owner's direction: review two more things with it at the close. **The unit's `execution/`
folder structure** — it grew unevenly (thirty-two plan, inventory and ruling files for finished phases, some over
300 KB, beside the current phase's; four handovers kept side by side; the current one grew to 388 lines of stacked
updates) and was tidied by moving files into an `archive/` folder and writing one handover and an index; review whether
the workflow's guidance for `execution/` should say how to keep it small. **How Pass 4 ran nine background agents** on
separate files in one working tree with the lead running every test — what made it work (disjoint files, reports to
files, no tests inside agents, one regression at the end) and what did not (a chat flooded with tool calls until the
editor's Focus view was turned on) — and whether the workflow should describe it.

---

### R-166 · The GitHub App manifest callback stores an App from a code with no sign-in and no state check

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (310ee31)

Found by the first scan of the register's items, against R-083 (the Wasp `api` routes were never
scanned for a missing sign-in check). `hq/main.wasp` declares the GitHub App manifest routes with
`auth: false`, and the callback in `hq/src/server/github/githubAppApi.ts` takes a `code` from the query
string, converts it, stores the resulting App as the org's GitHub App and refreshes its installations,
with no sign-in and no state value tying the callback to a request hq started. A caller who creates a
GitHub App through GitHub's manifest flow on their own account, and sends the code they are given to
hq's callback, could replace the org's stored GitHub App credentials with their own. The rest of the
Wasp `api` routes are still unscanned.

---

### R-167 · The knowledge mount segment is not pinned to the storage path module

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (6a3d6a1)

Found while fixing R-010. The location resolver builds the host path of a location's `knowledge`
directory itself, and the storage path module (`site/src/server/storage/paths.ts`) has no function for
it, so the test that pins the other mount segments (artefacts, files, workspaces, members and tasks)
to that module cannot pin this one. Renaming the segment in the resolver alone would leave every
test passing. Closing it means giving the path module a knowledge function that the resolver actually
calls, not adding one only for a test.

---

### R-168 · A second GitHub App registration adds a row, and the App hq uses is whichever comes first

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (310ee31)

Found while planning the fix for R-166, which says the callback "replaces" the org's stored GitHub
App. It does not: `storeAppFromConversion` in `hq/src/server/github/githubApp.ts` does a `create`, and
`appId` is unique, so a callback for a different App adds a second `GitHubApp` row. `getApp()` then
reads `findFirst()` with no ordering, so which App hq signs with is whichever row the database returns
first — usually the oldest, but nothing guarantees it. On an install that already has an App, the
callback R-166 describes leaves the real one in use in practice and stores an unused extra; on an
install with no App yet, whoever calls the callback first supplies the org's App. `disconnectGithubApp`
deletes every row. The rule for a second registration — refuse it, or replace the first — is not
stated anywhere.

---

### R-169 · An admin with no Execution Site connected is trapped in onboarding

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (150144c)

Found by the scope check for R-138. `completeOnboarding` (`hq/src/onboarding/actions.ts`) seeds the
"Onboarding" project and the admin's agenda through a site before it writes the completion flag, and
it writes the flag last. With no site connected the seeding throws, the flag stays unset, the person is
sent to `/`, and the dashboard redirects an admin who has not completed onboarding straight back to
`/onboard`, so a fresh install with no site cannot get past the wizard. Only admins are redirected, and
nothing else enforces the wizard, so a deep link gets past it.

---

### R-170 · Provision a local Execution Site from hq

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

The owner wants to sign in to hq and provision a site on the machine hq runs on, in the way a site
would be provisioned on cloud infrastructure, so a single-machine install does not go through
registering a site by hand. Additional sites, on this machine or others on the same network, would be
extensions of the same flow.

The shape it would take: hq mints a pre-approved token (the design already treats a machine hq creates
this way, and the site side of it is built; the hq side is not), asks the machine's Docker daemon to
start the site with that token and its settings, and the site registers itself. What it needs:

- **Token minting in hq.** Small.
- **A provisioner that talks to the local Docker API.** Medium. A site is a small stack of its own — its
  database, the site container, the agent image and networks, and the same-path data folder.
- **Published images.** The blocker. A site is built from source inside Docker by its compose file, and
  publishing ready-made images was left for later, so hq has nothing to pull.
- **Docker access for hq.** A security decision. hq's images were deliberately stripped of the Docker
  socket so a compromised hq cannot take over the machine. Provisioning reverses that; the usual
  mitigation is a restricted Docker socket proxy, or a separate small provisioner service, so hq gets
  only the few calls it needs.

It fits the empty state: with no site connected hq shows an explicit error, and that is where a
"Provision a local site" action would go. The desktop app for running a site on one's own computer
is the other route to the same goal.

---

### R-171 · Onboarding leftovers: assets and code with no caller, and comments that name removed actions

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (6a3d6a1)

Left behind when onboarding was reduced to Welcome, Organisation and Done (R-138, R-169). Nothing in
production reads `hq/assets/onboarding/ONBOARDING_ADMIN.md` or `hq/assets/library/agents/kernel/AGENDA.md`
any more, and `seedOwnAgenda` and `readOwnAgenda` in `hq/src/agents/agendaService.ts` have no caller
outside the agenda's own tests. `hq/src/server/siteRoot.ts` (lines 22-24) has a comment saying
`getEnvironmentMode` and `pingRuntime` built a credentials path, and `hq/src/server/__tests__/hqStartsNoContainers.test.ts`
(line 7) mentions the onboarding runtime check; both actions are gone. `hq/e2e/README.md` lists a planned
"onboarding wizard seeding" test that no longer applies. The kernel agent's instructions
(`hq/assets/library/agents/kernel/instructions.md`, lines 15 and 32) still describe it guiding
organisation setup. The site-side `runtime.check` channel method and core's `RUNTIME_CHECK_*` constants
have no caller in hq now. The QA scenarios for the wizard are R-001's audit work.

---

### R-172 · A credential can sit at the org, person or project boundary, with the single-person rule

- **Kind:** Feature
- **Status:** closed
- **Resolution:** fixed (e8bb1ee)

Designed in spec §6.3 ("Model access is supplied per run, and belongs to the boundary"). Today the org
fallback takes only an API key and a subscription is a person's alone, so a single-person org on a
subscription has no credential for a task or project run (R-136). The design: each boundary — the org, a
person, a project — can hold an API key or a subscription login; a run uses its own boundary's and falls
back to the org's; a person's own subscription works in an org of any size for their own runs, and an
org or project subscription is used only while the org has exactly one person, read each time and never
stored. When it is not usable it stays stored and a run falls to the next credential, or is refused with
an error that says what to do. Setting a subscription shows the own-use warning and records the person's
acceptance. The build covers the resolution, the org and project credential settings, the rule and its
tests. Closes R-136 when built.

---

### R-173 · Sign in with Claude: the person signs in through a login run in a throwaway container

- **Kind:** Feature
- **Status:** closed
- **Resolution:** fixed (a6c24b7)

Designed in spec §6.3. hq asks a connected site to start a throwaway container from the agent image and
run `claude auth login` with its input held open and no terminal; hq shows the sign-in link it prints;
the person signs in on Anthropic's page and pastes the code back; hq writes it into the same running
process, and the site reads the resulting credentials file once, hands it to hq and deletes the
container. A trial in the agent image (Claude Code 2.1.281) showed it prints the link and waits at
`Paste code here if prompted >` with only `-i`. Not yet verified: a pasted code being accepted from
stdin, and the credentials file being written; the first real login confirms both, and shows the file's
real shape, which settles R-112. Needs two channel methods (start and submit), a ten-minute cleanup, and
the same explicit error as anything else when no site is connected. Replaces R-139's paste instructions.

---

### R-174 · Admins see a banner while shared runs have no usable credential

- **Kind:** Feature
- **Status:** closed
- **Resolution:** fixed (e8bb1ee)

Designed in spec §6.3. A persistent banner for admins only, while tasks and project runs have no usable
credential — no org API key, and either the org has several people or no org subscription is set. It
clears as soon as that stops being true and has no dismiss control. People who are not admins see only the
error when they run something. Derived from state each time, not stored.

---

### R-175 · Ask Anthropic in writing whether hq holding a subscription login is permitted

- **Kind:** Chore
- **Status:** closed
- **Resolution:** raised as its own issue

Anthropic's legal page (fetched 2026-09-25) says a product may not "collect, store, or intermediate
Claude.ai credentials or session tokens", and does not prevent "an end user from signing in to the
unmodified Claude Code binary with their own Claude subscription, including where a platform hosts Claude
Code". In the design the person signs in themselves on Anthropic's page; hq stores the resulting login and
relays the short authorization code. The question, for Anthropic to answer: may a self-hosted organisation's
own hq store the login a person made through the unmodified binary, for that person's own use — for an
organisation of one person, and for a project shared with others? The answer is recorded when it comes.

### R-176 · A site hq no longer recognises is refused as if hq were down, and retries forever

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (d16bc9a)

Found 2026-09-25 when hq's database was reset while a site was registered. hq answers a site whose id it
has no record of with a bare `401`, the same as a wrong or revoked credential, and the site treats that
as a network problem: it records `hq refused the connection (HTTP 401)`, marks the link degraded and
retries forever with backoff. Nothing tells the operator that the registration is gone and has to be
made again. Fix: hq answers an unknown site id with a `401` that says so (a header on the refusal), and
the site then does what it does on a revoke — marks the link revoked, stops retrying, and says "hq does
not recognise this site — register it again", which `agenthix-site status` shows and which lets
`agenthix-site register` run without `unregister` first. A wrong credential for a site hq does know, and
a revoked site, keep the plain `401`, so a caller holding a guessed site id learns only that the id is
unknown.

---

### R-177 · The dev "Claude Login" task and script write a file nothing reads

- **Kind:** Chore
- **Status:** closed
- **Resolution:** fixed (9d4dd7e)

Found when `hq/scripts/dev/start.sh` refused to start for want of a shared login file (that check is
gone, a4ab6b2). `hq/scripts/dev/login.sh` and the `[dev] Claude Login` task in `hq/.vscode/tasks.json`
still exist to produce that file, which credentials supplied per run made obsolete. Delete both, and
the two mentions of the shared seed file's path that remain in the runtime-check result.

---

### R-178 · An admin can approve a site on an hq that has no organisation, and the approval then stalls

- **Kind:** Bug
- **Status:** closed
- **Resolution:** moot — hq always has an organisation from its first boot (4f5bbcb)

Found 2026-09-25. `redeemDeviceCode` (`hq/src/server/sites/deviceApprovalService.ts`) throws "No
organisation exists — hq has not been bootstrapped" when the site collects an approved code, before it
claims the approval. The Approve a site page accepts the code anyway, so an admin sees success and the
site waits. hq should refuse the approval, saying an organisation has to be created first.

---

### R-179 · A site treats an hq error as temporary and retries its registration poll silently for the life of the code

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (9d4dd7e)

Found with R-178. `pollForApproval` (`site/src/server/control/commands.ts`) retries every HTTP 500 from
hq's token endpoint as transient, so a persistent server-side refusal looks the same as "still waiting for
approval": the `register` command prints nothing new for up to fifteen minutes. After a few consecutive
errors it should say what hq answered, or stop.

---

### R-180 · With `SKIP_ONBOARDING` on, hq never gets an organisation and the wizard cannot be reached

- **Kind:** Bug
- **Status:** closed
- **Resolution:** moot — hq always has an organisation from its first boot (4f5bbcb)

Found 2026-09-25. The dev switch reports onboarding as complete (`hq/src/onboarding/queries.ts`), and
`OnboardingPage` sends anyone whose onboarding is complete back to `/`, so on a fresh database with the
switch on there is no route to the step that creates the organisation. Everything that needs an
organisation then fails (registering a site, R-178). The switch should still create the organisation, or
the wizard should stay reachable while none exists.

---

### R-181 · hq gives no guidance for connecting an Execution Site, local or remote

- **Kind:** Feature
- **Status:** closed
- **Resolution:** moot — redesigned by the owner on 2026-09-25 as R-182 to R-185: a default site that is configured, a site list for everyone, and an admin-only screen for connecting more

Found 2026-09-25 when connecting a site by hand took several wrong turns. Today hq's guidance is one
line on the Execution Sites page (run `agenthix-site register <hq-url>`, then enter the code at Approve a
site) and a notice elsewhere that only says to register one. Nothing says where the command is run, that
the site app must already be running, that hq needs an organisation first (R-178, R-180), or what a
remote machine does differently.

Wanted: on the empty state, the Execution Sites page and the notice, steps for connecting a site with hq's
own address filled in. **A site on this machine:** start the site app, then the command. **A site on
another machine:** the deployed form of the command
(`docker compose -f site/compose.yml exec site agenthix-site register <hq-url>`) and the requirement that
the address hq gives must be reachable from that machine. The page should show the connection as it
progresses — waiting for approval, approved, connected — so the person can see what happens next. This
stands alone and does not need R-170 (hq starting a local site itself); when R-170 is built, this
guidance is what remote sites keep using.

---

### R-182 · hq has an organisation from its first boot

- **Kind:** Feature
- **Status:** closed
- **Resolution:** fixed (4f5bbcb)

Owner's ruling 2026-09-25: there must always be an organisation. Today it is created only by the
onboarding wizard's Organisation step, which the Welcome step's Skip button bypasses and the
`SKIP_ONBOARDING` dev switch hides, so an hq can run with none (R-178, R-180). hq creates a default
organisation the first time it boots; onboarding then only renames it, and skipping leaves the default
name. Closes R-178 and R-180 when built.

---

### R-183 · hq and its own site come as a pair, connected by configuration and not by registration

- **Kind:** Feature
- **Status:** closed
- **Resolution:** fixed (4f5bbcb)

Owner's ruling 2026-09-25. Every install ships hq and one site on the same machine; the organisation
decides later whether its operation stays there or is managed elsewhere. The installer sets one secret in
hq's and the site's environment files. The site uses it as its credential every time it connects, with no
registration and no approval; at every boot hq makes sure the default site's row exists with that secret
as its credential. Nothing needs repairing: a wiped hq database or site database is rebuilt from the same
secret at the next start, and a site that is not running shows as offline with how to start it. The default
site cannot be revoked or removed, and its secret is rotated by changing it in both files and restarting.
Covers the dev setup (`[dev] Start All`) and the deployed stack. Every other site still registers with an
admin's consent (ADR-0064). This reverses the earlier ruling that hq creates no Execution Site of its own,
which was made for a placeholder row hq invented; this site is a real service. Needs a decision record, the
deployment guide, the repository's context file and the spec corrected.

---

### R-184 · A list of Execution Sites that any signed-in person can view

- **Kind:** Feature
- **Status:** closed
- **Resolution:** fixed (4f5bbcb)

Owner's ruling 2026-09-25: viewing sites and connecting a site are separate. The Execution Sites page
becomes a list — name, whether it is the default, its status, and what that status means and what to do
about it — visible to admins and non-admins alike, with the admin-only actions (rotate, revoke, check)
kept for admins. Revoke and remove are not offered for the default site (R-183).

---

### R-185 · An admin-only "Connect a site" screen showing sites in flight, with instructions

- **Kind:** Feature
- **Status:** closed
- **Resolution:** fixed (4f5bbcb)

Owner's ruling 2026-09-25. The site list has a "Connect a site" button for admins only, which opens a
separate screen. It lists every site currently waiting for approval — hq already holds a row for each,
with its name, host, the address it came from and when its code expires — and several can wait at once.
The admin still types the code the machine printed, which is what shows they are at the right machine and
not approving a stranger's request. The screen also gives the instructions for connecting a site: on
another machine (the deployed command, and the requirement that hq's address is reachable from it) and an
extra site on this machine, with hq's own address filled in. A "provision it for me" button on this screen
is R-170, a later feature.

---

### R-186 · When the default site adopts a new site id, rows that name the old one by string are left pointing at it

- **Kind:** Debt
- **Status:** closed
- **Resolution:** fixed (9d4dd7e)

Found building R-183. The default site is matched by its secret, and hq updates the row's `siteId` to
whatever the site presents, so a site whose database was wiped (and so generated a new id) reconnects as
the same default site. `SiteRegistrationToken.redeemedBySiteId` follows the change (a foreign key that
cascades), and `UserStoragePlacement` and `Project` name the row's own `id`, which does not change. Four
places hold the old id as a plain string with no foreign key: `WorkspacePlacement.siteId`,
`WorkspaceAccessPolicy.siteId`, `PreviewSession.siteId` and `SiteDeviceApproval.siteId`. After a wiped site
database the workspaces they describe are gone with it, so nothing reads them wrongly today, but they are
stale rows. Re-point or clear them when the id is adopted, or give them a foreign key.

---

### R-187 · Five committed concept documents still link to the superseded agent-file-serving document

- **Kind:** Chore
- **Status:** closed
- **Resolution:** raised as its own issue

Found rewriting R-021. `docs/concepts/workspace/agent-file-serving.md` is now a pointer to
`docs/concepts/file-sharing/file-sharing.md`, but five documents still cite it as a live reference:
`docs/concepts/memory/memory.md` (the `.public/` and `attachFile` convention), `docs/concepts/workspace/workspace.md`,
`docs/concepts/workspace/assets.md` (describes `.public/` with an "unguessable URL"),
`docs/concepts/workspace/github-commit-authorship.md`, and `docs/concepts/file-sharing/file-sharing.md` itself
(calls it an "earlier document"). The last also cites `setup.ts` line numbers that have moved. Repoint them and
fix the stale description.

---

### R-188 · The untitled-session placeholder is written out in three places

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

Found in R-057. hq applies a site's session title only while its copy still holds "New Conversation". That
string is defined on the site (`currentSessionTitle.ts`), on hq (`siteSessionTitle.ts`) and as a literal in
`hq/src/sessions/actions.ts`. One constant in core would keep them from drifting.

---

### R-189 · hq/src/projects/actions.ts is 476 lines

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

Found in R-109. Past the 300-line evaluation mark and 24 under the 500-line stop; the next addition to it
should split it first.

---

### R-190 · hq has no way to change or recover a password

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

Found in Pass 3 while ruling on R-141. Sign-in is username and password only, with no email address stored, so
Wasp's standard reset flow is not available, and nothing else changes a password either: an admin can create and
delete a person but cannot set a password for one, and a signed-in person cannot change their own. The first-admin
key is refused once any person exists, so it is no way back. A person who typed a hasty password during setup and
forgot it has no route into their own hq short of editing the database or reinstalling. The auth concept
document describes a "Forgot password" link that the login page does not have.

Decided by the owner: raised as an issue, not built in this milestone, **release blocker**. Design to raise: a
signed-in person changes their own password by giving the current one; an admin sets one for another person; and a
command run on the hq machine resets a password, the way back for the last admin — the machine is the authority,
as it is for registering a site. The bootstrap key must not double as a recovery key (a standing master key in an
environment file).

---

### R-191 · Deleting a project leaves its workspace rows in the site's database

- **Kind:** Debt
- **Status:** closed
- **Resolution:** raised as its own issue

Found in R-092. Deleting a project now asks its site to remove the project's folder, but the site's own
database still holds the project's workspace and repository-attachment rows. They point at a folder that no
longer exists. hq needs a way to ask the site to remove those rows too, or the folder removal should do it
in the same call.

---

### R-192 · Accepting an invite while signed in silently replaces the current session

- **Kind:** Bug
- **Status:** closed
- **Resolution:** raised as its own issue

Found by the owner checking R-134. Opening an invite link in a browser that is signed in as someone else, an admin
inviting a colleague and trying the link on the same machine for instance, completes sign-up and signs the browser in as
the new person, replacing the admin's session with no warning. To get back, the admin signs out of the new account and
signs in again. Wanted: at least a warning on the accept page that names who is signed in and offers to continue as a new
person or cancel; better, an account switcher that keeps more than one signed-in account, as video and mail sites do.

---

### R-193 · Transcripts are shared inside a project because its container has one Claude home; one container per person per site would separate them

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

Raised by the owner while ruling on R-024, which was accepted and documented: working in a shared project means its
members' transcripts sit in one home that every run in that project can read. The idea for removing that is to change
what belongs to whom. A project has storage on exactly one site, fixed. A person has home storage on one site, fixed.
What changes is the person's profile on each site they work on: working in a project on site S gives the person a profile
on S if they have none (it is their home storage only where S is their home site). On any site there is one container per
person, mounted with the person's profile on that site and every project storage they can reach on it, so the person's
transcripts are theirs and project storage stays shared. Not chosen for this milestone; the cons found in discussion are
the reason it needs design first.

- **Several containers write one project at once.** Runs in a project are queued so one container writes its files at a
  time (the queue is keyed on the storage boundary, in process). With a container per member, several mount the same
  project read-write together: file races, and one git working tree and index shared by concurrent agents (a killed git
  already leaves stale locks). The lock would have to be per project across containers, or each run would need its
  own worktree. This is the largest.
- **A union mount widens what one run can see.** A running container cannot gain a mount, so a person's container
  mounting every project they can reach lets a chat run in project A, possibly acting on untrusted content, read and
  write project B and the person's own files, which a project's container does not allow today. The alternative that
  keeps isolation is a container per person per project, which multiplies containers; the choice is between the two.
- **Tasks and heartbeats still need a project container.** They act as the project, not a person, so they cannot run in a
  member's container; the design adds a second container kind mounting the same storage read-write.
- **Credentials.** A project chat uses the project's or organisation's credential, not the person's. In a member's
  container it would sit in the person's Claude home beside their own subscription, for every project they can reach, so
  credentials would have to be staged per run and removed afterwards.
- **Data sprawl and removal.** A person's profile and transcripts end up on every site they chat on. Removing a person or
  revoking a site would have to sweep profiles on every site (the class of leak in R-092, multiplied by people and sites).
- **Cost.** Containers are per active person per site and torn down when idle, so cost tracks active people, plus a cold
  start on a person's first chat in a project.
- **Change surface.** Storage placement, capability boundary claims, queue keys, container naming and labels, the mount
  signature, credential staging, the meaning of the person's storage placement, a protocol bump, spec sections 6.1 and 6.2,
  and new decision records superseding ADR-0057 and ADR-0060.

Considered and rejected: per-person folders inside one container (every run is the same operating-system user, so no
isolation), and a container per person per project as the only answer (too heavy). Does not change R-115 (agents of one
person in one container share its home), which is accepted.

---

### R-194 · The framework's own sign-up route is open, so anyone can create an account without an invite

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (310ee31)

Found by the first-time-installer review in Pass 8 and confirmed in the generated server. hq's sign-in is Wasp's username and password provider, which mounts both `POST /auth/username/login` and
`POST /auth/username/signup`. `hq/main.wasp` carries the comment "Signup disabled for Private Gateway", but no `onBeforeSignup` hook is declared, so the sign-up route creates an account for anyone who can reach
hq, with no invite. The account has no role row, so the role checks refuse it admin things, but every operation that checks only that the caller is signed in is open to it. It also adds a person to the
count that decides how an organisation credential may be used (a shared subscription works only while the organisation has exactly one person), and an uninvited account created before the first admin makes
the first-admin key fail with "Bootstrap key no longer valid". hq creates every account itself (the invite path and the admin's create-user action write the rows directly), and nothing calls the framework's
route, so the route can be refused outright.

---

### R-195 · Some agent and board-template operations check only that the caller is signed in, not their role

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (bb0c4e0)

Found by the organisation-admin review in Pass 8 and confirmed for the agent operations in `hq/src/agents/actions.ts`: `updateAgent`, `deleteAgent` and `stopAgent` check only that the caller is signed in.
Creating, publishing, installing skills and applying a preset need the ADMIN role; these do not, so any signed-in person, a viewer included, can rename or delete a non-kernel agent or switch off an
agent's heartbeat. The board-template writes were reported the same way and are still to be checked. The earlier scan of all operations looked for a missing sign-in check, not a missing role check, which
is why this was not found. The role each write needs should be decided (the agent operations follow "an org admin shapes structure") and checked in one place.

---

### R-196 · A viewer can indirectly spend the organisation's money and can stop or delete other people's work

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (bb0c4e0)

Found by the Pass 8 QA audit (F-003, F-004), checked against the code. A viewer is a member of every open project, and several writes check only membership, not role. `updateTask`, `moveTaskToStage` and
`updateBoard` (turning auto-queue on) accept a queued state and an assigned agent, so a viewer can make agents run and spend; `dispatchWorkflow` and `setRepoSecret` need only membership of the storage.
`stopTaskSession`, `cancelAgentRun`, `deleteTaskSession`, `clearTaskSession`, `deleteBoard`, `completeBoard` and `deleteWorkspaceAction` also check membership only, so a viewer can stop and delete work, including
runs, transcripts and tool-call logs on a site. A viewer reads and never starts, funds, stops or deletes.

---

### R-197 · A person removed from a private project keeps a live chat into it

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (47dfc00)

Found by the Pass 8 QA audit (F-005). Membership of a project is checked when a chat session is created, not when a message is sent or a run dispatched. Someone removed from a private project, or a project turned
private, keeps a live chat bound to the project's storage and can go on sending into it, and the run acts as the project. They should keep read access to their own old chats there and be unable to continue them.

---

### R-198 · Private projects show through the product and programme lists and the agent detail page

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (47dfc00)

Found by the Pass 8 QA audit (F-006, F-007). The product and programme lists and pages return every project's name, key, description and, for products, task counts and states to any signed-in person, private projects
included. The agent detail page returns the latest runs with input and output text filtered only against other people's chats, and the ten latest assigned tasks with project and board names unfiltered, so a private
project's work shows to anyone who opens the agent. Both should filter by the caller's entitlement to the project, as the project lists do.

---

### R-199 · The task page's Stop only sets the task to Idle and does not cancel the run

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (038c940)

Found by the Pass 8 QA audit (F-008). On the task page, Stop sets the task to Idle and nothing cancels the run on its site, so the run can keep spending while the page says Idle and offers Run again. Stopping the
real way (the Activity panel, or chat) ends the task as Failed with "run cancelled". Stop should cancel the run.

---

### R-200 · SECRETS_MASTER_KEY is documented as optional, but hq cannot run anything without it

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (310ee31)

Found by the first-time-installer review and the Pass 8 QA audit (F-009). hq cannot mint its signing key without `SECRETS_MASTER_KEY`, and every run needs a signed capability, so an install that follows the guide
cannot run anything. Saving a subscription login without it fails after the person has used the one-time code, with a generic error. It should be a required setting that hq names at start, and the save should check it
before a code is spent.

---

### R-201 · Invite acceptance reveals whether a username exists, accepts the placeholder first-admin key, and compares the key in variable time

- **Kind:** Bug
- **Status:** closed
- **Resolution:** fixed (310ee31)

Found by the R-083 scan of the unauthenticated routes (W-3). The accept step checks whether a username is taken before it validates the invite code, so a username is revealed to someone with no valid code, and since the
Pass 5 rate-limit change a taken username counts nothing against the limit. The placeholder first-admin key `changeme` from the environment example is accepted, and the key is compared without a constant-time
comparison. Validate the code first, refuse the placeholder, and compare in constant time.

---

### R-202 · The plain Express routes and the preview proxy were not scanned for a missing sign-in check

- **Kind:** Chore
- **Status:** closed
- **Resolution:** raised as its own issue

Found finishing R-083. The scan of the `api` routes in `hq/main.wasp` covered sixteen routes; the plain Express routes registered in `hq/src/server/setup.ts` (`/files/*`, agent images, `/presets`) and the preview
proxy sit outside those blocks and were not scanned. They serve files and images and proxy a preview, so each should be checked for who may reach it and what it can return.

---

### R-203 · The GitHub integration needs a hands-on pass before it is offered

- **Kind:** Bug
- **Status:** closed
- **Resolution:** raised as its own issue

Found by the owner walking the GitHub App flow by hand on 2026-09-26, after the Pass 7 fixes. "Back up to GitHub" creates a repository and then fails to mint a token for it when the App is installed on
selected repositories only, leaving an orphan repository and showing GitHub's raw error; a new installation does not appear until an administrator refreshes; the App's homepage is a development address; the
permission set was not reviewed for least privilege; linking into an empty project was not verified. The owner ruled it is not a release blocker while GitHub is left out of the first release, and that it is addressed
(or the integration hidden) before GitHub is offered.

---

### R-204 · Organisation roles need a design: what an administrator, an operator and a viewer are each for

- **Kind:** Feature
- **Status:** closed
- **Resolution:** raised as its own issue

Found by the owner checking a viewer's screens by hand on 2026-09-26. A viewer can create tasks, comment and attach files, and sees Archive and Delete enabled on the task page although the server refuses them; the role names
promise more than the code enforces, and the design left a read-only reader class open. The owner ruled that the roles need proper design work: raised, not a release blocker.

---
