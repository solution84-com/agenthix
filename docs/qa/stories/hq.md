---
name: User Stories — hq
description: Business-level requirements for Agenthix's hq web app and the Execution Site machine owner (projects, tasks, boards, agents, sessions, skills, products, org, people and roles, model access, integrations, machines). Written for business readers.
updated: 2026-11-08
verified: 2026-06-19
next-us: US-446
---

# User Stories — `hq/`

> Business-level requirements for hq's users, and for the person who owns an Execution Site machine (stories US-182 to US-185).
> Audience: business readers — no implementation detail.
> This file was named `site.md` until 2026-09-26. The baseline is the 2026-06-19 story review; the stories from US-162 upward and the criteria added on 2026-09-26 come from the user-journey catch-up mapped in [`../coverage.md`](../coverage.md). `verified` is the date the accuracy pass last ran against the whole code; the 2026-09-26 catch-up checked only what it touched. The stories from US-199 upward, and the criteria changed on 2026-10-07, were written from the finished code at the close of the unit that made hq conversation-first; the stories from US-220 upward, and the criteria changed on 2026-10-12, at the close of the unit *Agenthix is usable — every screen reviewed*; the stories from US-329 upward, and the criteria changed on 2026-10-18, at the close of the unit *the desktop shell*; the stories from US-355 upward (US-356 is in [`host.md`](host.md)), and the criteria changed on 2026-10-23, at the close of the unit *models from one place*; the stories from US-383 upward, and the criteria changed on 2026-10-26, at the close of the unit *agent knowledge*; the stories from US-390 upward (US-396 is in [`console.md`](console.md), US-397 in [`cross-cutting.md`](cross-cutting.md)), on 2026-10-27, at the close of the unit *seeing the agents' work*. The stories from US-398 upward, on 2026-10-28, at the close of the unit *skills and the asset layer*. The stories from US-410 upward (US-422 is in [`console.md`](console.md), US-423 in [`host.md`](host.md)), on 2026-11-02, at the close of the unit *live preview*. The stories from US-430 upward, and the criteria changed on 2026-11-08, at the close of the unit *tasks, runs, boards and routines*.
> A retired story or criterion keeps its number; nothing is renumbered. Which scenarios fulfil each criterion is recorded on the scenarios ([`../scenarios/hq.md`](../scenarios/hq.md), [`../scenarios/site.md`](../scenarios/site.md)), never here.

---

## Authentication & Invites

### US-001 — Sign in

As a member, I want to sign in with my username and password, so that I can reach my workspace.

**Acceptance criteria:**
- AC-001a: valid username and password sign me in and land me on the workspace.
- AC-001b: invalid credentials are rejected and I stay on the sign-in screen.
- AC-001c: the sign-in screen states access is invite-only — there is no self-service sign-up.

---

### US-002 — Remember my credentials

As a member, I want to be remembered on a device, so that I do not retype my credentials each visit.

**Acceptance criteria:**
- AC-002a: ticking "Remember me" pre-fills my username (never my password) on the next visit on that device.
- AC-002b: leaving it unticked clears any saved username on submit.

---

### US-003 — Sign out

As a member, I want to sign out, so that my session ends on a shared or public device.

**Acceptance criteria:**
- AC-003a: signing out ends my session and returns me to the sign-in screen.

---

### US-004 — Issue an invite

As an admin, I want to invite a teammate with a chosen role, so that they can join the workspace.

**Acceptance criteria:**
- AC-004a: I choose an organisation role (Admin / Member) and an optional note and receive a shareable invite code.
- AC-004b: the invite expires seven days after creation.
- AC-004c: only admins can create invites.
- AC-004d: the invite link I copy opens on my colleague's computer — it uses hq's configured public address — I am warned when that address is one only my own machine can reach, and the invitation names the projects the invitee joins.

---

### US-005 — Revoke an invite

As an admin, I want to revoke an outstanding invite, so that its code can no longer be used.

**Acceptance criteria:**
- AC-005a: revoking an unused invite stops its code working.
- AC-005b: an invite that was already consumed or already revoked cannot be revoked.
- AC-005c: only admins can revoke invites.

---

### US-006 — Review issued invites

As an admin, I want to see all invites and their status, so that I can manage who has pending access.

**Acceptance criteria:**
- AC-006a: I see all invites newest-first with role, note, expiry, and whether each is consumed or revoked.
- AC-006b: only admins can view the invite list.
- AC-006c: an invited person who has not yet signed up cannot sign in, shows in the pending list with the days left, and is not counted as a person.

---

### US-007 — Validate an invite code

As an invitee, I want to check my invite code, so that I know the role I will join as before creating an account.

**Acceptance criteria:**
- AC-007a: a valid code shows the role I will join as, who invited me, and when the code expires.
- AC-007b: an invalid, revoked, used, or expired code is rejected with a clear reason.
- AC-007c: repeated bad attempts are rate-limited.

---

### US-008 — Accept an invite and create my account

As an invitee, I want to redeem my invite, so that I get an account and join the workspace.

**Acceptance criteria:**
- AC-008a: with a valid code I choose a username and a password (at least 8 characters) and an account is created with the invite's role.
- AC-008b: a username already taken is rejected.
- AC-008c: the invite is marked consumed so the same code cannot be reused.
- AC-008d: after acceptance I am signed in and taken to the workspace.
- AC-008e: opening an invite link while signed in as someone else warns me who is signed in and lets me continue as the new person or cancel; my session is never replaced silently (AC-273d).

---

### US-009 — Bootstrap the first admin

As the first operator of a new deployment, I want to create the founding admin account, so that the workspace can be set up before any invites exist.

**Acceptance criteria:**
- AC-009a: while HQ has no people, a one-time first-admin link from HQ's own address lets the first admin make their account, and the sign-in page points to it instead of asking for a code.
- AC-009b: the new Admin is signed in and taken into setup.
- AC-009c: the link no longer works once an account exists, and says HQ is already set up; no route other than an invite or an admin's create-account action can create an account, so a stranger cannot take the first place or add a person before me.
- AC-009d: two people using the key at the same moment cannot both become admin.

---

## Onboarding & Setup

### US-010 — Run the setup wizard

As an admin, I want a guided first-run wizard, so that I can configure the workspace step by step.

**Acceptance criteria:**
- AC-010a: on first login an admin sees setup in three steps — You, Your organisation, Model access — then a review, with a progress indicator (US-271).
- ~~AC-010b: I can move forward and back between steps, and skip the flow.~~ *(Retired 2026-10-12 — Back and Skip for now replace it; there is no "I'll set up later")*
- AC-010c: once onboarding is complete the wizard no longer appears and I am taken to Home.
- AC-010d: the last look shows where models and voice come from and the organisation's three defaults, and where agents will run while HQ's own site is not connected, and never asks for something already done (AC-271c, AC-271d). *(Changed 2026-10-23)*

---

### US-011 — ~~Test runtime connectivity during setup~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** The runtime checks (validate a key, a "hello" check, the sign-in command) were removed from setup; model access is set on its own page (US-163, US-164). Its criteria are retired with it.

As an admin, I want to verify the AI runtime is reachable, so that I know agents will be able to run.

**Acceptance criteria:**
- AC-011a: I can validate an Anthropic API key and see a pass/fail result with the provider's error on failure.
- AC-011b: I can run a "hello" check that sends a message to the runtime and shows the response or an error.
- AC-011c: the wizard shows the exact sign-in command for my environment (local or Docker).

---

### US-012 — Review the organisation and kernel agent during setup

As an admin, I want to set up my organisation profile and the built-in kernel agent, so that the workspace starts with the right identity.

**Acceptance criteria:**
- AC-012a: the organisation step is pre-filled with the current name, vision, and mission and saves my edits; the name is required to continue.
- AC-012b: ~~the kernel step shows the built-in kernel agent with an elevated-access warning and lets me rename its display name.~~ *(Retired 2026-09-26 — the setup wizard no longer has a kernel step)*

---

### US-013 — Complete onboarding and seed the workspace

As an admin, I want finishing setup to leave me ready to work, so that I am not staring at an empty workspace.

**Acceptance criteria:**
- AC-013a: completing marks onboarding done so the wizard will not reappear.
- AC-013b: ~~an "Onboarding" project with a starter board and a kernel-assigned task is seeded the first time.~~ *(Retired 2026-09-26 — setup no longer seeds an Onboarding project)*
- AC-013c: ~~I land in a new chat session with the kernel agent, pre-seeded with a welcome.~~ *(Retired 2026-09-26 — setup no longer opens a kernel chat)*

---

## Dashboard & Navigation Shell

### US-014 — ~~View the operations dashboard~~ *(Retired 2026-10-12)*

> **Retired 2026-10-12.** The dashboard page is gone; its totals are Today on the Organisation page (US-257), and `/org/dashboard` leads to the Organisation page (AC-255d). Its criteria are retired with it.

As an admin, I want an at-a-glance dashboard of the organisation, so that I can see the state of the workspace when I need it.

**Acceptance criteria:**
- ~~AC-014a: I see totals for agents, projects, live sessions, and open tasks.~~ *(Retired 2026-10-12)*
- ~~AC-014b: I see recent projects, a task overview, a runs overview, a recent-activity feed, agent cost, a financial overview, and top agents.~~ *(Retired 2026-10-12)*
- ~~AC-014c: clicking a recent project or a top agent navigates to it.~~ *(Retired 2026-10-12)*
- ~~AC-014d: the dashboard is a page of its own, reached from Organisation, and only admins see it; after signing in I land on Home (US-204).~~ *(Retired 2026-10-12)*

---

### US-015 — ~~See the dashboard update live~~ *(Retired 2026-10-12)*

> **Retired 2026-10-12.** There is no dashboard page to update; Today refreshes every 30 seconds. Its criteria are retired with it.

As an admin, I want the dashboard to refresh itself, so that I see current activity without reloading.

**Acceptance criteria:**
- ~~AC-015a: the dashboard updates in place as activity changes while it is open.~~ *(Retired 2026-10-12)*
- ~~AC-015b: updates stop when I leave the dashboard.~~ *(Retired 2026-10-12)*

---

### US-016 — Navigate via the side nav

As a member, I want one navigation on every screen, so that I can move between the places I work.

**Acceptance criteria:**
- AC-016a: the navigation lists the places I work — Home, Chat, Your space, Projects, Agents and Tasks, with how many of my tasks need me — and at the foot my pins and me, my name opening Organisation, Settings and Sign out. *(Changed 2026-10-18: Your space has its own entry, and the pins are one row in the foot)*
- AC-016b: the place matching the current page is highlighted; inside a project, its pin is highlighted rather than Projects.
- AC-016c: I can collapse the navigation to a strip of icons, which keeps Notifications, Runs, my pins, Organisation and Settings, and expand it again; it stays as I left it.
- AC-016d: Organisation leads to the Organisation page (US-255), which groups People, Agents, Teams, Products, Programs and the Library; for an admin it also shows Needs attention, Today, Where it runs and Settings.

---

### US-017 — Read breadcrumbs and the page header

As a member, I want breadcrumbs and a clear page header, so that I know where I am and can step back up.

**Acceptance criteria:**
- AC-017a: every screen has a bar with its breadcrumb, and a crumb takes me there without reloading the page.
- AC-017b: the page header shows a title, optional subtitle, and an optional action control.

---

### US-018 — Open Notifications and Runs from any screen

As a member, I want what needs me and what agents are doing a click away from any screen, so that I can act without leaving what I am doing.

**Acceptance criteria:**
- AC-018a: two buttons beside the logo open Notifications and Runs as a panel beside the navigation, one at a time; closing it returns me to exactly where I was.
- ~~AC-018b: the chat panel can cycle between closed, side, and full width.~~ *(Retired 2026-10-07 — chat is a place in the navigation, not a panel; how a conversation and its tools share the screen is US-202.)*
- AC-018c: the Notifications button counts what needs me that I have not seen, and the Runs button counts my runs going now.

---

### US-019 — Link straight to a panel

As a member, I want to link directly to a panel or a run, so that I can return to it.

**Acceptance criteria:**
- ~~AC-019a: I can drag-resize the side panel within bounds and the width persists across reloads.~~ *(Retired 2026-10-07 — there is no side panel to resize; four named layouts replace dragging, US-202.)*
- AC-019b: opening a panel or a run is reflected in the page's address, and loading that address opens it again.

---

### US-020 — ~~Check system status~~ *(Retired 2026-10-12)*

> **Retired 2026-10-12.** The debug page that held the status view is gone; replaced by Health under Logs and diagnostics, for admins (US-278). Its criteria are retired with it.

As a member, I want to see backend health, so that I can tell whether the platform is operating normally.

**Acceptance criteria:**
- ~~AC-020a: a status view reports database connectivity, worker availability, and the agent engine's online state with active and maximum concurrency.~~ *(Retired 2026-10-12)*

---

### US-021 — Inspect an activity entry

As a member, I want to open a run from a link, so that I can see what happened in detail.

**Acceptance criteria:**
- AC-021a: a link to a run opens it in the Runs panel — agent, task context, transcript, and the latest run's status.
- AC-021b: an unknown item shows a not-found state.

---

## Projects

### US-022 — Create a project

As an admin, I want to create a project, so that I can organise work and its boards and tasks.

**Acceptance criteria:**
- AC-022a: I create a project with a name and optional description, product, program, and key.
- AC-022b: a project key is auto-derived from the name when I omit it, and must be 2–6 uppercase letters.
- AC-022c: a duplicate name or an in-use key is rejected with a clear message.
- AC-022d: on success the project appears in the list and its workspace is provisioned.
- AC-022e: only an admin can create a project; the person who creates it becomes its first project admin, and anyone else is told the role needed.

---

### US-023 — Browse and open projects

As a member, I want to find projects, so that I can get to the one I need.

**Acceptance criteria:**
- AC-023a: the projects list shows each project with board count and done/total task counts.
- AC-023b: I can filter by product and program with clearable filter chips.
- AC-023c: an empty state prompts first-project creation, and a "no matches" message shows when filters exclude everything.
- AC-023d: opening a project takes me to its conversations by key, and an address of one of its former tabs opens it with that tool; an unknown key shows not-found.

---

### US-024 — Edit project settings

As a member, I want to edit a project's details, so that I can keep its metadata accurate.

**Acceptance criteria:**
- AC-024a: I edit name, description, and product/program association.
- AC-024b: the project key can be changed only while the project has no tasks; once any task exists the key is locked with an explanation.
- AC-024c: a changed key is validated (2–6 uppercase letters, unique) and rejected on collision.

---

### US-025 — Delete a project

As an admin, I want to delete a project, so that I can remove work that is no longer needed.

**Acceptance criteria:**
- AC-025a: deletion requires a confirmation step.
- AC-025b: confirming permanently removes the project together with all its boards and tasks.
- AC-025c: after deletion I am returned to the projects list.
- AC-025d: deleting stops the project's running work first, names what will be lost, and removes the project's storage on its site.

---

### US-026 — Manage a project's agent members

As a project admin, I want to assign and unassign agents on a project, so that the right agents can work in it.

**Acceptance criteria:**
- AC-026a: I add an agent as a project member from a picker that excludes existing members.
- AC-026b: I remove an agent from the project's members.
- AC-026c: adding the same agent twice is idempotent (no duplicate membership).

---

### US-027 — ~~Run all queued tasks in a project~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** Run all is replaced by an agent's Start and Start all agents; see US-439. Its criteria are retired with it.

As a member, I want to run every queued task in a project at once, so that I can kick off all ready work.

**Acceptance criteria:**
- ~~AC-027a: every queued task that has an assigned agent is dispatched.~~ *(Retired 2026-11-08)*
- ~~AC-027b: the action reports how many tasks were dispatched.~~ *(Retired 2026-11-08)*
- ~~AC-027c: tasks without an assigned agent are skipped.~~ *(Retired 2026-11-08)*

---

## Boards & Kanban

### US-028 — ~~Create a board~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** A board is a saved view, made by saving a view; see US-435. Its criteria are retired with it.

As a member, I want to create a board under a project, so that I can track tasks through columns.

**Acceptance criteria:**
- ~~AC-028a: I name the board and optionally pick a board template.~~ *(Retired 2026-11-08)*
- ~~AC-028b: creating from a template seeds the board's columns from it; without one I get default To Do / In Progress / Done columns, none starting work.~~ *(Retired 2026-11-08)*
- ~~AC-028c: a stale or deleted template reference falls back to default columns.~~ *(Retired 2026-11-08)*

---

### US-029 — ~~View and browse boards~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** Boards are saved views of the project's tasks; see US-435. Its criteria are retired with it.

As a member, I want to browse boards, so that I can find and open the one I need.

**Acceptance criteria:**
- ~~AC-029a: a project's boards page lists its boards; an org-wide boards page lists all boards with their project.~~ *(Retired 2026-11-08)*
- ~~AC-029b: a project's Boards tool lists its active boards and shows its archived ones behind a button.~~ *(Retired 2026-11-08)*
- ~~AC-029c: opening a board shows its columns with their tasks and its Backlog.~~ *(Retired 2026-11-08)*

---

### US-030 — ~~Move a task across columns~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** A card is dragged on a board of a kind; see US-435 and US-430. Its criteria are retired with it.

As a member, I want to drag a task between columns, so that I can track and trigger its progress.

**Acceptance criteria:**
- ~~AC-030a: moving a task to another column updates its column and state, and live-updates for other viewers.~~ *(Retired 2026-11-08)*
- ~~AC-030b: moving a task that has an agent into a column with auto-queue enabled queues it, for its agent's line; a task with no agent, or with a start time still to come, is not queued.~~ *(Retired 2026-11-08)*
- ~~AC-030c: moving a task into a done column un-archives it.~~ *(Retired 2026-11-08)*

---

### US-031 — ~~Edit a board's columns and settings~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** A type's columns are edited with the type; see US-433. Its criteria are retired with it.

As a member, I want to edit a board's columns, so that the board matches how the team works.

**Acceptance criteria:**
- ~~AC-031a: I can rename the board and add, remove, reorder and relabel its columns; Project Tasks cannot be edited.~~ *(Retired 2026-11-08)*
- ~~AC-031b: enabling auto-queue on a column immediately queues the tasks already in it that have an agent and no run pending.~~ *(Retired 2026-11-08)*
- ~~AC-031c: disabling auto-queue on a column returns its queued tasks to no run pending.~~ *(Retired 2026-11-08)*

---

### US-032 — ~~Run a board~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** Work starts per agent from the Workroom; see US-439. Its criteria are retired with it.

As a member, I want to run a whole board, so that all its ready tasks start at once.

**Acceptance criteria:**
- ~~AC-032a: every queued task on the board that has an assigned agent is dispatched.~~ *(Retired 2026-11-08)*
- ~~AC-032b: the action reports how many tasks were dispatched.~~ *(Retired 2026-11-08)*
- ~~AC-032c: tasks without an assigned agent are skipped.~~ *(Retired 2026-11-08)*

---

### US-033 — ~~Complete a board and roll over~~ *(Retired 2026-10-12)*

> **Retired 2026-10-12.** A board is archived, not completed, and a sprint is finished — see US-220 and US-221. Its criteria are retired with it.

As a member, I want to complete a board, so that finished work closes out and the next cycle begins.

**Acceptance criteria:**
- ~~AC-033a: completing marks the board Completed with a completion time.~~ *(Retired 2026-10-12)*
- ~~AC-033b: any task not in a done stage is moved back to the project backlog.~~ *(Retired 2026-10-12)*
- ~~AC-033c: a new board is created in the same series with the next sequential name and the same sprint duration.~~ *(Retired 2026-10-12)*

---

### US-034 — ~~View a board's series history~~ *(Retired 2026-10-12)*

> **Retired 2026-10-12.** There are no series; past sprints are read from the board (AC-221d). Its criteria are retired with it.

As a member, I want to see a board's prior cycles, so that I can trace a series over time.

**Acceptance criteria:**
- ~~AC-034a: on a board belonging to a series I see the other boards in that series with name, status, completion time, and project, newest-first.~~ *(Retired 2026-10-12)*

---

### US-035 — ~~Delete a board~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** A board is a saved view, and deleting it deletes no task; see US-435. Its criteria are retired with it.

As a member, I want to delete a board, so that I can remove one that is no longer used without losing its tasks.

**Acceptance criteria:**
- ~~AC-035a: deleting removes the board.~~ *(Retired 2026-11-08)*
- ~~AC-035b: the board's open tasks go to Project Tasks' Backlog and its done tasks to its Done column, rather than being deleted.~~ *(Retired 2026-11-08)*

---

### US-036 — ~~Create a board template~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** Board templates are replaced by task templates; see US-443. Its criteria are retired with it.

As a member, I want to save a column layout as a template, so that I can reuse it for new boards.

**Acceptance criteria:**
- ~~AC-036a: I create a template by naming it and defining its columns.~~ *(Retired 2026-11-08)*
- ~~AC-036b: a template must include at least one column for each of To Do, In Progress, and Done, or creation is rejected.~~ *(Retired 2026-11-08)*

---

### US-037 — ~~Edit a board template~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** Board templates are replaced by task templates; see US-443. Its criteria are retired with it.

As a member, I want to edit a board template, so that I can keep a reusable layout current.

**Acceptance criteria:**
- ~~AC-037a: I update a template's name, description, and columns.~~ *(Retired 2026-11-08)*
- ~~AC-037b: column changes re-validate the To Do / In Progress / Done coverage rule.~~ *(Retired 2026-11-08)*
- ~~AC-037c: built-in (system) templates cannot be modified.~~ *(Retired 2026-11-08)*

---

### US-038 — ~~Delete a board template~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** Board templates are replaced by task templates; see US-443. Its criteria are retired with it.

As a member, I want to delete a board template, so that I can remove one I no longer use.

**Acceptance criteria:**
- ~~AC-038a: I delete a non-system template.~~ *(Retired 2026-11-08)*
- ~~AC-038b: built-in (system) templates cannot be deleted.~~ *(Retired 2026-11-08)*

---

### US-039 — ~~Browse board templates~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** Board templates are replaced by task templates; see US-443. Its criteria are retired with it.

As a member, I want to browse available board templates, so that I can choose one when creating a board.

**Acceptance criteria:**
- ~~AC-039a: I list available board templates and view one with its columns.~~ *(Retired 2026-11-08)*

---

## Tasks

### US-040 — Create a task

As a member, I want to add a task, so that I can capture work for an agent or the backlog.

**Acceptance criteria:**
- AC-040a: I create a task with a title and optional description, board, column, assigned agent, priority, and labels.
- AC-040b: the task receives a per-project sequential key (e.g. `DASH-42`).
- AC-040c: a task created with no column starts in Backlog, on its type's Backlog column, last in the project's order; one added from a board column starts in that column.

---

### US-041 — Edit a task's details

As a member, I want to edit a task, so that I can keep it accurate as work evolves.

**Acceptance criteria:**
- AC-041a: I rename the task, edit its description, and change its priority, labels, and its type, column or state.
- AC-041b: I assign or unassign the task's agent.
- AC-041c: changes persist and update the task views (and the board, live).

---

### US-042 — Delete a task

As a member, I want to permanently delete a task, so that I can remove work captured in error.

**Acceptance criteria:**
- AC-042a: deletion is confirmed before it runs.
- AC-042b: the task is removed from all task lists.

---

### US-043 — Archive a task

As a member, I want to archive a task, so that I can hide completed or stale work without deleting it.

**Acceptance criteria:**
- AC-043a: an archived task is hidden from default task views.
- AC-043b: archived tasks reappear when "show archived" is toggled on.

---

### US-044 — ~~Revive a task~~ *(Retired 2026-10-12)*

> **Retired 2026-10-12.** Boards are never completed. Its criteria are retired with it.

As a member, I want to revive a task from a completed board, so that I can pick work back up in a later cycle.

**Acceptance criteria:**
- ~~AC-044a: reviving a task whose board is completed returns it to the project backlog.~~ *(Retired 2026-10-12)*
- ~~AC-044b: reviving a task whose board is not completed is rejected.~~ *(Retired 2026-10-12)*

---

### US-045 — Run a task with its assigned agent

As a member, I want to run a single task, so that its agent starts work on it now.

**Acceptance criteria:**
- AC-045a: running requires the task to have an assigned agent, else it is rejected.
- AC-045b: the task goes into its agent's line and starts as soon as the agent is free; if the agent is still working on another task in the project, the task says it is waiting for it.

---

### US-046 — ~~Return a task to the backlog~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** A task has a Backlog state, not a board's Backlog; see US-430. Its criteria are retired with it.

As a member, I want to return a task to the backlog, so that it leaves its column but stays with the board's project.

**Acceptance criteria:**
- ~~AC-046a: the task's column and sprint are cleared and its state reset to To do, while it stays on the board.~~ *(Retired 2026-11-08)*

---

### US-047 — ~~Move a task to another board~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** A task is on no board; see US-430. Its criteria are retired with it.

As a member, I want to move a task to another board, so that it follows the work it belongs to without being deleted.

**Acceptance criteria:**
- ~~AC-047a: the task lands in the other board's Backlog and a run queued for it is withdrawn.~~ *(Retired 2026-11-08)*
- ~~AC-047b: the task survives; it is never on no board.~~ *(Retired 2026-11-08)*

---

### US-048 — Clear a task's chat session

As a member, I want to clear a task's conversation, so that I can reset its agent context.

**Acceptance criteria:**
- AC-048a: clearing removes the task's session, its transcript, and its run history.
- AC-048b: clearing is blocked while the task is running.

---

### US-049 — Comment on a task

As a member, I want to comment on a task, so that I can collaborate with others and the agent.

**Acceptance criteria:**
- AC-049a: my comment is recorded against the task and attributed to me.
- AC-049b: the comment appears live to other viewers of the task.

---

### US-050 — Attach a file to a task

As a member, I want to attach files to a task, so that I can share context with its agent and others.

**Acceptance criteria:**
- AC-050a: I can upload a file of any type, up to a 10 MB limit (larger files are rejected).
- AC-050b: the attachment lists its filename, size, and optional label, and can be downloaded.
- AC-050c: every download needs me signed in and re-checks that I am a member of the task's project; holding the link grants nothing, and a private project's attachment answers not-found to anyone else.

---

### US-051 — Browse and find tasks

As a member, I want to search and filter tasks, so that I can locate work in a project or the work done for me anywhere.

**Acceptance criteria:**
- AC-051a: I view a project's tasks in its Tasks tool, and in Your tasks the tasks done on my behalf in every project I can see.
- AC-051b: I search by title or key and filter by agent, board, priority and project.
- AC-051c: I open a single task by its key; an invalid key format is rejected.

---

## Agents

### US-052 — Create an agent

As a member, I want to create an agent, so that I can put it to work on projects and in chat.

**Acceptance criteria:**
- AC-052a: I create an agent with a name, handle, role, and default model; the handle auto-generates from the name when left blank.
- AC-052b: a duplicate handle is rejected, and the reserved kernel handle cannot be used.
- AC-052c: the new agent appears in the shared agent list.

---

### US-053 — Edit an agent's configuration

As a member, I want to configure an agent, so that it behaves the way the work needs.

**Acceptance criteria:**
- AC-053a: I change the agent's name, handle, role, default model, runtime, approval, allowed tools, and allowed command patterns.
- AC-053b: renaming the handle is rejected on collision or for the reserved kernel handle.
- AC-053c: on the kernel agent the handle is fixed while other fields remain editable.

---

### US-054 — Delete an agent

As a member, I want to delete an agent, so that I can retire one that is no longer needed.

**Acceptance criteria:**
- AC-054a: deletion requires confirmation and removes the agent along with its sessions, runs, and transcripts.
- AC-054b: the kernel agent cannot be deleted.

---

### US-055 — Set an agent's avatar and cover image

As a member, I want to give an agent a face, so that it is recognisable in lists and detail views.

**Acceptance criteria:**
- AC-055a: I upload a JPEG, PNG, or WebP avatar or cover; non-image or oversize (over 5 MB) uploads are rejected.
- AC-055b: I can instead apply one of the built-in preset images.

---

### US-056 — Edit an agent's prompt documents

As a member, I want to edit an agent's profile and responsibilities documents, so that I can shape its behaviour.

**Acceptance criteria:**
- AC-056a: I edit the agent's instructions (its one `instructions.md`) and the content persists.
- AC-056b: only that document is editable; other files are refused.

---

### US-057 — Preview an agent's assembled prompt

As a member, I want to preview the prompt an agent will run with, so that I can check its configuration before using it.

**Acceptance criteria:**
- AC-057a: I preview the system prompt and user message for chat or task mode.
- AC-057b: the preview shows the prompt broken into labelled sections, with editable sections marked.

---

### US-058 — ~~Configure an agent's heartbeat and pulse it~~ *(Retired 2026-10-05)*

> **Retired 2026-10-05.** An agent has no schedule of its own; automation belongs to a project or a person's own tasks (US-187), and what the heartbeat did for an agent is now a routine (US-192). Its criteria are retired with it.

**Acceptance criteria:**
- AC-058a: ~~I toggle the heartbeat on or off and set its interval from the agent card or detail page.~~ *(Retired 2026-10-05)*
- AC-058b: ~~I can fire a one-off manual pulse.~~ *(Retired 2026-10-05)*
- AC-058c: ~~the detail page shows the last-heartbeat time, a countdown to the next pulse, and recent heartbeat runs.~~ *(Retired 2026-10-05)*

---

### US-059 — Stop an agent

As a member, I want to stop an agent, so that I can halt its activity immediately.

**Acceptance criteria:**
- AC-059a: stopping cancels all of the agent's pending and running runs; it switches nothing off, because an agent has no schedule of its own.
- AC-059b: the action reports how many runs were cancelled.

---

### US-060 — Export an agent

As a member, I want to export an agent, so that I can back it up or move it elsewhere.

**Acceptance criteria:**
- AC-060a: I export an agent to a downloadable archive named after its handle.
- AC-060b: the archive contains the agent's configuration, prompt documents, and skills, as they are now.

---

### US-061 — Import an agent

As a member, I want to import an agent archive, so that I can recreate or clone an agent.

**Acceptance criteria:**
- AC-061a: importing an archive whose handle is new creates an agent; a matching handle updates the existing one.
- AC-061b: the result reports whether the agent as a whole was created or updated.
- AC-061c: an invalid archive is rejected with a clear message.

---

### US-062 — View the agent list and detail

As a member, I want to browse agents and open one, so that I can see and manage the team of agents.

**Acceptance criteria:**
- AC-062a: I see all agents as cards with avatar, name, handle, role, task and session counts, model, and the work it has queued and running.
- AC-062b: opening an agent shows its place — my conversations with it, what it is doing now, its projects, runs, usage, instructions, memory and my settings for it — and its page under Organisation › Agents holds its instructions, skills, settings, permissions summary, projects and usage (AC-228b).
- AC-062c: an unknown handle shows a not-found state.

---

## Agent runs, approvals & logs

### US-063 — Approve a pending safety manifest

As a member, I want to approve an agent's requested tools, so that a restricted run can proceed.

**Acceptance criteria:**
- AC-063a: a run that asks for tools or command patterns outside its allowance is refused them, and they are listed as requests for review; a deferred run carries on with the rest of its work, an immediate run stops.
- AC-063b: approving starts the next run of the task or conversation, and that run alone is given what I approved (US-250); no run waits or resumes.
- AC-063c: approving a run that is not awaiting approval is rejected.

---

### US-064 — Reject a pending safety manifest

As a member, I want to reject an agent's requested tools, so that I can stop a run I do not authorise.

**Acceptance criteria:**
- AC-064a: rejecting records my supplied reason.
- AC-064b: a rejected task run posts a rejection comment and blocks the task until a person acts on it; a rejected conversation request starts its next run, told what was denied (AC-250d).

---

### US-065 — Cancel a running run

As a member, I want to cancel a run in progress, so that I can stop work that is no longer wanted.

**Acceptance criteria:**
- AC-065a: cancelling aborts the run and marks it cancelled with a "cancelled by user" reason.
- AC-065b: a run already finished is unaffected.

---

### US-066 — Stop all running sessions org-wide

As an admin, I want to stop all running agent activity, so that I can halt the workspace in an emergency.

**Acceptance criteria:**
- AC-066a: stopping cancels every pending and running run across the organisation.
- AC-066b: the action reports how many runs were cancelled.

---

### US-067 — ~~Clear my run history~~ *(Retired 2026-10-12)*

> **Retired 2026-10-12.** The Runs screen is a record that cannot be cleared; `clearAgentRuns` was removed with the debug page. Its criteria are retired with it.

As a member, I want to clear my run history, so that I can tidy up my past activity.

**Acceptance criteria:**
- ~~AC-067a: clearing removes the run records belonging to my own chat sessions.~~ *(Retired 2026-10-12)*

---

### US-068 — View run history

As a member, I want to see recent and per-task runs, so that I can review what agents have done.

**Acceptance criteria:**
- AC-068a: my runs, on the Runs screen, newest first (US-251).
- AC-068b: a per-task view lists that task's runs newest-first.

---

### US-069 — Inspect a run's tool-call log

As a member, I want to audit what an agent did during a run, so that I can verify its actions and risk.

**Acceptance criteria:**
- AC-069a: the tool-call log lists every tool call for a run in order, each showing the tool, its target, a risk level, and whether it was blocked with a reason.
- AC-069b: I can see the tools and command patterns awaiting approval for a session, and a run's current approval status.

---

### US-070 — Risk-rate and gate tool calls during a run

As the platform, I want to rate and gate every tool call against risk rules, so that dangerous actions are blocked or surfaced for approval.

**Acceptance criteria:**
- AC-070a: each tool call is assigned a risk level using the site's custom risk rules first, then built-in defaults.
- AC-070b: tools or command patterns set to "never" are blocked and logged with a reason.
- AC-070c: with Immediate approval the first out-of-allowance call stops the run and asks at once; with Deferred approval such calls are refused and listed, and the run carries on (AC-234a).

---

## Skills

> *Changed 2026-10-28:* the skills unit made every Library item an installed, versioned asset. Installing pins a version rather than copying (US-071 to US-075 as they read below are met by US-398 to US-401), editing an installed skill makes a draft and then a version, and an agent's skills are had from the installed set (US-403).

### US-071 — Browse the skills library

As a member, I want to browse available skills, so that I can see what capabilities I can give agents.

**Acceptance criteria:**
- AC-071a: I browse bundled (built-in) skills and org-created skills in Library › Skills, each marked by where it comes from, and filter by it.
- AC-071b: selecting a skill shows its rendered content.

---

### US-072 — Create an org skill

As a member, I want to author an org skill, so that the team has a reusable capability.

**Acceptance criteria:**
- AC-072a: I create a skill with a slug, name, description, and content; the slug is derived and validated.
- AC-072b: the new skill becomes browsable in the org library.

---

### US-073 — Edit an org skill

As a member, I want to edit an org skill, so that I can keep its content current.

**Acceptance criteria:**
- AC-073a: editing updates the skill's name, description, and content.
- AC-073b: bundled (platform) skills are read-only.

---

### US-074 — Delete an org skill

As a member, I want to delete an org skill, so that I can remove one the team no longer needs.

**Acceptance criteria:**
- AC-074a: deleting removes the skill from the org library.

---

### US-075 — Install a skill onto the organisation

As a member, I want to install a library skill, so that agents pick it up at runtime.

**Acceptance criteria:**
- AC-075a: installing a library skill makes it active for the organisation, carried with provenance information.
- AC-075b: active skills are made available to agent runs.

---

### US-076 — Author a custom skill on an agent

As a member, I want to add a skill directly to an agent, so that it has a capability without going through the library.

**Acceptance criteria:**
- AC-076a: I create or update a named skill on a specific agent and it appears in that agent's skill list.
- AC-076b: I delete a skill from an agent.

---

## Agent & workforce templates

### US-077 — Browse agent templates

As a member, I want to browse agent templates, so that I can start from a pre-built role.

**Acceptance criteria:**
- AC-077a: the Agents tab lists available agent templates, each with a suggested handle.

---

### US-078 — Apply an agent template

As a member, I want to apply an agent template, so that I get a fully configured agent in one step.

**Acceptance criteria:**
- AC-078a: I enter or accept a handle and apply the template, creating a fully configured agent (workspace, identity, runtime config, bundled skills).
- AC-078b: a handle that already exists is rejected and no agent is created.

---

### US-079 — Browse workforce templates

As a member, I want to browse workforce templates, so that I can stand up a whole team at once.

**Acceptance criteria:**
- AC-079a: Library › Teams lists each workforce template with its name, description and where it comes from.
- AC-079b: selecting one opens its review page.

---

### US-080 — Review and tailor a workforce template

As a member, I want to customise a workforce bundle before applying, so that I create only what I want.

**Acceptance criteria:**
- AC-080a: I see the bundle's teams, agents, skills, projects, and boards, all included by default, and can toggle any in or out (disabling a team disables its agents and skills).
- AC-080b: handle collisions against existing agents are detected and pre-resolved, and I can edit any agent's handle before applying.

---

### US-081 — Apply a workforce template directly

As a member, I want to apply a tailored workforce bundle, so that its agents, teams, projects, and boards are created together.

**Acceptance criteria:**
- AC-081a: applying creates all included agents, teams, projects, and boards.
- AC-081b: teams are created disabled, and no task starts by itself until the project's automation is on.
- AC-081c: on failure an error is shown and nothing is left partly created.

---

### US-082 — Review an agent-proposed workforce template

As a member, I want to review a workforce an agent proposed, so that I can decide before it is assembled.

**Acceptance criteria:**
- AC-082a: an agent-proposed bundle opens in review with its proposal context and any previously saved draft restored.

---

### US-083 — Save review progress on a proposed workforce

As a member, I want to save my in-progress review, so that I can return to it later.

**Acceptance criteria:**
- AC-083a: I save my current selections as a draft, confirmed with a saved-time indicator.
- AC-083b: the draft is restored when I return to the review.

---

### US-084 — Confirm and queue a proposed workforce

As a member, I want to confirm a reviewed proposal, so that it is queued for assembly.

**Acceptance criteria:**
- AC-084a: confirming applies the proposal at once and finishes it, with no run queued.
- AC-084b: I am returned to the organisation page.

---

### US-085 — See pending workforce proposals

As a member, I want to see proposals awaiting review, so that I can act on what agents have suggested.

**Acceptance criteria:**
- AC-085a: pending proposals are listed with their title so I can open each for review.

---

## Sessions & Chat

### US-086 — Start a chat session

As a member, I want to start a chat with an agent, so that I can work with it conversationally.

**Acceptance criteria:**
- ~~AC-086a: I create a session with a chosen agent; it opens active with a default title.~~ *(Retired 2026-10-18 — the `conversations` flag and the chat path it kept are removed; conversations are held in hq and start as AC-316a says)*
- ~~AC-086b: creating a session against a non-existent agent is rejected.~~ *(Retired 2026-10-18 — the `conversations` flag and the chat path it kept are removed; conversations are held in hq and start as AC-316a says)*
- AC-086c: when a chat cannot start — its site is unreachable, my role is refused, no credential is usable — I am told the reason where I tried to start it.

---

### US-087 — Send a message and get a reply

As a member, I want to message an agent and get a response, so that I can collaborate in real time.

**Acceptance criteria:**
- AC-087a: I send a message into a session and the agent responds, with the reply streaming in rather than appearing all at once.
- AC-087b: I can only send into a session I own.
- AC-087c: my message is kept whatever happens, and when a reply fails I can still see why after reloading.
- AC-087d: when my run has to wait behind someone else's in the same project, I am told it is waiting.

---

### US-088 — Auto-name a new conversation

As a member, I want a new chat to name itself, so that I can recognise it later without renaming it.

**Acceptance criteria:**
- AC-088a: a session still titled "New Conversation" is renamed from the first user message.
- AC-088b: the generated title is the first few words of that message.

---

### US-089 — Rename a session and change its model

As a member, I want to rename a session and switch its model, so that I can organise chats and control which model answers.

**Acceptance criteria:**
- AC-089a: I rename a session inline.
- AC-089b: I change the model used for the session, and the new model takes effect on the next message.
- AC-089c: these changes apply only to my own sessions.

---

### US-090 — Archive a session

As a member, I want to archive a session, so that I can keep my active list focused.

**Acceptance criteria:**
- AC-090a: archiving sets the session aside and it can be filtered out of the active list.
- AC-090b: archiving applies only to my own sessions.

---

### US-091 — Browse and open my chat sessions

As a member, I want to see my chats, so that I can return to past conversations.

**Acceptance criteria:**
- ~~AC-091a: in each place I see my own conversations there, newest activity first, grouped by day, each showing the agent, its title, a preview, and the time or that it is working.~~ *(Retired 2026-10-18 — chat sessions are no longer listed; a place's conversations are listed as AC-327d says)*
- ~~AC-091b: opening a session shows its full transcript in order.~~ *(Retired 2026-10-18 — chat sessions no longer open; a conversation opens in its thread)*

---

### US-092 — Stop my running session

As a member, I want to stop a session that is running, so that I can halt its agent's current work.

**Acceptance criteria:**
- AC-092a: stopping a session cancels its pending and running runs and reports how many were cancelled.

---

### US-093 — Delete a session

As a member, I want to delete a session, so that I can remove a chat I no longer need.

**Acceptance criteria:**
- AC-093a: deleting cancels any active runs on the session and then removes the session and its transcript.

---

### US-094 — Use voice input in a session

As a member, I want to dictate messages by voice, so that I can talk to an agent hands-free.

**Acceptance criteria:**
- AC-094a: I can dictate messages by voice when a speech-to-text provider is configured, into the message box and in voice (see US-325, US-326).
- AC-094b: a clear error is shown when no listening provider works or it is unreachable (AC-361a). *(Changed 2026-10-23)*

---

## Products, Programs & Wiki

### US-095 — Create a product

As a member, I want to create a product, so that I can group projects under a product line.

**Acceptance criteria:**
- AC-095a: I create a product with a name, slug, and optional description, vision, and status.
- AC-095b: the new product appears in the products list and opens to its detail page.

---

### US-096 — Edit a product

As an admin, I want to edit a product, so that I can keep its details current.

**Acceptance criteria:**
- AC-096a: I edit the product's name, slug, description, vision, and status.
- AC-096b: ~~I set a wiki sync interval, which must be off or at least five minutes.~~ *(Retired 2026-09-26 — the product wiki was never built)*

---

### US-097 — Delete a product

As a member, I want to delete a product, so that I can remove a product line without losing its projects.

**Acceptance criteria:**
- AC-097a: deleting removes the product but detaches (keeps) its projects rather than deleting them.

---

### US-098 — Browse products

As a member, I want to browse products, so that I can navigate the product portfolio.

**Acceptance criteria:**
- AC-098a: I view a list of products with each product's project count.
- AC-098b: I open a product to its projects and settings, or directly by its slug; a product groups projects and owns no files, members or wiki.

---

### US-099 — Create a program

As a member, I want to create a program, so that I can group projects under an initiative.

**Acceptance criteria:**
- AC-099a: I create a program with a name and optional slug, description, and status.
- AC-099b: a supplied slug must be unique; otherwise one is derived from the name.

---

### US-100 — Edit a program

As a member, I want to edit a program, so that I can keep its details current.

**Acceptance criteria:**
- AC-100a: I edit the program's name, slug, description, and status.

---

### US-101 — Delete a program

As a member, I want to delete a program, so that I can remove an initiative without losing its projects.

**Acceptance criteria:**
- AC-101a: deleting removes the program but detaches (keeps) its projects rather than deleting them.

---

### US-102 — Browse programs

As a member, I want to browse programs, so that I can navigate initiatives.

**Acceptance criteria:**
- AC-102a: I view a list of programs with each program's project count.
- AC-102b: I open a program to its detail and linked projects, or directly by its slug.

---

### US-103 — ~~Manage product members~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** Products group projects and own nothing, and the product wiki was never built as a feature (ADR-0061, ADR-0039). Its criteria are retired with it.

As a member, I want to manage a product's member agents, so that the right agents have access to its wiki and context.

**Acceptance criteria:**
- AC-103a: I add an agent as a product member and remove one.
- AC-103b: I view the current list of product member agents.

---

### US-104 — ~~Create a wiki repo for a product~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** Products group projects and own nothing, and the product wiki was never built as a feature (ADR-0061, ADR-0039). Its criteria are retired with it.

As a member, I want to create a wiki for a product, so that agents have a shared knowledge base.

**Acceptance criteria:**
- AC-104a: I create a new private wiki repository for a product, seeded with starter files, requiring GitHub to be configured first.
- AC-104b: if a matching repository already exists it is linked instead of failing.
- AC-104c: the repository is cloned locally and access is provisioned so agents can use it.

---

### US-105 — ~~Link an existing wiki repo~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** Products group projects and own nothing, and the product wiki was never built as a feature (ADR-0061, ADR-0039). Its criteria are retired with it.

As a member, I want to link an existing repository as a product's wiki, so that I can reuse an existing knowledge base.

**Acceptance criteria:**
- AC-105a: I link an existing repository URL as the product's wiki when none is linked and GitHub is configured.
- AC-105b: the repository is cloned locally and access provisioned; if any step fails the link is rolled back.

---

### US-106 — ~~Unlink a wiki repo~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** Products group projects and own nothing, and the product wiki was never built as a feature (ADR-0061, ADR-0039). Its criteria are retired with it.

As a member, I want to unlink a product's wiki, so that I can detach a knowledge base.

**Acceptance criteria:**
- AC-106a: unlinking clears the product's wiki, revokes access, and removes the local copy.
- AC-106b: unlinking is rejected when no wiki is linked; the repository itself is not deleted.

---

### US-107 — ~~Browse a product's wiki~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** Products group projects and own nothing, and the product wiki was never built as a feature (ADR-0061, ADR-0039). Its criteria are retired with it.

As a member, I want to read a product's wiki, so that I can find shared knowledge.

**Acceptance criteria:**
- AC-107a: I browse the wiki's folder and file tree with breadcrumbs.
- AC-107b: I open a file and read its rendered content with its title and metadata.
- AC-107c: I see a helpful state when no wiki is linked or it has not yet synced.

---

## Teams & Organisation

### US-108 — Create a team

As a member, I want to create a team of agents, so that I can organise the workforce.

**Acceptance criteria:**
- AC-108a: I create a group of people and agents with a name and purpose and choose who is in it (AC-258a).
- AC-108b: the new team appears in the teams list with its members and count.

---

### US-109 — Edit a team

As a member, I want to edit a team, so that I can keep its details and membership current.

**Acceptance criteria:**
- AC-109a: I rename a team, change its purpose, and add or remove member agents.
- AC-109b: changes persist and update the team's member list and count.

---

### US-110 — Delete a team

As a member, I want to delete a team, so that I can remove one no longer used.

**Acceptance criteria:**
- AC-110a: I delete a team from the list or its detail page; the detail page asks for confirmation.
- AC-110b: member agents are unaffected by the deletion.

---

### US-111 — View teams and members

As a member, I want to view teams and their members, so that I can see how the workforce is organised.

**Acceptance criteria:**
- AC-111a: I see all teams as cards and open a team to its people, agents and projects (AC-258b).
- ~~AC-111b: a banner warns when agents are not assigned to any team.~~ *(Retired 2026-10-12 — the banner about agents on no team is gone)*

---

### US-112 — View the organisation profile

As a member, I want to see the organisation profile, so that I understand its identity and direction.

**Acceptance criteria:**
- AC-112a: I see the organisation name, vision, mission, and agent/team/project counts.

---

### US-113 — Edit the organisation profile

As an admin, I want to edit the organisation profile, so that its identity and direction are accurate for the team and its agents.

**Acceptance criteria:**
- AC-113a: I edit the organisation name, vision, and mission and the changes are reflected on the organisation page.
- AC-113b: the saved profile is mirrored to a file that agents can read for organisation direction.

---

## GitHub integration

### US-114 — ~~Configure the GitHub connection~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** GitHub is connected through a GitHub App, not a personal access token (US-150). Its criteria are retired with it.

As an admin, I want to connect GitHub, so that the workspace can create and access repositories.

**Acceptance criteria:**
- AC-114a: I enter a personal access token and verify it; verification returns the GitHub login and accessible organisations.
- AC-114b: I choose whether new repositories are created under the personal account or a selected organisation, and save.
- AC-114c: an invalid or insufficient token shows an authentication error.

---

### US-115 — ~~Disconnect the GitHub connection~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** GitHub is connected through a GitHub App, not a personal access token (US-150). Its criteria are retired with it.

As an admin, I want to disconnect GitHub, so that I can remove the workspace's GitHub access.

**Acceptance criteria:**
- AC-115a: disconnecting clears the configured token after a confirmation that warns syncing and access provisioning will stop.

---

### US-116 — ~~See the GitHub connection status~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** GitHub is connected through a GitHub App, not a personal access token (US-150). Its criteria are retired with it.

As a member, I want to see whether GitHub is connected, so that I know if repository features are available.

**Acceptance criteria:**
- AC-116a: the page shows whether GitHub is configured and under which account or organisation repositories are created.

---

### US-117 — ~~Create a repository for a project~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** A repository is connected to storage (a person's files, a project or a workspace), not to a project record; no deploy keys are provisioned (US-150). Its criteria are retired with it.

As a member, I want to create a GitHub repository for a project, so that its agents have a codebase to work in.

**Acceptance criteria:**
- AC-117a: creating makes a private repository named after the project, initialised and with access provisioned automatically.
- AC-117b: if a matching repository already exists it is linked instead of failing.
- AC-117c: creating is rejected when GitHub is not configured or the project already has a repository.

---

### US-118 — ~~Link an existing repository to a project~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** A repository is connected to storage (a person's files, a project or a workspace), not to a project record; no deploy keys are provisioned (US-150). Its criteria are retired with it.

As a member, I want to link an existing repository to a project, so that its agents work in our existing codebase.

**Acceptance criteria:**
- AC-118a: I link an existing repository URL and access is provisioned automatically.
- AC-118b: if access provisioning fails the link is rolled back so the project is never linked without working access.
- AC-118c: linking is rejected when the project already has a repository or GitHub is not configured.

---

### US-119 — ~~Unlink a project's repository~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** A repository is connected to storage (a person's files, a project or a workspace), not to a project record; no deploy keys are provisioned (US-150). Its criteria are retired with it.

As a member, I want to unlink a project's repository, so that I can detach a codebase.

**Acceptance criteria:**
- AC-119a: unlinking revokes the project's access and clears the link; the repository itself is not affected.
- AC-119b: unlinking is rejected when no repository is linked.

---

## US-150 — GitHub integration via a GitHub App

As an operator, I connect GitHub once through a GitHub App so the platform and its
agents can create repos, push approved workflows, manage secrets, dispatch runs, and
do git — without a long-lived personal access token and without per-repo SSH keys.

- AC-150a — Connecting GitHub registers (or links) a GitHub App; its private key is stored encrypted at rest, never in plaintext.
- AC-150b — Every GitHub credential is a short-lived token scoped to a single repository, minted on demand.
- AC-150c — All operations (workflows, runs, secrets, dispatch) use the App, not a PAT. *(Changed 2026-10-25: a secret reaches GitHub only through the approved `set-github-secrets` workflow, and every token goes through one gate with only the permissions asked for — AC-382a, AC-382f)*
- AC-150d — Git access (clone/push) never persists a credential in the repo's git config.
- ~~AC-150e — An agent doing git in its container receives a repo-scoped short-lived token and holds no durable credential.~~ *(Retired 2026-10-25 — the agent's container receives no GitHub token at all; it shares commits through the approved `push` workflow, AC-377c)*

---

## US-151 — Preview project files in-app (read-only)

As a user, I open a project's Files and view a file's content in-app — markdown rendered,
code syntax-highlighted, images shown — without leaving the app or editing it.

- AC-151a — Selecting a file renders its content by type: markdown rendered, code highlighted, images displayed.
- ~~AC-151b: Reading is read-only and path-safe; non-previewable files (binary / too large) show a clear notice instead of rendering.~~ *(Retired 2026-11-04 — the frame's states, AC-390a to AC-390c, replace it)*

---

## Settings, Users & Voice

### US-120 — View my profile

As a member, I want to view my profile, so that I can see my account details.

**Acceptance criteria:**
- AC-120a: I see my user id, role, and member-since date.

---

### US-121 — Set my voice preferences

**Retired 2026-10-17** — voice is one way, hands-free and sent on a pause; the input modes, the turn-detection modes and their settings were removed (US-325).

- ~~AC-121a: I choose a voice input mode, a turn-detection mode, and the related trigger word or silence threshold.~~ Retired 2026-10-17.
- ~~AC-121b: saving persists my choices and confirms.~~ Retired 2026-10-17.

---

### US-122 — Manage members and roles

As an admin, I want to manage members' roles, so that people have the right level of access.

**Acceptance criteria:**
- AC-122a: I see all members with username, role, and joined date.
- AC-122b: I change another member's role; I cannot change my own role.
- AC-122c: non-admins cannot access member management.
- AC-122d: only an admin can invite, revoke, list, change a role, remove a person or create an account by hand; anyone else is told the role needed.
- AC-122e: a role change applies to the person's very next action.
- AC-122f: removing a person from the organisation deactivates them and deletes nothing, is refused, naming the projects, while it would leave a project without an admin, and asks where their open tasks go; erasing is a separate act on someone who has left.

---

### US-123 — Edit HQ's identity

As an admin, I want to edit HQ's name and description, so that the installation is identified correctly.

**Acceptance criteria:**
- AC-123a: I edit HQ's name and description; an empty name is rejected.

---

### US-124 — Manage tool risk rules

As an admin, I want to define risk rules for tool calls, so that the platform gates agent actions to our policy.

**Acceptance criteria:**
- AC-124a: I add, edit, and remove rules that map a pattern to a risk level.
- AC-124b: rules are evaluated before the built-in defaults, first match wins.

---

### US-125 — View environment and version status

As an admin, I want to see environment and version status, so that I can diagnose configuration and confirm the build.

**Acceptance criteria:**
- AC-125a: I see each server environment variable with whether it is set (never its value).
- AC-125b: I see the build version, commit, and build timestamp.

---

### US-145 — ~~Test an external LLM provider~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** Testing a provider key from settings was removed; a stored key is not tested when saved. Its criteria are retired with it.

As an admin, I want to test an external LLM provider's key from settings, so that I can verify or rotate model credentials outside the setup wizard.

**Acceptance criteria:**
- AC-145a: I test an external LLM provider key from settings and see a pass/fail result, with the provider's error on failure.

---

### US-126 — ~~Configure voice providers~~ *(Retired 2026-10-23 — US-355)*

As an admin, I want to configure speech-to-text and text-to-speech providers, so that voice chat works.

**Acceptance criteria:**
- ~~AC-126a: I add or replace the speech-to-text and text-to-speech provider keys; each key is verified against the provider before it is stored.~~ *(Retired 2026-10-23 — providers are added on Providers; US-355)*
- ~~AC-126b: a rejected key surfaces the provider's error.~~ *(Retired 2026-10-23 — providers are added on Providers; US-355)*
- ~~AC-126c: I see only a masked key and a status, never the full key.~~ *(Retired 2026-10-23 — providers are added on Providers; US-355)*

---

### US-127 — Preview and browse voices

As an admin, I want to preview available voices, so that I can choose how agents sound.

**Acceptance criteria:**
- AC-127a: I list available voices from the configured provider and play a sample for a chosen voice.
- AC-127b: listing and preview fail clearly when no text-to-speech provider works. *(Changed 2026-10-23)*

---

### US-128 — ~~Remove a voice provider~~ *(Retired 2026-10-23 — US-355)*

As an admin, I want to remove a voice provider, so that I can disable voice or rotate providers.

**Acceptance criteria:**
- ~~AC-128a: removing a provider deletes its configuration and returns the section to "not configured".~~ *(Retired 2026-10-23 — a provider is removed on Providers; US-355)*

---

### US-129 — Set an agent's voice

As a member, I want to give an agent a voice, so that it can speak in voice chat.

**Acceptance criteria:**
- AC-129a: every agent has a voice, chosen from the provider's list on its page, and nothing can turn it off (AC-360b, AC-360e). *(Changed 2026-10-23)*

---

## Mobile, MCP & HQ integration

### US-130 — Pair a mobile device

As a member, I want to pair a mobile device, so that I can use the mobile app against this HQ.

**Acceptance criteria:**
- AC-130a: generating a pairing code produces a single-use code shown as a QR code and a copyable link.
- AC-130b: the code is valid for five minutes with a visible countdown and can be regenerated when expired.

---

### US-131 — Complete mobile pairing

As the mobile app, I want to exchange a pairing code for a session, so that the device is signed in.

**Acceptance criteria:**
- AC-131a: exchanging a valid code creates a long-lived device session and signs the device in.
- AC-131b: a used, expired, or unknown code is rejected with the corresponding reason.

---

### US-132 — ~~Generate the MCP key~~ *(Retired 2026-10-05)*

> **Retired 2026-10-05.** The org-wide key is gone; a person creates their own connection to hq instead (US-195). Its criteria are retired with it.

**Acceptance criteria:**
- AC-132a: ~~generating mints a key and shows it once with a warning it will not be shown again, plus a copyable client configuration.~~ *(Retired 2026-10-05)*
- AC-132b: ~~once a key exists, only its prefix and creation time are shown.~~ *(Retired 2026-10-05)*

---

### US-133 — ~~Re-issue the MCP key~~ *(Retired 2026-10-05)*

> **Retired 2026-10-05.** There is no org-wide key to re-issue; a connection is renewed or revoked by its person (US-195). Its criteria are retired with it.

**Acceptance criteria:**
- AC-133a: ~~re-issuing prompts a confirmation that the existing key stops working immediately.~~ *(Retired 2026-10-05)*
- AC-133b: ~~on confirm a fresh key is minted and shown once, and the old key is invalidated.~~ *(Retired 2026-10-05)*

---

### US-134 — Authenticate an MCP client

As an external MCP client acting for a person, I want to authenticate with that person's connection, so that I can reach the tools that person has allowed me.

**Acceptance criteria:**
- AC-134a: a request with a valid connection token is served; a missing, unknown, expired or revoked token is rejected.
- AC-134b: a tool outside the connection's permissions is refused, naming the permission to turn on.

---

### US-135 — Propose a workforce template via MCP

As an external MCP client, I want to propose a workforce template, so that a human can review and assemble it.

**Acceptance criteria:**
- AC-135a: I list available workforce templates and propose one by id.
- AC-135b: proposing creates an item awaiting review with the proposal attached and a review link.
- AC-135c: proposing an unknown template id returns a not-found error.

---

### US-136 — ~~Connect this site to an HQ instance~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** The browser-approval link to a central service was removed; a site now registers by device approval (US-179, US-183) or is paired by configuration (US-162). Its criteria are retired with it.

As an admin, I want to connect the site to HQ, so that it can be managed and aggregated centrally.

**Acceptance criteria:**
- AC-136a: I start a connection with a preset or custom HQ URL and am taken to HQ to authorize it.
- AC-136b: an invalid URL is rejected; starting a connection clears any existing one.
- AC-136c: the page tracks the connection advancing to active.

---

### US-137 — ~~Redeem an HQ invite~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** The browser-approval link to a central service was removed; a site now registers by device approval (US-179, US-183) or is paired by configuration (US-162). Its criteria are retired with it.

As an admin, I want to redeem an HQ invite, so that I can connect the site from an invite instead of a URL.

**Acceptance criteria:**
- AC-137a: I upload or paste an invite and see a preview of the HQ, organisation, sender, and expiry before submitting.
- AC-137b: an invalid invite shows an error; a valid one links the site and starts the connection.

---

### US-138 — ~~Cancel an in-flight HQ authorization~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** The browser-approval link to a central service was removed; a site now registers by device approval (US-179, US-183) or is paired by configuration (US-162). Its criteria are retired with it.

As an admin, I want to cancel a pending HQ connection, so that I can abandon a connection I started by mistake.

**Acceptance criteria:**
- AC-138a: cancelling removes a connection still being authorized while leaving an active connection untouched.

---

### US-139 — ~~Unlink or change the HQ connection~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** The browser-approval link to a central service was removed; a site now registers by device approval (US-179, US-183) or is paired by configuration (US-162). Its criteria are retired with it.

As an admin, I want to disconnect from HQ, so that I can detach the site or move it to another HQ.

**Acceptance criteria:**
- AC-139a: disconnecting, after confirmation, notifies HQ, clears the link, and stops the connection.

---

### US-140 — ~~Force an HQ reconnect~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** The browser-approval link to a central service was removed; a site now registers by device approval (US-179, US-183) or is paired by configuration (US-162). Its criteria are retired with it.

As an admin, I want to force a reconnect, so that I can recover a degraded HQ connection.

**Acceptance criteria:**
- AC-140a: triggering a reconnect restarts the HQ connection.

---

### US-141 — ~~View HQ connection and sync status~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** The browser-approval link to a central service was removed; a site now registers by device approval (US-179, US-183) or is paired by configuration (US-162). Its criteria are retired with it.

As an admin, I want to see the HQ connection and sync status, so that I can confirm the site is connected and in sync.

**Acceptance criteria:**
- AC-141a: I see the current status with the site's identity and the HQ instance.
- AC-141b: an active connection shows live per-entity sync totals, pending counts, and last sync times.

---

### US-142 — ~~Provision and broker a session for an HQ user~~ *(Retired 2026-09-26)*

> **Retired 2026-09-26.** The browser-approval link to a central service was removed; a site now registers by device approval (US-179, US-183) or is paired by configuration (US-162). Its criteria are retired with it.

As HQ, I want to provision a user and broker a session on this site, so that an HQ user can act on the site directly.

**Acceptance criteria:**
- AC-142a: provisioning ensures a site-local user exists for the HQ user, idempotently.
- AC-142b: brokering mints a real session for that user so the HQ-directed browser can call the site.
- AC-142c: requests without a valid connection token are rejected.

---

## Notifications

### US-143 — View my notifications

As a member, I want to see my notifications, so that I keep track of what needs my attention.

**Acceptance criteria:**
- AC-143a: I see my own notifications, those that need me first and the rest under Earlier, newest first within each, with dismissed ones excluded and read ones still visible.
- AC-143b: each is two lines and one action: what it is, then why, with its time and one button.
- AC-143c: a task appears once, by its latest request.
- AC-143d: a request leaves what needs me by itself once its run moves on or someone answers it.
- AC-143e: when a task done on my behalf stops and needs me, I am told, once.
- AC-143f: I approve a request with its one button, or open it in the panel to read what the agent wants to run and why, then approve or deny it.

---

### US-144 — Mark notifications read and dismiss them

As a member, I want to clear my notifications, so that I can manage what I have seen.

**Acceptance criteria:**
- AC-144a: what has been in view in the open panel is marked seen by itself, without my scrolling, and stays visible.
- AC-144b: I dismiss an earlier notification and it no longer appears in my list; one that needs me stays until it is handled.

---

## Responsive / mobile

### US-146 — Use HQ from a phone browser

As an operator away from my desk, I want HQ to work in my phone's browser, so that I can reach and direct my agent without the native app.

**Acceptance criteria:**
- AC-146a: on a phone-width screen the authenticated HQ app is single-column with no horizontal overflow.
- AC-146b: the left navigation collapses to a hamburger-triggered drawer; selecting a destination navigates and closes it.
- AC-146c: Notifications and Runs are reachable at the top right of the phone's header and open full screen, closed from the panel's own header.
- AC-146d: table-style list views are readable on a phone (rows stack into cards); the desktop table layout is unchanged on large screens.
- AC-146e: the core remote loop — open chat, message an agent, view a board, open a task — is fully usable on a phone.
- AC-146f: the responsive work introduces no desktop regression — at large screens the full shell (the navigation inline, the screen bar and the screen, a panel beside the navigation) renders, not the phone's header and drawer.
- AC-146g: the Notifications and Runs buttons sit beside the logo on a wide screen and in the header on a phone; there is no top bar and no right rail.
- ~~AC-146h: on a phone, a place's facts and tools open as a full-screen page, and each tool as its own screen.~~ *(Retired 2026-10-18 — a place shows the same sections in the drawer on a phone; US-329)*

## US-147 — ~~Preview an agent's web app before it deploys~~ *(Retired 2026-11-02)*

> **Retired 2026-11-02.** The old preview, a process in the boundary's container served through hq, is gone. A live preview of a branch replaces it: US-416 to US-421. Its criteria are retired with it.

As an operator, I want to open a private URL and see the running web app the agent is building, so that I can review its work from anywhere before anything goes live.

**Acceptance criteria:**
- ~~AC-147a: starting a preview returns a private, unguessable URL surfaced in chat.~~ *(Retired 2026-11-02 — an app's address is its own and cannot be guessed, AC-416d)*
- ~~AC-147b: opening the URL serves the live app with hot-reload; an unauthorized requester is refused.~~ *(Retired 2026-11-02 — the app shows beside the conversation and reloads, AC-416b, AC-416c, AC-416d)*
- ~~AC-147c: the preview runs as a process inside its storage boundary's existing container, never in a second container, and publishes no port.~~ *(Retired 2026-11-02 — a live preview runs in a container of its own that binds only the branch's copy, AC-421a)*
- ~~AC-147d: idle previews are torn down automatically.~~ *(Retired 2026-11-02 — an unused live preview stops after its site's idle time, AC-420c)*

---

## US-148 — Operate a project's GitHub Actions from Agenthix

As an operator, I want to see and run my project's GitHub Actions workflows and manage their secrets from Agenthix, so that I can run deployments and operations without leaving the platform.

**Acceptance criteria:**
- AC-148a: I can see the project's GitHub Actions workflows and recent runs (status, run number, commit), each linking to the run on GitHub. *(Changed 2026-10-25: a connected workspace's About lists each GitHub workflow with its last run, AC-380e)*
- ~~AC-148b: I can trigger a workflow run from Agenthix.~~ *(Retired 2026-10-25 — there is no Run button for a GitHub workflow; one is started by an approved workflow, with `actions: write`, or on GitHub)*
- ~~AC-148c: I can set a secret value that is stored in GitHub; Agenthix keeps no copy and never displays the value.~~ *(Retired 2026-10-25 — a secret is kept in the place's Secrets and reaches GitHub only as an environment secret, through the approved `set-github-secrets` workflow, AC-376a, AC-382c, AC-382f)*
- AC-148d: I can see which secrets are set on the repo (name + last-updated) without ever seeing their values. *(Changed 2026-10-25: each also says whether it came from Secrets or was set outside HQ, AC-380e)*

> Approval/promotion of GitHub workflow *changes* is via GitHub's own PR review + branch protection, not Agenthix. *(Changed 2026-10-25: the platform's own workflows, which use a place's secrets, are approved in Agenthix, US-375.)*

## US-149 — Organise storage as files + workspaces per owner

As an operator, I want each project, product, program — and myself — to have a **files** area for documents plus the **workspaces** (code units) it owns, so storage has a clear, permanent home and the agent can work in the right place. *(Implements `adr-0039`.)*

- AC-149a: Each project, and I personally, have a **files** area for documents and notes; a product groups projects and owns no files of its own (AC-098b), and there is no wiki.
- AC-149b: I can create named **workspaces** owned by a project or by me and browse them in the place's Workspaces tool; a workspace's address opens it there. Ownership is permanent.
- AC-149c: I can connect a GitHub repo to a files area **or** a workspace (back up / connect) and disconnect it; Operations (Actions) run against the connected repo.
- AC-149d: I can find any workspace of my projects and of my own Chat in the Projects screen's **Workspaces** view, with its place (AC-253c).
- AC-149e: An agent works in the files area or workspace I point it at; what it builds is kept where it is owned and never orphaned.

## US-153 — Chat sessions are private to their owner

As a member, my 1:1 chat sessions with agents are readable by me alone, so that no other user — including an org admin — can open my conversations. Task sessions are agent activity on org work rather than private correspondence, so they are readable by the members of the project they belong to. (Decision recorded in ADR-0041.)

- AC-153a — Another user, whatever their role, cannot open my chat session or read its transcript.
- AC-153b — A task session is readable by the members of its project; someone who is not a member of that project cannot open it.
- AC-153c — Activity and run listings never include another user's chat-session runs.

## US-154 — My hq login works on an Execution Site

As a member, I sign in once on hq and an Execution Site trusts that identity without holding any accounts or passwords of its own, so that the site can act for me even when it runs on a different machine. (hq/site split spec §2/§2a.)

- AC-154a — The site accepts an hq-issued signed token as proof of identity and authorization, verified locally with no per-request call to hq.
- AC-154b — A long-running session keeps its authorization without interruption — renewal happens invisibly before expiry.
- AC-154c — If hq is unreachable at renewal time, in-flight work continues under the current authorization until it actually expires.

## US-155 — Register an Execution Site with my org

As an admin, I register the machines that run my org's agents, so that every project
and every personal chat has a known place to execute, and no unknown machine can join.

- AC-155a — I can see every Execution Site registered to the org, with its label, when it was registered, and whether it has connected yet.
- AC-155b — ~~I generate a one-time registration token for a new machine; it expires, and it stops working once used.~~ *(Retired 2026-09-26 — a site registers by device approval (US-179), not by a token)*
- AC-155c — ~~A new Execution Site presents that token once and receives a lasting credential of its own, generated at that moment and never retrievable afterwards.~~ *(Retired 2026-09-26 — a site registers by device approval (US-179), not by a token)*
- AC-155d — ~~Registering with a token that is expired, already used, or wrong is refused, and the refusal says nothing about which.~~ *(Retired 2026-09-26 — a site registers by device approval (US-179), not by a token)*
- AC-155e — I can revoke a registered site, after which its credential no longer works.
- AC-155f — Creating a project lets me choose which Execution Site it runs on — with no choice it goes on HQ's own built-in site — and the project records the site it was placed on.
- AC-155g — ~~My first chat that belongs to no project places my personal files on a site — chosen by me when the org has several, silently when it has one.~~ *(Retired 2026-09-26 — a first personal chat never prompts for a site; storage is placed once at the default site)*
- AC-155h — An access token issued for one Execution Site is not accepted by another.

---

## US-156 — Know that my Execution Sites are reachable

As an admin, I can see which of my org's Execution Sites are connected right now, so that
I know where work can run, and I am told plainly when it cannot.

- AC-156a — A machine can only join as an Execution Site by presenting the credential it was issued at registration; a revoked or wrong credential is refused.
- AC-156b — A machine whose connection protocol is two or more major versions from hq's, or that states none, is refused, told that is the reason and which side must upgrade, and shown in hq as needing an upgrade; one a major version apart still works.
- AC-156c — The registry shows each site as registered, online or offline, and when it was last heard from.
- AC-156d — I can ask a connected site to report its own details, and see the answer.
- AC-156e — Asking anything of a site that is not connected fails immediately with a plain reason, rather than waiting.

---

## US-157 — An agent acts only with borrowed authority

As an org member, when I chat with an agent it can do no more than I can do myself,
and when an agent runs unattended it can act only inside its task's project — so
granting an agent a tool never widens anyone's permissions.

- AC-157a — Chatting with an agent grants the conversation my role, nothing more.
- AC-157b — Unattended runs cannot perform org-level mutations at all.
- AC-157c — A workspace can limit which tools a run working in it may use — a guardrail for runs in that workspace, enforced by the platform's own tool check, that leaves runs working elsewhere in the project unaffected.
- AC-157d — Agent containers hold no permanent org-wide credential.
- AC-157e — An unattended run stays inside its task's project.

---

## US-158 — Org data is served to the execution layer, never reached into

As an org, the execution layer obtains org data only through hq's own authorized
interface — so moving execution to another machine never changes what a run can
reach, and no gate exists only in one transport's wiring.

- AC-158a — Every control-plane operation an agent's tools use is served by hq with authorization enforced in the service itself, identically over every transport.
- AC-158b — A site's calls are accepted only with its machine credential and a capability minted for that site.
- AC-158c — An unattended run cannot read or write outside its task's project, and an agent always acts as itself, across the whole tool surface.
- AC-158d — A person's role limits them identically in the browser and through an agent.
- AC-158e — A workspace's tool restriction is configurable, and invalid configurations are refused before they take effect.

---

## US-159 — Work runs where its data lives

As an org, every workspace and every agent is anchored to one Execution Site, work
is only arranged where those anchors agree, and a workspace's records live on the
site that holds its files — so nothing is scheduled onto a machine that lacks the
data, and no stale copy of that data exists anywhere else.

- AC-159a — Every workspace records which Execution Site holds it.
- AC-159b — ~~An agent lives on one Execution Site; joining a project or taking a task anchored to a different site is refused with an explanation.~~ *(Retired 2026-09-26 — a run is placed on the site that holds its storage, whichever agent runs it)*
- AC-159c — A person never chooses a "home site"; their files exist on whichever site they work on.
- AC-159d — A run's site is the site that holds its storage — its project's site, its workspace's recorded placement or the person's own placement — never a per-user setting.
- AC-159e — Workspace records live only on the owning site; hq keeps an index of where, never a copy.
- AC-159f — When a site is unreachable, its workspaces are explicitly unavailable — nothing serves stale data and no run widens.

---

## US-160 — A run's container reveals and reaches only what that run should

As an org, each storage location (one person's or one project's) has its own container, whose mounts are the whole of what a run in it
can reach and whose paths reveal nothing about the machine it runs on — so one person's
context can never leak into another's run, and losing write permission means losing it
at the filesystem, not by convention.

- AC-160a — Each storage location gets its own container, shared by the sessions working in it, torn down when idle and capped in memory and process count.
- AC-160b — An agent's memory of a person is delivered by hq into that person's own chat runs and nowhere else; unattended runs carry nobody's memory.
- AC-160c — No path visible inside a container or a prompt reveals the site's host directory layout.
- AC-160d — A run whose effective toolset has no write tools cannot modify mounted work locations, whatever the agent's approval.
- AC-160e — Project runs share the project's knowledge; what one agent writes there, others on the project can read, through the knowledge tools. *(Changed 2026-10-26 — knowledge is no longer a folder mounted into runs.)*

---

## US-161 — Agents execute on the Execution Site

As an org, my agents execute on my Execution Site while HQ remains the source of
truth for org data, so the execution layer can live on its own machine without a
second identity store or a second copy of my data.

- AC-161a — Starting agent work from HQ (chat message, task run) executes the run on the owning Execution Site; HQ acknowledges dispatch quickly and never waits on the channel for the run to finish.
- AC-161b — The runtime obtains control-plane data only through dispatch context or the authenticated data path — never by reading HQ's database directly — and tokens minted for one site are refused by another.
- AC-161c — When the site is unreachable, interactive work fails with an explicit error naming the site; queued task work holds and dispatches when the site reconnects; neither side serves stale runtime data.
- AC-161d — Chat privacy (owner-only) keeps being enforced by HQ from its own data even though transcripts live on the site.
- AC-161e — A dead or expiring seeded runtime credential is detected by the site and surfaced to an HQ administrator, instead of silently failing every run.
- AC-161f — The session copy stays consistent across the two databases: exactly one side writes each field, and a half-completed cross-database delete is detected, never silently orphaned.
- AC-161g — hq treats the site as untrusted on the push path: stream frames are validated before reaching any browser.

---

## Installing and first use (added 2026-09-26)

### US-162 — Start hq and its own site and see that they are connected

As a first-time installer, I want hq and the site that comes with it to find each other from the settings I gave them, so that I can tell at once that agents can run and know what to fix when they cannot.

**Acceptance criteria:**
- AC-162a: with the same secret in both settings files, the Execution Sites page shows the site as online within moments of starting, with no registration or approval.
- AC-162b: when they are not connected, the page says which case it is — no secret, a secret that is too short, the site not running, the site refusing to pair, hq's address unreachable from the site — with the fix.
- AC-162c: a missing required setting stops hq and names the setting, rather than leaving a broken page.
- AC-162d: the commands the screens and the guide give me for the site work as printed.
- AC-162e: hq creates its organisation, its own site record and the built-in Kernel agent at the first start, once, so there is an agent to talk to straight away.

---

### US-163 — Give the organisation model access *(Changed 2026-10-23: the keys are managed as providers, US-355; only AC-163d stays)*

As an admin, I want to give the organisation an API key, so that shared runs — tasks and project runs — can start.

**Acceptance criteria:**
- ~~AC-163a: the key I save is stored encrypted, is never shown back to me or anyone, and the page tells me a key is stored.~~ *(Retired 2026-10-23 — the organisation, project and person keys are gone; US-355)*
- ~~AC-163b: only an org admin can set the organisation's credential, only a project's admin a project's, and a person only their own; anyone else is told what is needed.~~ *(Retired 2026-10-23 — the organisation, project and person keys are gone; US-355)*
- ~~AC-163c: a credential is deleted with its owner — a person who is removed, a project that is deleted.~~ *(Retired 2026-10-23 — the organisation, project and person keys are gone; US-355)*
- AC-163d: I am told before I spend a sign-in code, or try to save a key, that the install cannot store it, and the guide says the secrets key is required.

---

### US-164 — Sign in with my Claude subscription

As a person, I want to use my own Claude subscription for my work, so that I do not need an API key.

**Acceptance criteria:**
- AC-164a: I am warned first that a subscription covers one person's own use, I accept, and I sign in on Claude's own page and paste back the code it gives me.
- AC-164b: I see that the login is stored and when it expires; nothing of it stays on the machine that helped me sign in, and if no site is connected I am told so.

---

### US-165 — ~~Know which credential a run uses, and be told when none is usable~~ *(Retired 2026-10-23 — US-359)*

As a person who starts runs, I want the credential rules to be predictable, so that a run does not fail for a reason I cannot see.

**Acceptance criteria:**
- ~~AC-165a: a run uses the model access of the person it is for, as US-269 sets out (AC-269a to AC-269d).~~ *(Retired 2026-10-23 — one rule chooses a model through a provider; US-359)*
- ~~AC-165b: a run with nothing usable is refused with a sentence, where I am looking, saying what to do and who can do it.~~ *(Retired 2026-10-23 — one rule chooses a model through a provider; US-359)*
- ~~AC-165c: an invited person who has not signed up is not counted; an account made by any route is.~~ *(Retired 2026-10-23 — one rule chooses a model through a provider; US-359)*
- ~~AC-165d: in a project chat and on a task I am told which credential will be used.~~ *(Retired 2026-10-23 — one rule chooses a model through a provider; US-359)*

---

### US-166 — Be warned when shared runs cannot start

As an admin, I want to be told when the organisation has no usable credential for shared runs, so that I fix it before anyone's task fails.

**Acceptance criteria:**
- AC-166a: I am told when no model works: the person who cannot talk sees a line under Home's message box, and an organisation admin sees a Needs attention item and a notice about the provider that stopped (AC-256e, AC-277a, AC-355g). *(Changed 2026-10-23)*
- ~~AC-166b: a subscription that has expired counts as missing, and the item says to sign in again.~~ *(Retired 2026-10-23 — only a person's own subscription can expire; US-359)*

---

### US-167 — Change or recover my password

As a person, I want to change my password and get back in if I forget it, so that I am never locked out of my own organisation.

**Acceptance criteria:**
- AC-167a: I change my own password by giving my current one.
- AC-167b: an admin makes a one-hour, one-use reset link for me, and I choose my own password through it; setting it ends every sign-in I had (AC-275b, AC-275c).
- AC-167c: a command on HQ's machine, `agenthix hq reset-password <username>`, makes the same link for any person, including the last admin; the first-admin link is never a way back (AC-276b).

---

## Roles, refusals and privacy (added 2026-09-26)

### US-168 — Know what my role lets me do

As any person, I want to be told what my role allows and why I was refused, so that I never guess.

**Acceptance criteria:**
- AC-168a: the invitation's accept page and my profile tell me my role and what it allows.
- AC-168b: I am not offered an act my role cannot do, or I am shown why it is disabled.
- AC-168c: a refusal says in plain words which role or membership is needed, on screen where I acted, and an action that fails never just re-enables its button.
- AC-168d: an account with no role record has the least authority, never more.

---

### US-169 — A project's Viewers read, but never start or change work

As a project's Viewer, I want to read what the agents did there, and be unable to start or change work in that project however I try.

**Acceptance criteria:**
- AC-169a: I cannot start a run in the project by any route, and I am told I am its Viewer and whom to ask.
- AC-169b: I cannot cause work there indirectly — putting a task in an agent's line, a start time, a routine, a workflow, a repository secret.
- AC-169c: I cannot stop, rename, delete or reconfigure a run, session, transcript, board, task or workspace of the project, nor comment or approve.

---

### US-170 — Agents and templates are shaped by admins

As an admin, I want to be the only one who shapes the organisation's agents and templates, so that they change by decision and are recorded.

**Acceptance criteria:**
- AC-170a: creating, renaming, deleting, stopping, changing and importing agents, and the library and board templates, need the admin role; the kernel agent stays protected.
- AC-170b: ~~each change to how an agent behaves is a new recorded version, and runs record the version they used.~~ *(Retired 2026-09-27 — an agent is one current definition edited in place, with no versions (ADR-0072); see AC-170c)*
- AC-170c: a change to an agent is saved in place and used by its next run, with nothing to publish; a run already under way keeps what it started with; each run records exactly which content it used.

---

### US-171 — Private projects stay private

As a person, I want a private project to be invisible to everyone not on its list, so that its work stays confidential.

**Acceptance criteria:**
- AC-171a: a non-member cannot open, run in, read or write anything of a project, anywhere, in any count; an open project shows a non-member only its preview.
- AC-171b: a private project's key, or a task key in it, answers exactly like one that does not exist.
- AC-171c: reading what I may not see never confirms it exists; acting on what I can see but may not change tells me what is needed.

---

### US-172 — Decide who is in a project

As a project admin, I want to decide who is in my project and whether it is open or private, so that the right people work in it.

**Acceptance criteria:**
- AC-172a: I decide members, their roles, the access setting, the agents and the repository; an org admin can add people, appoint an admin, file the project and delete it in any project they can see, and reads a private project only by visibly joining it.
- AC-172b: a project always has an admin, on every path that could remove one.
- AC-172c: I can make a project private when I create it, and I am told who loses access when I switch one.
- AC-172d: a new project starts open to join, with me as its admin and first listed member.

---

### US-173 — Lose access when removed from a project

As an operator, I want to lose access the moment I am removed from a private project, and the organisation to know I have.

**Acceptance criteria:**
- AC-173a: once removed, or once the project turns private, I cannot send a message or start a run that touches it, including from an old chat.
- AC-173b: I can still read my own old chats there, which are mine alone.

---

### US-174 — See only what I may see, with numbers that agree

As a person, I want every page and number to match what I am allowed to open, so that nothing hidden leaks through a total.

**Acceptance criteria:**
- AC-174a: product, programme and agent pages, and site lists and counts, include only projects I may open.
- AC-174b: ~~dashboard totals count only what I may open, and a machine that did not answer is named rather than counted as zero.~~ *(Retired 2026-10-13 — the dashboard is gone, and SC-403 with it; Today is organisation-wide and for admins only)*
- AC-174c: if I am on no project, the empty page says I have no access yet.

---

## Working with tasks (added 2026-09-26)

### US-175 — Follow a task to its outcome

As a person on a project, I want to see a task's state, why, and what the agent concluded, so that I can act on it.

**Acceptance criteria:**
- AC-175a: the task shows its column and, apart from it, what its agent is doing with it — not started, waiting, running, needs me, failed or finished — and the reason when it needs me, failed or is waiting, after a reload too.
- AC-175b: the task shows the agent's result, and I can always find the download control for an attachment.
- AC-175c: a task held for an unreachable or outdated site says so and runs by itself when the site returns.

---

### US-176 — Stop work that should not run

As a person, I want Stop to stop, so that a runaway does not go on spending.

**Acceptance criteria:**
- AC-176a: Stop halts the real run from every place that offers it, and the task then says it was stopped, not failed.
- AC-176b: an admin's stop-everything asks first, then reports how many runs it stopped and which machines it could not reach.
- AC-176c: stopping everything stops the runs and takes waiting tasks out of line, back to Not started, so nothing starts afterwards until someone runs it.
- AC-176d: I can cancel only my own chats' runs, and task runs in projects I belong to.

---

### US-177 — Never lose work by an accidental click

As a person, I want deleting anything of value to ask first, so that I never lose work by mistake.

**Acceptance criteria:**
- AC-177a: deleting a session, a workspace or a project asks me, names what will be lost, works without a mouse, and never pretends it worked when it did not.

---

### US-178 — Know when a machine cannot be reached

As a person, I want an unreachable machine to say so, so that I never mistake silence for "nothing there".

**Acceptance criteria:**
- AC-178a: every screen that reads from a machine says which machine is unreachable, revoked or needs an upgrade, instead of showing an empty list.
- AC-178b: anyone signed in can see whether each machine is online.
- AC-178c: the machines page explains each state in a sentence and names every cause it can know.

---

## Machines (added 2026-09-26)

### US-179 — Approve a machine that wants to join

As an admin, I want to approve a machine only when the person at it and I agree, so that no unknown machine runs my organisation's work.

**Acceptance criteria:**
- AC-179a: I approve a request by typing the code shown on that machine; a wrong or used code gets one refusal; only admins can see or decide requests.
- AC-179b: I am shown what the machine says about itself beside what hq saw, and warned when it registered before.

---

### US-180 — Revoke a machine's credential

As an admin, I want to cut off a machine at once, so that a lost or misbehaving machine is safe.

**Acceptance criteria:**
- AC-180a: revoking refuses the machine at once, fails its work with a stated reason, and tells me how many projects sit on it first.
- AC-180b: ~~rotating disconnects the old credential's holder and the machine reconnects with the new one unaided.~~ *(Retired 2026-10-21 — a machine's credential is never rotated; it gets a new one by leaving the fleet and joining again)*
- AC-180c: the machine that comes with hq cannot be removed or leave by any route, and every message about it says so.

---

## What agents remember (added 2026-09-26)

### US-181 — Control what agents remember about me

As a person, I want to see and curate what agents remember about me, so that nobody else can read it and it stays true.

**Acceptance criteria:**
- ~~AC-181a: what an agent knows about me is held in two layers — everything I've told any agent, and what only one agent knows — delivered to my chats, and never to tasks or other people.~~ Retired 2026-10-17 — see AC-323a.
- AC-181b: I can list, add, edit, delete and pin my own memory, and an agent can add to and forget from only what its scope allows (see AC-323c).

---

## Owning an Execution Site machine (added 2026-09-26)

### US-182 — Install a site on my machine

As the owner of a machine, I want the site to refuse an unsafe setup and to expose nothing, so that I can lend the machine to my organisation safely.

**Acceptance criteria:**
- AC-182a: the site refuses an unsuitable data folder or Docker setup, says what is wrong and the fix, and never takes ownership of a folder it refused.
- AC-182b: a deployed site publishes no port and serves nothing that could register or reconfigure it.
- AC-182c: it comes back by itself after a reboot, keeps its identity, and the guide warns me not to delete it.

---

### US-183 — Register my machine with an organisation

As the owner of a machine, I want to join an organisation only when I and one of its admins both agree, so that nothing binds my machine without me.

**Acceptance criteria:**
- AC-183a: one command prints an address and a short code and waits; the machine joins only after I ran it and an admin approved; interrupting leaves nothing behind.
- AC-183b: when it cannot finish it says what happened and what to do.
- AC-183c: my credential never travels over plain http to a public address, and registration never follows a redirect.
- AC-183d: when the machine that comes with hq cannot pair, the machine says why in its log and status.
- AC-183e: I can give my machine a name, so it is not mistaken for another.

---

### US-184 — See my machine's status, and leave

As the owner of a machine, I want to know where it stands and to leave cleanly, so that I am never left guessing.

**Acceptance criteria:**
- AC-184a: status works with hq down, never prints a secret, and says in a sentence what is wrong and what to do next.
- AC-184b: if my machine was revoked while off, it tells me to register again, not that the network is faulty.
- AC-184c: unregistering tells hq, says what stays on the machine and how to remove it, and never claims a machine can leave when it cannot.
- AC-184d: it reconnects by itself when hq returns, reports an upgrade as an upgrade, and reports runs cut short by a restart as failed.

---

### US-185 — Know and limit what agents may do on my machine

As the owner of a machine, I want to know what the agents can reach and use, and to set limits, so that I accept the risk knowingly.

**Acceptance criteria:**
- AC-185a: the limits, their defaults and how to change them, and what containers can reach, are stated where I install the site.
- AC-185b: one place lists what is stored on the machine, my responsibilities and what to do if the credential leaks.
- AC-185c: the upgrade instructions say that runs in progress fail and how to let them finish.

---

## Agents defined once (added 2026-09-27)

### US-186 — Give every agent in a project or my own space a skill

As a project admin, or as a person in my own space, I want to place a skill once where every agent working there receives it, so that the conventions of that place do not have to be copied into each agent.

**Acceptance criteria:**
- AC-186a: a skill I place once in a project's shared skills folder reaches every agent working in that project, and one in my own space's folder reaches every agent working there for me.
- AC-186b: such a skill sits beside the agents' own skills of the same name and replaces none of them, and it never reaches an agent working somewhere else.

## Agents on their own schedule (added 2026-10-05)

### US-187 — ~~Turn on automation for a project, or for my own tasks~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** There is no automation switch, pulse or throttle; work starts only by an explicit act, see US-438 and US-439. Its criteria are retired with it.

As a project admin, or as a person in my own tasks, I want to turn on automation, so that the agents keep their queued tasks moving without anyone pressing Run.

**Acceptance criteria:**
- ~~AC-187a: automation is off until I turn it on, and no agent wakes itself — nothing starts by itself except through automation, a start time or a routine.~~ *(Retired 2026-11-08)*
- ~~AC-187b: I can only make a value stricter than the organisation's — a lower depth or queue limit, the throttle on, a longer interval, a smaller batch — and I see where the organisation limits my choice.~~ *(Retired 2026-11-08)*
- ~~AC-187c: with it on, each agent works through its own queued tasks one at a time, highest priority first, starting the next as soon as one ends, while different agents work in parallel.~~ *(Retired 2026-11-08)*
- ~~AC-187d: I can turn the throttle on, so that agents' tasks start in rounds with a gap between them; it is off by default, a task queued after a quiet spell starts at once, and a restart does not reset the gap.~~ *(Retired 2026-11-08)*

---

### US-188 — Set the organisation's automation limits

> **Criteria a, b retired 2026-11-08.** The organisation sets only the maximum depth and whether agents may set start times; see US-444. Criterion c stands.

As an admin, I want to set how far automation may go in the organisation, so that no project can let agents do more than I have allowed.

**Acceptance criteria:**
- ~~AC-188a: I can turn automation off for the whole organisation in one place, and every pulse, scheduled start and routine round stops at once and cannot be turned back on by anyone below me; settings and queues are kept.~~ *(Retired 2026-11-08)*
- ~~AC-188b: I set the maximum depth, the queue limit, whether every project must throttle, the interval, the batch size and whether agents may set schedules when asked; each is where projects start and the furthest they may go.~~ *(Retired 2026-11-08)*
- AC-188c: I set the organisation's run limits and how long finished tasks stay on a board; the first is the furthest a project may go, the second only where projects start.

---

### US-189 — Follow what automation is doing

> **Criteria a, b, c, e, f retired 2026-11-08.** The execution state, the Workroom and Runs replace them; see US-437, US-439 and US-440. Criterion d stands.

As a member of a project, I want to see why a task has not started and what automation did, so that waiting never looks like a fault and I can step in.

**Acceptance criteria:**
- ~~AC-189a: a task's run state is set by the system alone and never by an agent; however an agent moves the task, the end of its run settles it and starts the agent's next queued task.~~ *(Retired 2026-11-08)*
- ~~AC-189b: work agents cause is bounded — a task an agent queues in an unattended run counts one step deeper, and past the project's maximum depth it is created but waits for a person, and the agent is told.~~ *(Retired 2026-11-08)*
- ~~AC-189c: agents may hold only so many queued tasks in a project; past that, a task they create waits for a person and the agent is told. A queued task says why it waits.~~ *(Retired 2026-11-08)*
- AC-189d: I can run a task again over a failed or blocked run, or dismiss it back to no run pending.
- ~~AC-189e: the board updates by itself whenever a task's run state changes.~~ *(Retired 2026-11-08)*
- ~~AC-189f: the project's Automation tool says how much is running and in line, when the next round may begin, and what is stuck and how to fix it.~~ *(Retired 2026-11-08)*

---

### US-190 — Limit what one run can do

As an admin, or as a project admin for my project, I want every run to be limited, so that a loop or a stuck run cannot go on for ever.

**Acceptance criteria:**
- AC-190a: every run, a chat included, stops after the time limit; a project may only shorten the organisation's.
- AC-190b: a run nobody started by hand — from automation, a start time, or an agent's `run_task` — also stops after the turn limit; a run a person started has only the time limit.
- AC-190c: the limits hold even if hq restarts, and a stopped run says which limit stopped it and its task needs me rather than retrying.
- AC-190d: when a machine is running as many runs as it allows, the next waits for a slot and its task says so.

---

### US-191 — Start a task at a time I choose

As a person, I want a task to start at a time I set, so that it begins when I expect without my pressing Run.

**Acceptance criteria:**
- AC-191a: the task starts once, at its time, as if I had pressed Run, in whichever column it is; until then it is Waiting, and if it has no agent it says so.
- AC-191b: nothing but its time starts it: no column, board or switch starts it earlier, and clearing the time takes it out of Waiting.
- AC-191c: only the person the task is done for, or an admin of its project, can set or change a start time.

---

### US-192 — ~~Keep a routine going~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** A routine is a repeatable run, not a round of tasks; see US-441 and US-442. Its criteria are retired with it.

As a person, I want a routine that keeps the next round of repeating work ready, so that work I do every week is on the board before I need it.

**Acceptance criteria:**
- ~~AC-192a: I set a schedule and a task template, and the routine creates its first round, then the next as each round's time comes, so one round is always waiting.~~ *(Retired 2026-11-08)*
- ~~AC-192b: a round with an agent starts at its time whatever its column (AC-261a).~~ *(Retired 2026-11-08)*
- ~~AC-192c: I can edit a routine, pause it, delete it, skip the waiting round by deleting it, or unlink a round.~~ *(Retired 2026-11-08)*
- ~~AC-192d: I can make an existing task a routine from its page.~~ *(Retired 2026-11-08)*
- ~~AC-192e: if I lose access to the project, the routine pauses and its round is blocked until a project admin takes it over.~~ *(Retired 2026-11-08)*
- ~~AC-192f: a routine opens inside its place's Automation tool and the Routines view lists routines across places (AC-262a, AC-262e).~~ *(Retired 2026-11-08)*

---

### US-193 — Answer for the work done on my behalf

As a person, I want to be the one asked when work done for me needs a decision, so that agents never act for nobody.

**Acceptance criteria:**
- AC-193a: every task records the person it is done for, and who queued it, however it came about.
- AC-193b: when a run I started, or one done for me that nobody started, asks for a tool it was not allowed, I am notified with a link to the request, and anyone on the project who may start runs can approve it.
- AC-193c: if I lose access to a project, my tasks there are blocked at once with a reason, until a project admin assigns them to someone else; they are never given to anyone automatically.

---

### US-194 — Have a project of my own tasks

As a person, I want a private project for my own tasks, so that scheduled and repeating work for me has somewhere to live.

**Acceptance criteria:**
- AC-194a: I have one from the day my account exists, named "My tasks", with a board ready to use.
- AC-194b: it is private to me, I cannot add others, leave it or delete it, and its tasks stay on its own board.
- AC-194c: its runs are mine — my storage, my credentials, my agent settings — and nobody else can see them.

---

### US-195 — Connect my own tools to hq

As a person, I want to connect my own tool, such as my own coding assistant, to hq, so that it can read and change my work as me and no more.

**Acceptance criteria:**
- AC-195a: I create a connection with a name, the permissions I choose (reading only by default), all my projects or a list, and an expiry; its token is shown once.
- AC-195b: I see my connections with their permissions, projects, last use and expiry, and can renew or revoke any at once; nobody else can see or change them.
- AC-195c: a connection acts as me with my current role and my projects, narrowed by its own permissions; what it changes is recorded as done by me through it.
- AC-195d: an unknown, expired or revoked connection, and the retired organisation key, are refused alike.

---

### US-196 — Have agents read times in my timezone

As a person, I want agents to understand a time I say in my own timezone, so that "tomorrow at nine" means my nine.

**Acceptance criteria:**
- AC-196a: my timezone is taken from my browser until I choose one, and I can clear my choice.
- AC-196b: a time an agent sets for me is read in my timezone unless it names another, and agents are told my local date and time.

---

### US-197 — Have finished tasks tidy themselves

As a project admin, I want finished tasks to leave the board by themselves, so that routines and busy boards do not bury the live work.

**Acceptance criteria:**
- AC-197a: a task that has sat in a done column with nothing pending for longer than my project's setting (off, 1, 7 or 30 days) is archived, still searchable; the organisation's setting is only where projects start.

---

### US-198 — Ask an agent to start or schedule work

As a person, I want to ask an agent in my chat to start a queued task or to set a time or a routine, so that I can arrange work by talking.

**Acceptance criteria:**
- AC-198a: an agent can start a task only in a run I started, in my own project; the run it starts is limited like any unattended run and cannot start others.
- AC-198b: an agent can set a start time or a routine only when I asked it, only where the project lets agents set schedules, and only in a run I started; it does so on my behalf, and never from automation.

---

## Conversation-first hq (added 2026-10-07)

A **place** is where a conversation belongs: a project, or my own space, shown as **Chat**. Its **tools** — tasks, boards, runs, automation, files and the rest — sit beside the conversation.

### US-199 — Pin what I come back to

As a member, I want to keep the projects, boards and agents I use in my navigation, so that I reach them in one click on any device.

**Acceptance criteria:**
- AC-199a: I pin and unpin a project, a board or an agent from its header; my pins follow me to any device, and nobody else sees them.
- AC-199b: my pins show with their avatars, in the order I choose by dragging while I edit them; the one I am in is highlighted. *(Changed 2026-10-18: they are in the foot's Pinned row and its list, US-329)*
- AC-199c: a pin to something I can no longer see is not shown, and I cannot pin what I may not see.
- AC-199d: a project and a board have an avatar of their own even when nobody has chosen one.

---

### US-200 — Talk about a project in the project

As a member of a project, I want my conversations about a project to live in it, so that I pick them up where the project's work is.

**Acceptance criteria:**
- AC-200a: a project's Conversations section lists my conversations there, grouped by day, with a filter by agent and a search. *(Changed 2026-10-18: a project opens on its Overview, US-329)*
- AC-200b: the message box at the bottom starts a conversation with my primary agent — the project's default when mine is not on the project — or one I pick, and opens it. *(Changed 2026-10-18: it began with the project's default agent)*
- ~~AC-200c: a project's conversations use only that project's agents.~~ *(Retired 2026-10-18 — it described chat sessions; a conversation held in hq keeps the same rule, as AC-316a's scenario says)*
- ~~AC-200d: nobody else sees my conversations in a project.~~ *(Retired 2026-10-18 — it described chat sessions; a conversation held in hq is private to its person by its home's rule)*
- AC-200e: a conversation opens beside the page, in the dock; I rename it in place, its message box names its agent, and a closed one lets me start a new one in the same place. *(Changed 2026-10-18: it replaced the list; US-330)*

---

### US-201 — Keep a place's state and tools beside the conversation

As a member, I want a place's facts and tools beside my conversation, so that I can check or change the work while I keep talking.

**Acceptance criteria:**
- AC-201a: a place's Overview shows its facts and its sections in groups, each with a count or state, and each opens that section. *(Changed 2026-10-18: the tools panel is gone; a place's sections are in the left panel, US-329)*
- AC-201b: when the first agent is added to a project, it becomes the project's default agent.
- AC-201c: a project may name a lead, shown in its facts, who has no rights of their own.
- AC-201d: Run all starts every queued task in the place, and Stop all stops the place's runs and queued work after asking me.
- ~~AC-201e: on a phone, the facts and tools open as a full-screen page.~~ *(Retired 2026-10-18 — a place shows the same sections in the drawer on a phone; US-329)*

---

### US-202 — ~~Choose how the conversation and the tools share the screen~~ *(Retired 2026-10-18)*

> **Retired 2026-10-18.** The layout control and its four layouts are gone: a place's section fills the canvas and one conversation is docked beside every page (US-329, US-330). Its criteria are retired with it.

As a member, I want to give the conversation or the tools the room, so that I can read either comfortably.

**Acceptance criteria:**
- ~~AC-202a: one control offers four layouts: the conversation alone, side by side, the tool in focus, and the tool alone.~~ *(Retired 2026-10-18)*
- ~~AC-202b: my choice is remembered for me, on every device.~~ *(Retired 2026-10-18)*

---

### US-203 — Have a space of my own, shown as Chat

As a person, I want one place of my own for conversations and work that belong to no project, so that I can ask any agent anything without choosing a project first.

**Acceptance criteria:**
- AC-203a: in Chat I can talk to any agent in the organisation, and the conversation works in my own storage.
- AC-203b: Your space has my own tasks, boards, runs, automation, files and workspaces as its sections, and says which site holds my storage once it has one; Chat lists its conversations. *(Changed 2026-10-18: Chat had them beside it)*
- AC-203c: links into my personal project lead to Your space. *(Changed 2026-10-18: a chat from before no longer opens; they led to Chat)*

---

### US-204 — Start from Home

As a member, I want Home to be where I start talking, so that I can get going at once and see whether anything waits on me.

**Acceptance criteria:**
- AC-204a: Home greets me and puts the message box in front of me; my first message starts a conversation in my own space with my primary agent and opens it beside Home. *(Changed 2026-10-18: not the agent I used last; and it opens in the dock, Home staying)*
- AC-204b: it tells me how many notifications need me, how many of my runs are going and how much of mine starts today, each opening where I deal with it.
- ~~AC-204c: it lists my most recent conversations from every place, each naming its place.~~ *(Retired 2026-10-18 — Jump back in listed chats only and is gone; a list across places is later work)*

---

### US-205 — ~~Check, pause and shape a place's automation~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** The Automation tool is gone; see US-439 and US-441. Its criteria are retired with it.

As a project admin, or as a person in my own space, I want to see at a glance whether automation is running and what it will do, so that I can pause it or change what starts work.

**Acceptance criteria:**
- ~~AC-205a: I see whether automation is running and can pause or resume it; pausing stops new automated starts only.~~ *(Retired 2026-11-08)*
- ~~AC-205b: I see what is running and in line now, anything stuck with its fix, and what will start later, in time order.~~ *(Retired 2026-11-08)*
- ~~AC-205c: I reach the routines and the rules — the limits with the organisation's maximum, and the columns that start work — from the same tool.~~ *(Retired 2026-11-08)*

---

### US-206 — Act on a place's tasks beside the conversation

> **Criteria a, b retired 2026-11-08.** The Tasks list counts task states and the Workroom shows runs; see US-445 and US-439. Criteria c, d and e stand.

As a member, I want a place's tasks beside the conversation, so that I can act on what needs me and see what is being worked on without leaving it.

**Acceptance criteria:**
- ~~AC-206a: the Tasks tool groups the work as Needs you, Working on and Up next, each task with its one action.~~ *(Retired 2026-11-08)*
- ~~AC-206b: I add a task by its title into the backlog, and reach Backlog and Done from the top.~~ *(Retired 2026-11-08)*
- AC-206c: a task shows what waits in its session, its comments and its facts, with one action for its state; reached from anywhere but the tool, it opens as its own page.
- AC-206d: I open the task's session beside the conversation and send into it.
- AC-206e: Your tasks lists the tasks done on my behalf in every project, grouped the same way.

---

### US-207 — Work on a shared task on equal footing

As a member of a project, I want to step into a task's work as an equal with my colleagues, so that a task is the project's and not one person's.

**Acceptance criteria:**
- AC-207a: anyone who works in the project — its Members and Admins — can send into a task's session and start, interrupt or stop its run; its Viewers only watch; a message into an idle session starts a run.
- AC-207b: every message in a session shows who sent it.
- AC-207c: a run I start is on my behalf: my access is checked first, and its requests come to me.
- AC-207d: anyone on the project who may start runs can approve a task's request, whoever it is for.
- AC-207e: the agent reads the comments written since its last run on the task.
- AC-207f: a run's record says who stopped or interrupted it.

---

### US-208 — See my runs

As a member, I want to see the runs I started or that work for me, so that I know what agents are doing for me and can step in.

**Acceptance criteria:**
- AC-208a: the Runs panel groups my runs as Waiting for you, Running, Queued and Finished, each in two lines with one action — Approve, Stop or Cancel.
- AC-208b: I narrow it to the runs I started or those done on my behalf; a run says who started it only when it was not me; opening one takes me to its task or conversation.
- AC-208c: a run waiting for me is approved from the panel, the same request as in Notifications, and answering it in one clears it in the other.
- AC-208d: All runs opens a screen of them, where an admin can stop every run in the organisation.

---

### US-209 — Read hq in light or dark

As a member, I want to choose a light or a dark look, so that hq is comfortable where I work.

**Acceptance criteria:**
- AC-209a: hq is light unless I choose dark, and my choice is remembered in this browser.

---

### US-210 — Keep my settings apart from the organisation's

As a member, I want my own settings in one place and the organisation's elsewhere, so that I find mine without wading through what only admins change.

**Acceptance criteria:**
- AC-210a: Settings is one page of my own — profile, appearance, conversations, my primary agent, my Claude subscription, which models may run for me, my memory, my phone and connections, and signing in — with nothing for admins. *(Changed 2026-10-23)*
- AC-210b: I change my password by typing my current one and the new one twice; everywhere else I was signed in is signed out, and here I stay signed in.
- AC-210c: an admin finds the organisation's settings and what HQ runs on under Manage organisation (US-358); anyone else is told only admins can see them. *(Changed 2026-10-23)*
- AC-210d: the Organisation page groups its entries as the workplace — People, Agents, Teams, Products, Programs and Library — and, for an admin, Needs attention, Today, Where it runs and Settings, showing me only those I may open.

---

## Boards, plans and the timeline (added 2026-10-12)

The unit *Agenthix is usable — every screen reviewed* (adr-0097, adr-0098). A board is a lasting workflow of a project, not a cycle that ends; a task's plan is kept apart from the time an agent starts it. Written from the finished code at the close of the unit.

### US-220 — ~~Keep every task on a board that lasts~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** Boards are saved views and a task is on none; see US-430 and US-435. Its criteria are retired with it.

As a member, I want every task of a project on a board that does not end, so that work is never lost between cycles and I always know where a task is.

**Acceptance criteria:**
- ~~AC-220a: every project has Project Tasks, made with it, and a task is always on a board: a task made without naming one lands in Project Tasks' Backlog, by whatever route it was made — the form, an agent's tool, a connection or a routine.~~ *(Retired 2026-11-08)*
- ~~AC-220b: Project Tasks cannot be renamed, given other columns, archived or deleted by anyone, and has no column that starts work.~~ *(Retired 2026-11-08)*
- ~~AC-220c: every board has a Backlog besides its columns; a task in it is waiting to be placed and starts nothing; I cannot name a column "Backlog".~~ *(Retired 2026-11-08)*
- ~~AC-220d: I move a task to a column of its board, to its board's Backlog, or to another board, where it lands in that board's Backlog; a column the board does not have is refused, naming the ones it has.~~ *(Retired 2026-11-08)*
- ~~AC-220e: a board is archived instead of completed: an archived board is read-only and listed only when I ask, and can be brought back; deleting a board sends its open tasks to Project Tasks' Backlog, withdrawing any run queued for them, and its done tasks to Project Tasks' Done.~~ *(Retired 2026-11-08)*
- ~~AC-220f: next to a board's own Backlog I can show the Backlogs of the project's other boards, and my choice is remembered for me.~~ *(Retired 2026-11-08)*

---

### US-221 — ~~Run work in sprints~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** A sprint belongs to the project; see US-436. Its criteria are retired with it.

As a member, I want a board of sprints I can finish one at a time, so that a team can work in short rounds without losing what was not finished.

**Acceptance criteria:**
- ~~AC-221a: a Sprints board starts in Sprint 1, of the length I asked for (two weeks if none); a task placed in one of its columns is in the current sprint, one in its Backlog is in none, and the columns show the current sprint's tasks.~~ *(Retired 2026-11-08)*
- ~~AC-221b: Finish sprint makes me choose where the unfinished tasks go — the next sprint or the Backlog — and offers no default; the done tasks stay recorded in the finished sprint.~~ *(Retired 2026-11-08)*
- ~~AC-221c: the next sprint starts the day the last was finished, with the same length; unfinished tasks sent to the Backlog have their queued runs withdrawn; finishing twice at once finishes it once.~~ *(Retired 2026-11-08)*
- ~~AC-221d: I can name a sprint, which keeps its number ("Sprint 12 · Pricing push"), and read past sprints and their tasks.~~ *(Retired 2026-11-08)*
- ~~AC-221e: a Viewer of the project can finish and rename nothing.~~ *(Retired 2026-11-08)*

---

### US-222 — Plan a task with dates, epics and milestones

As a member, I want to give a task a plan — a start day and a finish day — and group tasks into epics and milestones, so that I can see when work is meant to happen without starting it.

**Acceptance criteria:**
- AC-222a: a task's plan is its start day and finish day, set or cleared by day, apart from the time an agent starts it; a finish before the start is refused.
- AC-222b: changing a plan, an epic or a milestone never starts, stops, queues or moves a run; only someone who works in the project may change it.
- AC-222c: a task belongs to at most one epic, an epic to none, and only an epic has a milestone; an epic and a milestone of another project are refused.
- AC-222d: an epic that still groups tasks cannot become an ordinary task again; deleting a milestone keeps its epics and deleting an epic keeps its tasks.
- AC-222e: an epic's span is its own plan, else the span of its tasks' plans, and nothing when neither has one.
- AC-222f: on a task I read and change the plan, the epic, and for an epic its milestone, and read the server's refusal when a rule is broken; someone who may not change the work reads them only.
- AC-222g: an agent reads and sets views, sprints, plans, epics and milestones through its tools, under the rules the browser applies to the person it works for, and a plan that breaks a rule creates nothing.

---

### US-223 — ~~See and work a project's boards~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** Boards are saved views with kinds and filters; see US-435. Its criteria are retired with it.

As a member, I want a Boards tool in a project, so that I see every board and move work across them.

**Acceptance criteria:**
- ~~AC-223a: the tool lists Project Tasks first, marked Default, then the other boards, each with its columns' counts, its Backlog count, how many tasks need a person, and its current sprint and days left; archived boards are behind a button with their count.~~ *(Retired 2026-11-08)*
- ~~AC-223b: New board asks for a name, Workflow or Sprints, and columns from a template, in place, and waits for a name.~~ *(Retired 2026-11-08)*
- ~~AC-223c: an open board shows its columns side by side with room, stacked with the Backlog first and Done folded when narrow, and as chips on a phone; each card shows its key, title, agent and state, and opens the task.~~ *(Retired 2026-11-08)*
- ~~AC-223d: a column that starts work says so and I switch it from the column's own menu; Project Tasks has none.~~ *(Retired 2026-11-08)*
- ~~AC-223e: a card's menu moves it to another column, the Backlog or another board; Edit columns, Archive and Delete are under the board's menu, and Project Tasks offers none of them; a Viewer is offered no change.~~ *(Retired 2026-11-08)*
- ~~AC-223f: Edit columns refuses a column named Backlog and refuses to remove a column that still holds tasks.~~ *(Retired 2026-11-08)*
- ~~AC-223g: I can fold the Backlog away and my choice is remembered for that board.~~ *(Retired 2026-11-08)*
- ~~AC-223h: the tool's screens are in the address, so a link opens the same board, view or task.~~ *(Retired 2026-11-08)*

---

### US-224 — See the project's work over time

As a member, I want a timeline of planned work, so that I see what is planned, running and due, and can move it.

**Acceptance criteria:**
- AC-224a: the timeline shows tasks with a plan, a start time or work in the range, never the Backlog, a lane per board with its sprints; epics with their span; milestones as flags; and routine rounds on the board they run on.
- AC-224b: it reads at Week, Month or Quarter scale and shows tasks, epics or milestones; a plan is a bar from its first to its last day, a start time or a round is a marker, and the runs are darker slices; a task that needs me is outlined.
- AC-224c: I drag a bar to move the plan, an end to change one end, a start-time marker to change only the start time; a routine's round, an epic whose span comes from its tasks, and anything I may not change cannot be dragged.
- AC-224d: clicking a bar opens the task; a drag does not.
- AC-224e: when the runs could not be read, or older work is left out, it says so quietly.
- AC-224f: narrow, it is an agenda: This week, Next week, Later.
- AC-224g: the project's Timeline tool and a board's own Timeline show the same work, the board's alone with no lane header.

---

## Agents in projects and in the organisation (added 2026-10-12)

An agent's state is kept per project and across projects (adr-0062 as amended by the unit).

### US-225 — Assign agents to a project and remove them

As a project admin or an organisation admin, I want to assign agents to a project and remove them, so that a project has the agents it needs and nothing is orphaned.

**Acceptance criteria:**
- AC-225a: a project's admin assigns an agent to it; an organisation admin assigns to any project, including a private one they are not in, but never to a person's own space; anyone else is refused.
- AC-225b: removing an agent makes me choose what happens to its open tasks and routines there — another agent of the project, or no agent — and removes nothing without the choice.
- AC-225c: removal leaves its done tasks and everything in other projects alone, and is a project admin's alone.
- AC-225d: removing the project's default agent also makes me choose the new default, or none.

---

### US-226 — Work with a project's agents

As a member, I want an Agents tool in a project, so that I see what each agent is doing here and give it work.

**Acceptance criteria:**
- AC-226a: the list names what every agent follows, what each is doing — needs you, running, or idle with what starts next — its tasks here by state and its model, marked when narrowed here; the whole row opens the agent.
- AC-226b: an opened agent shows In this project to every member, with Edit and Remove from this project for the project's admin only, and Permissions here to every member; an agent that is here only through a team offers no Remove.
- AC-226c: I start a conversation with the agent, or give it a task with the title typed, from the agent.
- AC-226d: ＋ Assign is offered only to those who may assign, and lists the organisation's agents that are not here.
- AC-226e: a project I am not in answers as missing, and so does an agent that is not assigned to it.
- AC-226f: the agent's instructions here are the organisation's, then the project's AGENTS.md, skills and the agent's own file, each opening in Files.

---

### US-227 — Know an agent from where I am

As a member, I want to open an agent's card wherever I meet it and use it where I am, so that I do not have to find it first.

**Acceptance criteria:**
- AC-227a: an agent's name or picture opens its card beside what I tapped (a sheet on a phone), showing who it is, what it is doing, its projects and its model, closing on Escape or a click outside.
- AC-227b: in a project the card offers Permissions here and Its tasks here with their counts, and New conversation opens the project's message box with the agent picked; in Chat it offers Your permissions in Chat; elsewhere New conversation opens Chat's message box with the agent picked; Open its place goes to the agent. *(Changed 2026-10-18: Your conversations with it is gone)*
- AC-227c: an agent's place shows a box to start a conversation with it, and its tools: Now, Projects, Runs, Usage, Your instructions, Memory and Your settings. *(Changed 2026-10-18: my conversations with it from every place are no longer listed)*
- AC-227d: Usage shows two rows, mine and the organisation's, each with its estimate, saying when a model had no price.
- AC-227e: Chat's Agents fact and tool list the organisation's agents, each opening in the panel.
- AC-227f: the Agents and Projects screens share one card: a cover and avatar, name, a line, what it is doing led by its state, its facts and one action; on a phone a compact row of three lines.

---

### US-228 — Manage the organisation's agents

As an organisation admin, I want Organisation › Agents, so that I see every agent, where it works, and what it costs.

**Acceptance criteria:**
- AC-228a: only an organisation admin sees it; anyone else is told so and sees nothing of it, and nothing is shown while the role is not yet known.
- AC-228b: an agent's page holds its instructions, skills and settings, each with Edit, its permissions summary, the projects it is in with Assign, and usage by project.
- AC-228c: the projects listed are those I am a member of; a private project I am not in is counted without being named, and a person's own space is only counted.
- AC-228d: Assign offers only the projects I am a member of, never a person's own space.
- AC-228e: ⋯ offers Stop its runs and Delete; the built-in agent cannot be deleted.
- AC-228f: usage is counted for a run's person, its project and the organisation, within the period, priced by model; a project I am not on gives me no usage, and private projects I am not on are summed into one line without being named.

---

## Membership, people and leaving (added 2026-10-12)

Membership is the only gate (adr-0099); leaving deactivates and erasing is separate (adr-0100).

### US-229 — Be in a project to work in it

As a member, I want only those listed in a project to act in it or read its work, so that a project's work is its people's.

**Acceptance criteria:**
- AC-229a: in an open or a private project only a listed member reads its work or acts in it; an organisation role gives no access to it.
- AC-229b: an organisation admin does not reach a private project they are not in, except to add themselves as its admin.
- AC-229c: a person's own project is theirs alone while they are here.
- AC-229d: reading something I may not see answers as if it did not exist, in the same words.
- AC-229e: an open project shows me a preview — what it is, who is in it and how busy it is — with Join; I join as a Member, once however often I ask, and joining never changes a role I already hold.
- AC-229f: I can leave a project, my open tasks there waiting; never as its last admin.
- AC-229g: Projects lists every open project and the private ones I am in, marking which I am in.

---

### US-230 — Look after a project's people

As a project admin, I want to add people, change their roles and remove them, so that the right people work in the project.

**Acceptance criteria:**
- AC-230a: People in a project lists its members, admins first, each with their role, what waits on them and what they are doing; a project always has an admin.
- AC-230b: I add people from everyone still in the organisation, searching by name or @handle, as Member, Viewer or Admin; an invitation is offered only to those who may invite.
- AC-230c: an organisation admin manages the people of any project they can see; in a private project they are not in they can do nothing, but add themselves.
- AC-230d: removing someone makes me choose where their open tasks go — a member I pick or waiting — and removes nobody without the choice; the last admin cannot be removed, demoted or made a Viewer.
- AC-230e: someone who is here only through a team cannot be changed or removed from the project, and the page says where to change it.
- AC-230f: ending someone's access tells each site holding their home, leaves their tasks waiting, and never blocks on a slow site.
- AC-230g: I read a person's card — who they are, their local time, the projects we share and their place here — from their picture.
- AC-230h: a person's name and picture are set by them or an organisation admin; before they set a name, their login name shows; an erased person reads as a former member.

---

### US-231 — Look after the organisation's people

As an organisation admin, I want Organisation › People, so that I see everyone, invite people and decide who stays.

**Acceptance criteria:**
- AC-231a: it lists everyone with their state, those here first and those who left at the foot, with a search by name or handle, and the invitations waiting before those earlier.
- AC-231b: one person shows their organisation role as Admin or Member (never changeable for myself), their profile, and the projects I can see with their role, Viewer among them and open tasks; private projects I am not in are counted, not named.
- AC-231c: it says who invited a person, and that someone came in from HQ's machine when so.
- AC-231d: I invite with an organisation role and projects as chips; the invitation names who it is for, keeps only projects I can see, and accepting it joins each as a Member, skipping any deleted since.
- AC-231e: Reset password makes a one-time link only when asked, and warns when its address works only on this machine.
- AC-231f: anyone who is not an organisation admin sees nothing of it.

---

### US-232 — Remove someone from the organisation, and erase them

As an organisation admin, I want to remove a person, bring them back, or erase them, so that leaving deletes nothing by accident.

**Acceptance criteria:**
- AC-232a: Remove deactivates: it ends their sign-ins, phone pairings and connections, takes them out of every project and team, tells each site, and keeps their account, conversations and the tasks and runs they leave behind.
- AC-232b: I cannot remove myself or someone who has already left; a project they alone administer blocks it, naming each.
- AC-232c: for every project with open tasks on their behalf I choose a member to take them or let them wait, and nothing changes until I do; in a private project I am not in they wait.
- AC-232d: Reactivate restores the same account without its projects; signing in is refused while they have left.
- AC-232e: Erase is for someone who has left; I confirm by typing their name or handle; it deletes their conversations, own project, memory, connections, logins, name, picture and sign-in, and keeps the project tasks, comments and runs, now naming a former member.
- AC-232f: the page says what happens and what stays before I confirm.

---

## Permissions and who a run is for (added 2026-10-12)

An agent's permissions are an organisation's, narrowed by a project and by a person; approval replaces autonomy (adr-0101, adr-0102).

### US-233 — Narrow an agent's permissions without ever widening them

As an organisation admin, a project admin or a person, I want to narrow what an agent may do where I am responsible, so that nobody can give it more than the organisation allows.

**Acceptance criteria:**
- AC-233a: permissions are held at three levels — the organisation's, a project's and a person's in their Chat — each with a state per tool (Always, Ask or Never), command patterns and an approval level.
- AC-233b: for each tool and approval the strictest level wins; a narrower Always never loosens the organisation's Ask or Never, and a narrower level never grants a tool the organisation leaves out.
- AC-233c: for a command, the strictest level wins; a command no pattern matches follows the Bash tool's own state at that level.
- AC-233d: a run gets its project's narrowing in a project and the person's own in their Chat, never the other.
- AC-233e: a model that costs more than the agent's own cannot be chosen at any level.
- AC-233f: a project's admin changes the project's narrowing and every member reads it; a person changes only their own; anyone outside the project is refused, an organisation admin included.

---

### US-234 — Choose how much an agent asks first

As an organisation admin, I want to set an agent's approval, so that I decide whether it asks before it acts.

**Acceptance criteria:**
- AC-234a: approval is Bypassed (asks for nothing), Deferred or Immediate (asks first); a project or a person may only choose a stricter one than the organisation's.
- AC-234b: Bypassed is marked as a warning and asks me to confirm before it is saved, and hides the tool list because every tool is Always.
- AC-234c: when the organisation bypasses, the organisation's Never no longer holds, platform tools included, and a narrower level that sets Deferred or Immediate brings the tools back from Always; a workspace's own cap still applies.

---

### US-235 — See and set an agent's permissions in one view

As an organisation admin, a project member or a person, I want one permissions view wherever I reach it, so that I know what the agent may do here.

**Acceptance criteria:**
- AC-235a: the view puts approval first as three cards, then presets, then every tool in groups; the preset that matches is selected, and Custom once a tool is changed.
- AC-235b: at a project or a person, it offers only the organisation's choice and stricter ones, shows the organisation's setting under each, marks a change as narrowed and counts it at the top, and saves only what it narrows.
- AC-235c: it is read-only to someone who may not change it.
- AC-235d: I reach it as a section of an agent under Organisation › Agents, as Permissions here in a project's Agents tool, and as Your permissions in Chat from Chat's Agents fact; the agent's card links to it where I am.

---

### US-236 — Hold a run to the person it is for

As an organisation admin, I want every run bounded by the person it is for, so that an agent can never do what its person may not.

**Acceptance criteria:**
- AC-236a: every operation an agent performs through the platform is checked against its person's current role and membership, read live: a project's Viewer is refused every change, a Member allowed, an outsider refused.
- AC-236b: a run is on behalf of the person who started it; a run nobody started is on behalf of its task's person; a person who steps into another's task is checked as themselves.
- AC-236c: a person removed from the project, who has left the organisation or has been made a Viewer is refused from the next call.
- AC-236d: organisation-wide tools are open only to a chat in its person's own storage and to the person's organisation role at that moment, never to a run in a project.
- AC-236e: a run on behalf of no one is refused everything but its own runtime support.
- AC-236f: a bypassed agent changes nothing its person may not.

---

### US-237 — Give someone a read-only place in a project

As a project admin, I want a Viewer role, so that someone can follow the work without changing it.

**Acceptance criteria:**
- AC-237a: organisation roles are Admin and Member; project roles are Admin, Member and Viewer.
- AC-237b: a Viewer reads the project's work and changes and starts nothing, by any route; the refusal says they are its Viewer; an organisation admin who is its Viewer is refused the same.
- AC-237c: a person's own Chat is theirs to work in, whatever their roles.
- AC-237d: making someone a Viewer leaves their open tasks there waiting and pauses their routines; work is never done on a Viewer's behalf.
- AC-237e: I add someone as a Viewer, and the last admin cannot be made one.
- AC-237f: the controls a Viewer may not use are disabled or absent for them; they show as "Name · Viewer".

---

## Execution Sites (added 2026-10-12)

### US-238 — Be told what needs me, and have it stay told

As an organisation admin, I want problems that need me to stay in my notifications until they are fixed, so that nothing important is dismissed by accident or lost on a restart.

**Acceptance criteria:**
- AC-238a: a notification of a persistent kind is raised for each organisation admin under Needs you, once per subject however often it is raised again, and it counts on the bell when its title changes.
- AC-238b: it clears itself when its subject is addressed, and if the problem returns the same notification reopens as new.
- AC-238c: it has no ✕ unless its kind may be dismissed; a dismissed one stays dismissed for that subject.
- AC-238d: only organisation admins who are still here are told; one made admin later is told at the next pass.
- AC-238e: the notification survives a restart of HQ and cannot be left stuck by a missed event.

---

### US-239 — Know when a site needs me

As an organisation admin, I want to be told when a site needs me, so that work does not stall unseen.

**Acceptance criteria:**
- AC-239a: I am told, once per site and problem, when a machine asks to connect (several requests are one notification), when a site needs upgrading (at once, with its version and what it stops), when a site is not connected while work waits on it (saying what waits), when HQ's own site is not running, and when a connected site's Docker is not running or its disk is nearly full.
- AC-239b: the not-connected alerts wait past a short grace counted from HQ's own start, so a restart or a blink tells no one; a site away with nothing waiting is not alerted.
- AC-239c: Docker and the disk are judged from a connected site's latest report only; a malformed report is dropped and the last good one stays.
- AC-239d: an expired request stays as an expired one, which I can dismiss, until the machine asks again.

---

### US-240 — ~~Let machines ask to connect, without letting them flood HQ~~ *(Retired 2026-10-16)*

> **Retired 2026-10-16.** A machine no longer asks HQ to connect, and no organisation admin approves it: a fleet admin adds a site in the Fleet Console with a one-time code and the machine's fingerprint (US-301). Its criteria are retired with it.

As an organisation admin, I want a machine to ask to connect and me to decide, so that only machines I approve become sites.

**Acceptance criteria:**
- ~~AC-240a: at most 20 requests may wait in total and 5 from one address; the machine is told in a plain sentence, and the same machine asking again replaces its waiting request, which another address cannot cancel.~~ *(Retired 2026-10-16)*
- ~~AC-240b: an expired or decided request does not count against the caps.~~ *(Retired 2026-10-16)*
- ~~AC-240c: a request that would replace an existing site says so before I approve.~~ *(Retired 2026-10-16)*
- ~~AC-240d: I approve with the code read off the machine, and deny with or without it; I never approve without it; a non-admin changes nothing; a code that opens a different request than the one I clicked is refused.~~ *(Retired 2026-10-16)*
- ~~AC-240e: approving a removed machine again lets it back in, recording who approved it.~~ *(Retired 2026-10-16)*

---

### US-241 — See and manage the Execution Sites

As an organisation admin, I want the list of sites and a page for each, so that I know what is running where. (Acting on a site — adding, moving, removing it — is a fleet admin's, in the Fleet Console: US-299 onward.)

**Acceptance criteria:**
- AC-241a: the list says each site's standing in one sentence — available, busy, unavailable and since when, never connected, removed (folded) — with its projects, what each run gets and its load, and opens the site's page; there is no action on a site, only where fleet admins look after them. *(Reworded 2026-10-16: sites are no longer approved or connected here.)*
- ~~AC-241b: requests are approved in place with the typed code, with a plain warning when approving would replace a site.~~ *(Retired 2026-10-16 — no request reaches HQ to approve)*
- AC-241c: HQ's own site is named "HQ · Built-in site" wherever it is shown.
- AC-241d: a site's page shows what is on it, what is happening now, a scheduled change and when members were told, and for HQ's own site what stopped it and who acts; it has no control. *(Reworded 2026-10-16: Check connection is gone.)*
- ~~AC-241e: Replace credential and Remove each say what they do and ask to confirm; Remove counts private projects without naming them; HQ's own site offers neither; a removed site offers nothing and says who removed it and when, and removing twice is refused.~~ *(Retired 2026-10-16 — a site is removed, and a machine's credential replaced, only in the Fleet Console)*
- AC-241f: a site that never reported health says so.
- AC-241g: anyone who is not an organisation admin is told only admins can see it and sees no site.

---

## A project's Settings (added 2026-10-12)

### US-242 — Change what I may in a project's Settings

As a project member, I want each part of a project's Settings to be a field only if I may change it, so that I know at a glance what is mine to change.

**Acceptance criteria:**
- AC-242a: a project's own fields are its admins' to change; filing it under a product or programme, and deleting it, are organisation admins'; a member or a Viewer reads text, with the project's admins named.
- AC-242b: the key is a field until the project has a task and fixed text, with the reason, once it has; a key is 2 to 6 letters.
- AC-242c: each part saves on its own when I leave the field, saying Saved; a refusal shows beside the part and keeps what I typed; a value that fails its check is not sent; nothing is sent when nothing changed.
- AC-242d: the default agent is chosen among the project's own agents, or none; any other is refused and the default stays.
- AC-242e: a person's own project keeps only its key, description, run time limit and archiving.
- AC-242f: Delete is offered to organisation admins only; a project admin who is not one is told so.

---


---

## Approvals, runs and the Runs screen (added 2026-10-12)

### US-250 — Approve a tool request for the next run only

As a person who works in a project, or who talks to an agent, I want an approval to cover only the run it starts, so that I never leave an agent with more freedom than I gave it.

**Acceptance criteria:**
- AC-250a: approving a request starts the next run of the task or the conversation, and that run alone is given what I approved; the run after it asks again.
- AC-250b: a request that something newer replaced — a new message, Run again, Dismiss, a newer run — cannot be answered; hq says so in plain words and starts nothing.
- AC-250c: a replaced request leaves Notifications, the Runs panel and the Runs screen, and the conversation shows it as not answered.
- AC-250d: denying a conversation's request starts its next run, told what was denied, so the agent carries on without it.
- AC-250e: when a run stopped at its time or turn limit as well as asking for approval, the task shows both reasons.

---

### US-251 — Look through my runs

As a member, I want one screen with all the runs I started or that were done for me, so that I can find what an agent did and step in.

**Acceptance criteria:**
- AC-251a: Show all in the Runs panel opens the Runs screen, which lists my runs newest first, grouped as Waiting for you, Running, Queued and Finished, 25 at a time with Older runs ›.
- AC-251b: I narrow the list by whose doing it was, by place, by agent, by how it ended and by when, and I search it, including by a task's key; with nothing to show it says so and offers to clear the filters or to start a conversation.
- AC-251c: I approve a waiting run from its row.
- AC-251d: on a wide screen the newest run opens beside the list on arrival; on a phone I see the list, then one run at a time with a way back.
- AC-251e: a site that could not be asked is named once, and the rest of the list still shows.
- AC-251f: an admin can stop every run in the organisation from the screen.

---

### US-252 — See what one run did

As a member, I want to open a run and see what it was for, who and what it ran as, how it ended, and every tool call it made, so that I can check an agent's work.

**Acceptance criteria:**
- AC-252a: a run has its own address; it shows the task or conversation it belongs to with a way to open it, its agent and place, who started it and for whom, its site, runtime and model, usage and error.
- AC-252b: it says what the run asked for and how that was answered — waiting for me, approved by whom and when for the next run, denied, or replaced.
- AC-252c: it lists every tool call with a risk label, narrows to the High and Flagged ones, and opens a call to its input and the output it printed, cut to its first lines when long.
- AC-252d: I can stop a run that is going, and approve or deny a request that can still be answered, where I may work.
- AC-252e: a run that is not mine to see, or does not exist, reads the same: not available.

---

## The Projects screen (added 2026-10-12)

### US-253 — See my boards, workspaces and routines across projects

As a member, I want the Projects screen to show my boards, workspaces and routines from all my projects, so that I find them without opening each project.

**Acceptance criteria:**
- AC-253a: Projects, Boards, Workspaces and Routines are four views of one screen; the view and its filters are in the address, and Back returns to where I was.
- AC-253b: Boards lists the boards of the projects I am in, with their project and how many tasks need me, active ones first and archived ones behind Archived, narrowed by project and by search; a board opens in its project's Boards tool.
- AC-253c: Workspaces lists the workspaces of my projects and my Chat with their place, repository, preview and site, narrowed by place and search; a site that does not answer is named in one quiet line.
- AC-253d: a project card's "N boards" opens Boards for that project.
- AC-253e: the old Boards and Workspaces addresses, a workspace's own address, and a project's Files and Workspaces sections lead to the same place in the new screens.
- AC-253f: the browser tab names each screen.

---

### US-254 — Add a board, workspace or routine from the Projects screen

As a member, I want to add a board, a workspace or a routine from wherever I am on the Projects screen, so that I do not have to find the right project first.

**Acceptance criteria:**
- AC-254a: ＋ New project ▾ is on every view, and its arrow offers New board, New workspace and New routine.
- AC-254b: it offers only the places where I may add that thing — not a project where I am a Viewer — and my Chat for a workspace.

---

## The Organisation (added 2026-10-12)

### US-255 — See my organisation at a glance

As a member, I want the Organisation page to show who we are and what we have, so that I find my way around the workplace.

**Acceptance criteria:**
- AC-255a: the page opens with the organisation's name, handle, picture, cover, vision, mission and when it began.
- AC-255b: I see cards for People, Agents, Teams, Products, Programs and the Library, each with its count and what matters in it now, opening its page.
- AC-255c: an admin changes the identity — name, handle, vision, mission, picture and cover — and a member cannot.
- AC-255d: the old Dashboard address leads to the Organisation page.
- AC-255e: Products and Programs list what we make and what we work towards, with one opened beside the list showing only its projects.

---

### US-256 — Know what needs me as an admin

As an organisation admin, I want one list of what needs me across the workplace and what it runs on, so that I deal with it first.

**Acceptance criteria:**
- AC-256a: Needs attention is at the top of the Organisation page, for admins only, and says so when nothing needs me.
- AC-256b: it lists a site in trouble, model access failing, a machine asking to connect, approvals waiting (as one item), invitations unanswered for a week and a team the built-in agent proposed, each with one action.
- AC-256c: handling an item here or in Notifications clears it in both.
- AC-256d: the agents with approval set to Bypassed are one lasting item that I acknowledge, not dismiss; it comes back when another agent is set to Bypassed.
- AC-256e: while agents cannot answer anyone, model access is on the list with a link to the fix.

---

### US-257 — See how the organisation is doing today

As an organisation admin, I want today's numbers on the Organisation page, so that I see load and spend without a separate dashboard.

**Acceptance criteria:**
- AC-257a: Today shows runs going now against the most at once across the sites, runs since midnight, tasks done this week and an estimate of this month's spend.
- AC-257b: spend is estimated at list price, and tokens of a model with no price are counted apart, never as free.
- AC-257c: a site whose answer is missing from a number is named.
- AC-257d: Where it runs shows a card for each site with its runs, disk and Docker, opening the site, and a way to connect another.

---

### US-258 — Gather people and agents into teams

As an organisation admin, I want a team to be a group of people and agents with a purpose, so that I can bring them into a project together.

**Acceptance criteria:**
- AC-258a: Teams lists a card for each team with its purpose, its mix of people and agents and where it works; a team's page shows its hero, its people and agents with what each is doing, and the projects it works in.
- AC-258b: an admin creates, changes and deletes teams, gives each a picture, cover and handle, and chooses its people and agents; a member can only read.
- AC-258c: a team that is still in a project cannot be deleted; deleting one otherwise leaves its people and agents where they are.

---

### US-259 — Bring a team into a project as one member

As a project admin, I want to add a team to a project as a single member, so that the project follows the team as it changes.

**Acceptance criteria:**
- AC-259a: adding a team writes each of its people in with the team's role and each of its agents in; a Viewer team lets its people read and change nothing.
- AC-259b: someone who is also a member in their own right, or in another team, has the highest role they hold, and taking a team away gives back exactly what they had on their own.
- AC-259c: when the team's people or agents change, every project it is in follows; a project is never left without an admin.
- AC-259d: someone there only through a team is changed through the team, not on their own.
- AC-259e: removing a team removes those there only through it, after I choose what happens to their open tasks.
- AC-259f: a project's Members view lists its teams as cards, then its people, then its agents, names the team beside someone there through it, and filters and searches; only those who may manage a project's people can add or remove.

---

### US-260 — Keep ready-made agents, boards, skills and teams in a Library

As an organisation admin, I want a Library of items I can use again, share and import, so that good work is not rebuilt.

**Acceptance criteria:**
- AC-260a: the Library lists agents, boards, skills and teams, each marked Built in, Made here or Marketplace with its version and publisher, and I filter by source and search.
- AC-260b: an admin exports any item as one package that records what it is, where it came from, its version and its publisher; members cannot.
- AC-260c: an admin imports a package: it becomes an item made here, or stays marked as from a marketplace, with its version and publisher kept; a built-in item is never replaced and a file that is not a package is refused.
- AC-260d: a team template holds agents only; one naming people is refused.
- AC-260e: the Marketplace tab says Coming soon; the old Skills address leads to the Library's Skills.

---

## Routines (added 2026-10-12)

### US-261 — ~~Have a routine's round start at its time~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** A routine fires on its schedule and starts one run; see US-441. Its criteria are retired with it.

As a project member, I want a routine to start its round at its time whatever column it is in, so that a routine runs without a board built for it.

**Acceptance criteria:**
- ~~AC-261a: at its time, a round with an agent starts as if its person pressed Run, once however many checks reach it; it waits for its agent when that agent is busy in the project.~~ *(Retired 2026-11-08)*
- ~~AC-261b: a round with no agent waits for a person and says so; with automation off for the project it is queued with the reason; the next round is still made either way.~~ *(Retired 2026-11-08)*
- ~~AC-261c: a time missed while hq was down makes its round once, not once per missed time.~~ *(Retired 2026-11-08)*
- ~~AC-261d: a failed round stays failed, to be run again, and never stops the next.~~ *(Retired 2026-11-08)*

---

### US-262 — ~~Manage a routine from Automation~~ *(Retired 2026-11-08)*

> **Retired 2026-11-08.** A routine is managed from Routines; see US-441 and US-442. Its criteria are retired with it.

As the person a routine runs for, or a project admin, I want to see and steer a routine where I look at automation, so that I need no separate place.

**Acceptance criteria:**
- ~~AC-262a: a routine opens inside Automation at its own address; it says in one sentence what happens, with its time zone and who set it up, and shows its last rounds as squares and each round with its state.~~ *(Retired 2026-11-08)*
- ~~AC-262b: Run now starts the waiting round at once, with a fresh one waiting for the same time; Skip this time removes it; each says why when it cannot.~~ *(Retired 2026-11-08)*
- ~~AC-262c: I edit a routine in place, pause it with its switch and delete it after a second question; someone who may not manage it sees none of these.~~ *(Retired 2026-11-08)*
- ~~AC-262d: after three failed rounds in a row the person it runs for is told once, and is not told again until a round has succeeded and a new streak of failures begins.~~ *(Retired 2026-11-08)*
- ~~AC-262e: the Routines view of the Projects screen lists routines across my places with their repeat, person, last rounds and switch, narrowed by place and by On or Paused.~~ *(Retired 2026-11-08)*

---

## What a conversation shows (added 2026-10-12)

### US-263 — See who replied and what the agent did

As a person in a conversation, I want each reply to say who wrote it and what the agent did to write it, so that I can trust it and check it.

**Acceptance criteria:**
- AC-263a: each reply is headed by the agent and its time, and a change of model is marked once, where it happened.
- AC-263b: under a reply are Copy, Usage and Details; Usage opens a popup, and Details opens the run.
- AC-263c: what the agent did is one folded line naming it, which opens to every step in the order it happened, with a way to the run.

---

### US-264 — Recover when a reply fails or is stopped

As a person in a conversation, I want a failed or stopped reply to stay where it was and tell me why, so that I can try again without retyping.

**Acceptance criteria:**
- AC-264a: a failed run stays in the conversation with its reason in plain words, and offers one Try again while it is the latest reply.
- AC-264b: Try again sends the same message again, which the agent is told failed the first time; it is refused once something newer was said and while the agent is working.
- AC-264c: once a newer message is sent, a failure folds to a line with no button; a stop folds to a line saying who stopped it.

---

### US-265 — Send a message while the agent is busy

As a person in a conversation, I want a message sent while the agent works to wait or to interrupt as I chose, and to change my mind, so that I never lose what I wrote.

**Acceptance criteria:**
- AC-265a: the message box stays open while the agent works, with Stop beside Send.
- AC-265b: a message sent into a busy conversation waits behind the reply, or stops it first, as my Conversations setting says.
- AC-265c: a waiting message offers Send now, which stops the running reply for it, and Cancel, which takes it back; neither is possible once the agent has started on it.

---

### US-266 — Answer an approval inside the conversation

As a person in a conversation, I want an agent's request for approval in plain words in the conversation, so that I decide without leaving it.

**Acceptance criteria:**
- AC-266a: the request names what the agent wants to do in plain words, shows the first two items with "+ N more", and says Approve allows all.
- AC-266b: once answered it folds to a line saying who answered and when, and opens to the same card with "for this run only" and a link to the run.
- AC-266c: a request a newer message replaced says it was not answered, without a reload.

---

### US-267 — Know how much the agent remembers

As a person in a conversation, I want to see how full the agent's memory of the conversation is and to make room, so that a long conversation does not fail without warning.

**Acceptance criteria:**
- AC-267a: the conversation's popup shows when it started, its replies and how many failed, its total usage, and the agent's memory as a share of its window, with where it summarises by itself.
- AC-267b: from 90% the conversation says the memory is nearly full; Summarise now starts a summary at once and is refused while the agent works.
- AC-267c: a summary is marked in the conversation, opens to what the agent remembers now, and says who asked for it.
- AC-267d: the figure is the agent's runtime's own, never counted from the transcript.

---

### US-268 — See a run's conversation the same way everywhere

As a member, I want a task's session, the activity view and the Runs panel to draw a run as a conversation does, so that I read it the same wherever I open it.

**Acceptance criteria:**
- AC-268a: each shows who replied and when, the work as one folded line, approvals, failures and usage as a conversation does.
- AC-268b: a view that only reads shows an approval without its buttons, a failure without Try again and a waiting message without Send now.

---

## Which model access a run uses (added 2026-10-12)

### US-269 — ~~Have a run use the model access of the person it is for~~ *(Retired 2026-10-23 — US-359)*

As a person whose organisation uses subscriptions, I want an agent working for me to use my own model access, so that project work runs without an organisation-wide key.

**Acceptance criteria:**
- ~~AC-269a: a run uses its project's own model access when the project holds one, then the person's own login, then their own key, then the organisation's — in a project as in Chat.~~ *(Retired 2026-10-23 — the one rule of US-359 replaces the order of credentials)*
- ~~AC-269b: the person is whoever started the run, or sent the message, or else the task's or routine's person.~~ *(Retired 2026-10-23 — the one rule of US-359 replaces the order of credentials)*
- ~~AC-269c: a person's login goes only to a run that runs as them; a task's run in a project gets their key instead, and one person's login is never given to another's run.~~ *(Retired 2026-10-23 — the one rule of US-359 replaces the order of credentials)*
- ~~AC-269d: a subscription held by the organisation or a project is used only while the organisation has one person.~~ *(Retired 2026-10-23 — the one rule of US-359 replaces the order of credentials)*
- ~~AC-269e: a run with nothing usable is refused with the order it tried and where to fix it.~~ *(Retired 2026-10-23 — the one rule of US-359 replaces the order of credentials)*

---

## Getting in (added 2026-10-12)

### US-270 — Install HQ and get its first-admin link

As the person who runs an organisation's HQ, I want one command to install it and give me the link to become its first admin, so that I need no secrets or keys of my own.

**Acceptance criteria:**
- AC-270a: `agenthix install` asks two questions, makes every secret, writes both settings files already paired, builds and starts HQ and its site, and prints the first-admin link; running it again changes nothing.
- AC-270b: the link is from HQ's own address, works once, lasts 24 hours, and a newer link ends the older.
- AC-270c: once HQ has a person the link no longer works, and says HQ is already set up.
- AC-270d: HQ no longer needs a standing first-admin key to start.

---

### US-271 — Set up the organisation once, in three steps

As the first admin, I want a short setup that names the organisation and gets agents answering, so that I end on a working conversation.

**Acceptance criteria:**
- AC-271a: setup is You, the organisation, how my agents reach AI (a model provider and voice, Agenthix Cloud, or later) and a last look; the step is in the address so a refresh and Back keep it, and the buttons stay in reach on a long step (AC-357c). *(Changed 2026-10-28)*
- AC-271b: the organisation needs a name; vision, mission, picture and cover are optional, and the sign-in page it makes follows what I type.
- AC-271c: a line about HQ's own site shows only when it is not connected, and never holds setup open; models and voice can be left for later (AC-357d). *(Changed 2026-10-28)*
- AC-271d: the review shows what HQ holds, lets me edit a step, and finishing lands me on Home.
- AC-271e: setup runs once for the first admin; an admin invited later is never sent through it.

---

### US-272 — Sign in to my organisation

As a member, I want the sign-in page to be my organisation's, so that I know I am in the right place.

**Acceptance criteria:**
- AC-272a: the page shows the organisation's cover, name, handle and vision, as much as an admin chose to show before sign-in.
- AC-272b: a wrong username or password gives the same words whichever was wrong; after ten wrong passwords from one place it asks me to wait, even for a right one.
- AC-272c: signing in returns me to the address I first opened.
- AC-272d: a person who was removed sees their own page, not an error.
- AC-272e: a fresh HQ with no admin points to the setup link instead of asking for a code.
- AC-272f: an admin chooses how much of the organisation shows before sign-in.

---

### US-273 — Join through an invitation

As an invited person, I want the invitation page to tell me who invited me and what I am joining, so that I can accept with confidence.

**Acceptance criteria:**
- AC-273a: an invitation is a link at `/invite/<code>`; its page names the organisation, who invited me, my role, any note and when it closes, the projects I join and a few people already there.
- AC-273b: accepting asks my name, username and password, makes my account, joins and pins each named project, signs me in and takes me on.
- AC-273c: an expired, used, withdrawn or unknown invitation says so, names who to ask, and offers Sign in; too many wrong codes from one place are refused.
- AC-273d: opening an invitation while signed in as someone else asks first, naming who is signed in, and Cancel leaves them where they are.
- AC-273e: an admin makes an invitation naming projects they can see, as a link from HQ's address, and is warned when it opens only on HQ's own machine.

---

### US-274 — Get started after joining

As an invited person, I want a short guided start, so that I land in my work set up.

**Acceptance criteria:**
- AC-274a: onboarding is Join, You, then a last look, in the organisation's identity; it never asks for model access. *(Changed 2026-10-23)*
- AC-274b: You sets my picture and time zone, filled in from the browser.
- AC-274c: Start working lands me in the first project I was invited to, or Home, with a welcome line once.
- AC-274d: the first admin is sent to setup, never through onboarding.

---

### US-275 — Get back in when I forget my password

As a member, I want a way back that needs no email, so that a forgotten password does not lock me out.

**Acceptance criteria:**
- AC-275a: Forgot your password? says HQ keeps no email and to ask an admin for a reset link, with the command for HQ's machine for the only admin.
- AC-275b: an admin makes a one-hour, one-use link for another person in Organisation › People, and is warned when it opens only on HQ's own machine; there is none for their own password.
- AC-275c: setting the password through the link signs the person in and ends every sign-in and phone pairing they had; a short password is refused without spending the link.
- AC-275d: a newer link ends the older, and an old or unknown one is refused.

---

### US-276 — Recover access from HQ's machine

As the person who runs HQ's machine, I want commands there that print an admin link or a reset link, so that I can get an organisation back when no admin can sign in.

**Acceptance criteria:**
- AC-276a: `agenthix hq invite-admin` prints a fresh first-admin link while HQ has nobody; once it has people it makes an admin invitation recorded as from HQ's machine and tells the admins.
- AC-276b: `agenthix hq reset-password <username>` prints a one-hour link and tells every other admin; an unknown username makes nothing.
- AC-276c: `agenthix status` gives HQ's version and commit, how many people it has and whether its own site is connected.
- AC-276d: only a process on HQ's machine can use these.

---

### US-277 — Know why agents cannot answer me

As a person who cannot talk to agents yet, I want to be told so where I start, so that I know what to fix.

**Acceptance criteria:**
- AC-277a: Home says under its message box that agents cannot answer yet and, for an organisation admin, links to Providers, or says an organisation admin can set one up. *(Changed 2026-10-23)*
- AC-277b: nothing shows once I can talk.
- AC-277c: Home offers first suggestions, each starting a conversation with the built-in agent. *(Changed 2026-10-18: offered always, since Home has nothing to return to)*

---

## Logs and diagnostics (added 2026-10-12)

### US-278 — See what is wrong without a terminal

As an organisation admin, I want one page showing how HQ and each site are and what has gone wrong, so that I can act without a terminal on each machine.

**Acceptance criteria:**
- AC-278a: Organisation › Infrastructure › Logs and diagnostics is for admins only; anyone else is told so, and the Infrastructure page says how things stand.
- AC-278b: Health shows HQ's own facts and a card for each site; Check again asks every connected site now.
- AC-278c: Recent errors are grouped by what failed, with how often, when last and what to do, for 24 hours or 7 days.
- AC-278d: a task run's error links to its run; a conversation's error shows only the error, the agent and the site.

---

### US-279 — Read the logs of HQ and its sites

As an organisation admin, I want to read and download the logs of HQ and of each site, so that I can follow a problem.

**Acceptance criteria:**
- AC-279a: I choose a source — HQ or a site — and see its errors and warnings newest first, or everything, narrowed by time and search, a page at a time.
- AC-279b: a site's lines are read from the site when I ask and kept nowhere in HQ; a site that is not connected says so.
- AC-279c: I can open a line in full, copy it and open the run it names, and download what I chose as text.
- AC-279d: no line holds a secret.

---

### US-280 — Hand support a bundle that holds no secrets

As an organisation admin, I want a file I can send when asking for help, so that the person helping sees what I see without seeing our work.

**Acceptance criteria:**
- AC-280a: the bundle holds versions, the names of settings and whether each is set, health, recent errors and logs.
- AC-280b: it never holds what people wrote or agents replied, files or secrets, and people, projects and agents appear as numbered placeholders.
- AC-280c: I see every file in it before anything is downloaded.

---

### US-281 — Keep the public health check quiet

As the person who runs HQ, I want the public health check to say only that HQ is up, so that it tells an attacker nothing.

**Acceptance criteria:**
- AC-281a: `/health` answers its status and nothing else; admins read the version and commit on Infrastructure › HQ.
- AC-281b: the old debug page is gone, with no forwarding.

---

### US-282 — Know which site is HQ's own, and see every site

As an organisation admin, I want HQ's own site named plainly and a way to list every site, so that I do not mistake it for HQ.

**Acceptance criteria:**
- AC-282a: HQ's own site reads "HQ · Built-in site" wherever it is shown — the list of sites (AC-241c), a run's facts, setup, Where it runs, errors and log sources.
- AC-282b: the Execution Sites heading on Infrastructure links to All sites.

---

### US-283 — Keep seeing a problem that is still open

As an organisation admin, I want the bell to stay lit while a problem that needs me is open, so that looking at it once does not make me forget it.

**Acceptance criteria:**
- AC-283a: the bell counts the items under Needs you that I have not seen and every lasting one that is still open, seen or not; it goes out once the problem is handled; the Needs you heading and Home keep the total. (How lasting notifications are raised, cleared and kept is US-238.)

## The user guide's screenshots and printed compose commands (added 2026-10-12)

### US-284 — Write guide pages and screenshots that stay in step

As a maintainer writing guide pages and the recipes that capture their screenshots, I want a check that pages and recipes agree and that the capture can never touch my own data, so that the guide never shows a missing or stray picture and my development data is safe.

**Acceptance criteria:**
- AC-284a: the name check fails, naming the page or the recipe, when a page refers to a screenshot no recipe saves or a recipe saves one no page uses.
- AC-284b: it fails for a name that is not lowercase words joined by hyphens and for two recipes saving the same name; a recipe's name comes from its file name.
- AC-284c: the screenshots are made from guide databases of their own, and the capture is refused unless they are named `_guide`.

---

### US-285 — Publish a release's screenshots once, and see what changed

As a maintainer publishing the guide at a release, I want each capture compared with the last release's and a release's images published once and only for a release that passed, so that I review what changed and never overwrite what a release already shows.

**Acceptance criteria:**
- AC-285a: the comparison lists the screenshots that changed, are new or were removed since the last release, and ignores differences too small to see.
- AC-285b: before the first release it has nothing to compare with and says so.
- AC-285c: publishing refuses a tag that is not a release, a release whose capture did not pass, and a release folder that already has images; a dry run uploads nothing.

---

### US-286 — Copy a printed command and have it work

As a self-hoster following the commands HQ and the installer print, I want each Docker command to name its settings file, so that it works when I paste it from the repository root without remembering a flag.

**Acceptance criteria:**
- AC-286a: every `docker compose` command HQ prints for its site includes `--env-file` naming the site's settings file. *(Reworded 2026-10-16: the bash installer was removed.)*

---

## Host management, as members and organisation admins see it (added 2026-10-16)

Written from the finished code at the close of the host management unit. The machine admin's stories are in [`host.md`](host.md) and the fleet admin's in [`console.md`](console.md).

### US-314 — Know ahead when maintenance touches my work

As a member, I want to be told ahead of maintenance on the site my work runs on, or on HQ itself, and have my runs pause and carry on by themselves, so that nothing I do is lost and I never have to act.

**Acceptance criteria:**
- AC-314a: I am told, from the moment it is planned, what will happen, when in my own zone, for how long and which of my projects pause — everyone is told when it is HQ itself — and told again when it moves, is cancelled or fails; I am never told who planned it.
- AC-314b: from a few minutes before, nothing new starts on what it affects and what runs pauses after its current step, and carries on afterwards.
- AC-314c: while HQ moves to another machine, every screen says it is read-only, and nothing I try to change is half done.

---

### US-315 — See where work runs without being able to change a machine

As an organisation admin, I want to see each site's standing and load but not control the machines, so that someone who takes over my account, or HQ itself, cannot take over a machine.

**Acceptance criteria:**
- AC-315a: I see each site's standing and load; a machine's figures, versions and logs are for fleet admins only, and I have no operation that admits, removes or re-keys a site.

---

## The conversational experience (added 2026-10-17)

Written from the finished code at the close of the unit *The conversational experience*. A **conversation** is held in hq and answered by the agent at the speed of conversation; **work that takes longer** is handed to the agent's own session in the place, and comes back as a result. A **place** is the person's own space (Chat) or a project; a **task** has a conversation of its own, the team's.

### US-316 — Talk to an agent and get an answer at once

As a member, I want to say something to an agent and see the answer written as I watch, so that I can think out loud without waiting for the work to finish.

**Acceptance criteria:**
- AC-316a: I start a conversation by sending a first message in Chat or in a project; it begins with my primary agent, and a first message sent twice starts one conversation.
- AC-316b: the reply is written as I watch, and when it cannot be written it says why in words I can act on, keeping what was written.
- AC-316c: I can send while a reply is being written, and it waits or stops the reply as my setting says; I can stop a reply, take a waiting message back or send it now.
- AC-316d: my conversation is mine: nobody else reads it, an organisation admin included, and in a project it is mine while I am on the project; the agent acts with my permissions, not another's.
- AC-316e: a conversation I can no longer speak in — I left the project, or it was deleted — stays readable to me, says why, and offers a new one with the same agent.

---

### US-317 — Choose the agent and the model I talk with

As a member, I want to choose which agent I talk to and which model it talks with, so that I get the answer I need at a price I accept.

**Acceptance criteria:**
- AC-317a: I choose my primary agent in Settings, and any agent the place offers before my first message, searching by name, handle or role, with my recent agents first.
- AC-317b: I pick the conversation's model, each shown with its provider, from only those my organisation's lists let run, before the first message and at any time after, and the switch is noted in the conversation. *(Changed 2026-10-23)*
- AC-317c: the conversation uses the provider I picked, and when it stops working I am told and offered the same model through another provider, and nothing is switched behind my back (AC-359f). *(Changed 2026-10-23)*
- ~~AC-317d: my organisation, a project and I can set which models are used for talking, for light work and for heavy work, within the organisation's limits, and work runs on the model the rules say.~~ *(Retired 2026-10-23 — the organisation, an agent, a project and I set lists and defaults; US-359, US-360)*

---

### US-318 — Let an agent do longer work while I keep talking

As a member, I want to hand an agent a job and keep talking while it works, so that I am never left watching it.

**Acceptance criteria:**
- AC-318a: the agent starts the work in my space or a project we both work in, and says in its own words what it started, in the same reply; I can keep talking.
- AC-318b: when the work ends I am told in the conversation, and by a notification when I am away, with a result I can open; the agent reports it once, and goes on to a next step only when I authorised it and everything still permits it.
- AC-318c: all my live work is in one bar at the end of the conversation, where I can see what it is doing and stop it.
- AC-318d: work starts only where I and the agent are both allowed, and a refusal says why in words the agent can pass on.
- AC-318e: a reply that needs many lookups hands the rest to the background by itself, so that I get an answer, not a wait.
- AC-318f: nothing is lost or done twice when HQ restarts or a result is told twice.

---

### US-319 — Put a task to work now, later or at a time

As a member, I want to ask an agent to create a task for now, for later or for a time, so that the work lands on the board the way I meant.

**Acceptance criteria:**
- AC-319a: for now, the task is created and queued for its agent, and I hear back when its run ends.
- AC-319b: for later, the task waits in the backlog until someone queues it, and nothing comes back to the conversation.
- AC-319c: for a time, the task starts then, in my timezone, and the conversation says when; its runs do not come back to the conversation.
- AC-319d: a run says what it achieved, and that result is on the run and on the task; a run that said nothing is shown as having said nothing.

---

### US-320 — Say okay to what an agent wants to do

As a member, I want an agent's request for my okay shown in one place, with what and why, so that I decide knowing what I am agreeing to.

**Acceptance criteria:**
- AC-320a: a request says what the agent would do and why, and waits in the work bar, taking no turn of its own.
- AC-320b: Approve lets it go ahead once, as me; Decline stops it with my note; answering twice does nothing more.
- AC-320c: only someone who passes the same checks as the agent's person can answer, and the answer names who gave it.
- AC-320d: I can say yes aloud, but only after the agent has read the action back, and the record says it was spoken.

---

### US-321 — Talk about a task with my team

As a member of a project, I want a conversation on a task that the whole project can read and speak in, so that the thread is the task's running story.

**Acceptance criteria:**
- AC-321a: anyone on the project can start and read a task's conversation from its page; a Viewer only reads; someone off the project is told it does not exist.
- AC-321b: its agent is the task's agent now, so when the task changes hands the conversation carries on with the new agent and says so; with no agent it can be read but not spoken in.
- AC-321c: work from the thread is a run of the task, every run of the task shows in it as a card, and anyone allowed can answer a request, named on the answer; the project pays.
- AC-321d: the board shows a mark with how much is unread; the thread goes with its task, and only a project admin deletes it, never the task.

---

### US-322 — Keep a long conversation going

As a member, I want a long conversation to carry on without losing what mattered, so that I do not have to start again.

**Acceptance criteria:**
- AC-322a: when a conversation grows long, the older part is folded into a summary at the start of a turn, never mid-turn, and the newest part stays word for word.
- AC-322b: a summary is marked in the thread, opens to its full text and from there to the messages it covers, and the agent may offer a new conversation when the subject moves on.
- AC-322c: I can summarise now, and it returns at once.
- AC-322d: decisions, approvals and open work survive every summary, and the agent can look back at a summary or at the exact words.
- ~~AC-322e: I can continue a chat from before in a new conversation with the same agent in the same place, seeded with a summary.~~ *(Retired 2026-10-18 — chats from before the new conversations are no longer shown or continued; nothing has been released, so there are none to carry on)*

---

### US-323 — Be remembered by the agents I work with

As a member, I want agents to remember what I have told them and to find it when it matters, so that I do not repeat myself, and to be able to correct them.

**Acceptance criteria:**
- AC-323a: what an agent knows about me is memory I own, in three scopes — mine for any agent, mine with one agent, and the agent's in one place — reached only by those the rule allows, and a run starts with what I pinned.
- AC-323b: agents remember a fact only when it stands alone, do not keep duplicates, and find a memory by its meaning when it matters, with what they relied on measured.
- AC-323c: I see my memory on a screen in Settings, and add, edit, pin and forget items in it; nobody else can.
- AC-323d: a project admin sees and curates what agents learned in the project; an organisation admin sees how well recall works and switches the model that reads memory.
- AC-323e: memory that nobody uses is archived and duplicates merged, never what I pinned.

---

### US-324 — Have agents use my place's knowledge

As a member, I want an agent to find what my team and my organisation wrote down, so that its answers use our own words. *(Changed 2026-10-26: knowledge is pages at every level, reached through the knowledge tools.)*

**Acceptance criteria:**
- AC-324a: the agent searches the conversation's places, the organisation's knowledge and the platform guide in one search, each answer saying where it came from, reads a page with its line numbers and may quote it to me; knowledge stays on its site, and when a level cannot be searched the agent is told so while the others still answer. *(Changed 2026-10-26: every level, through the knowledge tools.)*
- AC-324b: no run holds knowledge as files: agents reach it only through the knowledge tools, which cannot reach outside a place's pages, cannot be made to hang the machine, and give away no path, error or what was searched for.
- AC-324c: an agent changes a page only when a person asks, through the same checks a person's save meets; it must have read a page before replacing it, never changes the platform guide, changes the organisation's only for an organisation admin, and changes nothing in a run that may not change files.
- AC-324d: a worker in a place has the same knowledge tools as the conversation's agent, limited to its place, the organisation's knowledge and the platform guide.

---

### US-325 — Talk to an agent by voice

As a member, I want to talk to an agent aloud inside the conversation, so that I can work hands-free and still see and answer everything on screen.

**Acceptance criteria:**
- AC-325a: one button starts voice when the box is empty, and says why when it cannot; one person at a time holds voice in a conversation, and starting and ending are noted in the thread.
- AC-325b: what I say becomes a message when I pause and is answered like a typed one, and the reply appears in step with the voice.
- AC-325c: speaking over the agent stops it, the record keeps only what I heard, voice stays on, and the agent's own voice is not mistaken for mine.
- AC-325d: what must be seen — a table, code, a diagram — is a card I open beside the thread without stopping voice, and the agent says one line about it.
- AC-325e: voice carries on while I move through HQ, with a bar to mute or end it.
- AC-325f: voice ends after two minutes of silence with a warning before, and when speech or voice fails the conversation carries on in text.
- AC-325g: voice works on a laptop's own speakers without hearing the agent as me, dropping my words or falling behind. *(Not yet met.)*

---

### US-326 — Dictate into the message box

As a member, I want to dictate into the message box and correct it before I send, so that I can write by speaking.

**Acceptance criteria:**
- AC-326a: my words appear as I speak, are corrected in place when the service has finished them, and never overwrite what I type or edit.
- AC-326b: Send sends what is shown, stopping dictation keeps what was heard, and dictated words are sent once.

---

### US-327 — Read the conversation at a glance

As a member, I want the thread to read as prose with the work around it kept quiet, so that I can follow without a dashboard.

**Acceptance criteria:**
- AC-327a: every kind of item in the record has a place in the thread — messages, summaries, notices, work and tasks the agent made, completions, failures, cards — each a line or a card that opens, not a block.
- AC-327b: a reply that looked things up has a pill that counts while it works and opens to the steps, in words, with what it started or set.
- AC-327c: the message box is one pill with a plus, the text, a microphone and one right button, and before the first message the agent and the model are two quiet buttons.
- AC-327d: my conversations are listed by place, newest first, marking what is closed, with a menu of what I may do to one. *(Changed 2026-10-18: chats from before the new conversations are no longer listed)*
- AC-327e: I can copy a reply, and a message waiting behind a reply says so and can be sent now or taken back.

---

### US-328 — Keep, archive, delete and find

As a member, I want to keep what I need, let the rest archive, delete what I must, and find a run from its conversation, so that nothing is lost by accident.

**Acceptance criteria:**
- AC-328a: a conversation idle for my organisation's period is archived and kept, found by search and active again when I return; I can keep one out of archiving.
- AC-328b: deleting names the work that will stop and the tasks that stay, offers archiving instead, and is mine alone (a task's conversation: a project admin's).
- AC-328c: I can open the Runs screen on one conversation and search what its runs said.

---

## The desktop shell (added 2026-10-18)

Written from the finished code at the close of the unit *the desktop shell*. A place's sections are in the **left panel**, which drills into the place, and one conversation is **docked** beside whatever page is open — the **dock** — until the person changes it.

### US-329 — Move through a place's sections from the left panel

As a member, I want the left panel to become the place I am in — a project, my own space or an agent's page — and list its sections, so that every part of a place is one click away and the work gets the whole width and height.

**Acceptance criteria:**
- AC-329a: a project, my space and an agent's page list their sections in the left panel, each with its count, in a fixed order under small group labels, opening on Overview; the section I choose fills the page, and the address names it, so a link opens it and Back returns.
- AC-329b: on a medium window or a collapsed navigation the panel is one icon per section, with its name on hover and its count as a badge; on a phone the drawer is the same panel and the header names the section and lists the sections.
- AC-329c: Overview shows the place's facts, a project's description and its sections with their counts, each opening that section; the place's avatar, name and pin head the panel, with a button in the bar to talk about the place.
- AC-329d: my own space has its own entry and address, with the same kind of sections as a project; Chat lists my space's conversations, with the main navigation in the panel.
- AC-329e: the navigation, the bar and the panels are drawn once, so moving between pages never resets them.
- AC-329f: ‹ in the panel shows the main navigation over it, to go anywhere; choosing where I am, ✕, Esc or a click outside closes it and nothing moves.
- AC-329g: each part of the breadcrumb opens a list — the main places, the projects, my projects (keeping the section) and the place's sections.
- AC-329h: the foot is always two rows — Pinned, showing the pin I used last, with its list opening upward, and my name, opening Overview, Manage for an organisation admin, Your settings and Sign out — with Collapse on that row. *(Changed 2026-10-23)*

---

### US-330 — Keep one conversation beside whatever I work on

As a member, I want one conversation to stay open beside any page I go to, so that I can talk about the work while I look at it, and never lose my place in either.

**Acceptance criteria:**
- AC-330a: the conversation stays open wherever I go until I change or close it, and the address keeps it, so a reload and Back bring it back.
- AC-330b: a conversation I open from a list, from Home or from a link opens beside where I am, saying where it lives; a link from outside HQ also shows its place.
- AC-330c: a reply keeps being written, and what I typed stays, while I move around; a link in the conversation opens beside it.
- AC-330d: I can switch to a recent conversation of the place I am in, or go to them all.
- AC-330e: I can expand it over the page until I go somewhere, collapse it to a slim rail that shows work under way and requests waiting, and bring it back with a click or ⌘J.
- AC-330f: I can drag its width, and my browser remembers it.
- AC-330g: deleting or archiving it closes it, and I stay where I was.

---

### US-331 — Start a conversation from anywhere without losing my place

As a member, I want to start a new conversation from any page, in the place I am on or another I choose, so that I can ask at once and still go back to what I had open.

**Acceptance criteria:**
- AC-331a: a new conversation is a draft beside the page, in the place I am on, with the message box ready, so the usual case is to type and send.
- AC-331b: I can choose another place I belong to from a list with search, and the chosen place says what a conversation there can do and which agent leads it.
- AC-331c: Cancel or Esc puts back exactly the conversation I had open, and drops what I typed in the draft.
- AC-331d: sending opens the new conversation beside the page, naming its place.

---

### US-332 — Use the conversation at any window width

As a member, I want the conversation to fit the window I have, from a wide screen to a phone, so that I can keep talking whatever I use.

**Acceptance criteria:**
- AC-332a: on a wide window it sits beside the work; on a medium one it slides over the page and the navigation shrinks to icons; on a phone it fills the screen and puts away to a pill at the bottom of every screen.
- AC-332b: changing the window's width never loses the conversation, its scroll, what I typed or a reply being written.

---

---

## Connecting HQ to Agenthix Cloud, and its sign-in

### US-338 — Sign in to HQ with my Agenthix account

As a member whose organisation has connected HQ to Agenthix Cloud, I want to link my Agenthix account to my HQ account and sign in with it, so that I use one account, while HQ keeps working for everyone if Cloud is away.

**Acceptance criteria:**
- AC-338a: in Settings › Sign-in I link my Agenthix account after entering my HQ password, and I can unlink it; an account linked to someone else is refused.
- AC-338b: signing in with it works only for a linked person still in the organisation, gives me HQ's own session, and asks Cloud for nothing that lists my other organisations.
- AC-338c: a return that did not start in my tab, a repeated return and a late one are refused.
- AC-338d: when the organisation disconnects, those who sign in with Cloud are told first and sign in with their HQ password from then on.

---

### US-339 — Be told by email the day before planned maintenance

As a member who linked an Agenthix account, I want an email the day before maintenance that affects my work, so that I am not surprised, while HQ keeps no email service of its own.

**Acceptance criteria:**
- AC-339a: HQ asks Cloud, through the connection, to email only the linked members a booked change affects, and sends a new time or a withdrawal for the same change.
- AC-339b: HQ asks nothing of Cloud when it is not connected or no affected member has linked an account.

---

### US-340 — Stay signed in on my phone, and sign my phones out

As a member who uses the mobile app, I want my phone to stay signed in while I use it and to be signed out when I do not for 30 days, and to see and sign out my phones, so that a lost phone does not stay signed in.

**Acceptance criteria:**
- AC-340a: a phone's session renews while it is used and ends after 30 days unused.
- AC-340b: Settings › Devices and connections › Phone lists my phones with when each was last used, and Sign out ends one at once.
- AC-340c: I see and sign out only my own phones.

---

### US-341 — Have the mobile app know its connection is alive and what needs me

As a member who uses the mobile app, I want it to know whether its connection to HQ is alive, which version of HQ it talks to and when something needs me, so that it shows the truth without asking again and again.

**Acceptance criteria:**
- AC-341a: the app can send a small event HQ acknowledges, and HQ's health check stays free of the version.
- AC-341b: a signed-in app can read HQ's version over its connection; one with nobody signed in cannot.
- AC-341c: HQ tells a person's own connections when their notifications, their needs-you counts or their runs change, and no one else's.

---

### US-342 — Read a guide whose pictures match the Fleet Console too

As a reader of the user guide, I want the pages about running Agenthix to show the Fleet Console's screens, so that I can follow them.

**Acceptance criteria:**
- AC-342a: each Fleet Console page of the guide has a picture of the real screen, made from a sample organisation, and a change to the Fleet Console's API that the sample no longer matches is caught before it is merged.
- AC-342b: the guide's administrator is a fleet admin, so the pages and pictures about diagnostics are true, and the server's clock and the sample's dates do not change a picture from one run to the next.

---

### US-343 — Cut a pre-release and publish its screenshots

As a maintainer, I want a tag such as an alpha to capture and publish the guide's screenshots once, without reaching the live website, so that a pre-release can be checked before launch.

**Acceptance criteria:**
- AC-343a: a pre-release tag runs the capture, and publishing writes that tag's folder once.
- AC-343b: every workflow is checked for mistakes whenever one changes.

---

## What the platform shows of Agenthix Cloud

### US-344 — See that Agenthix Cloud exists, and ask for it

As a member, I want sign-in pages and Settings to tell me what an Agenthix account would give me and let me ask for it, so that I can have it without finding out who runs HQ.

**Acceptance criteria:**
- AC-344a: the sign-in page always carries *Sign in with Agenthix Cloud*; when HQ is not connected it is greyed out with its reason beneath, and a public page carries no link to Cloud.
- AC-344b: on an invitation and in setup it is greyed out the same way, and when connected it says to accept with a username and password first and starts nothing.
- AC-344c: in Settings › Sign-in, when HQ is not connected, I can ask a fleet admin to turn it on, once, for good; afterwards it says I asked.
- AC-344d: the review at the end of setup mentions Cloud once, in a sentence with no action, and not on an HQ that Cloud runs.

---

### US-345 — Know which organisation I am in, and switch

As a member, I want to see which organisation I am in and what to do to reach others, so that I can move between organisations or start my own.

**Acceptance criteria:**
- AC-345a: the menu names only this organisation; when HQ is not connected it says other organisations need Agenthix Cloud and where to ask; connected but not linked, it points to linking my account; linked, *Switch organisation…* opens my switcher on Cloud.
- AC-345b: *Start your own organisation* is always there when HQ knows where Cloud is.
- AC-345c: a link out carries where to return to, what I was doing and where I came from, and nothing about the organisation or me.

---

### US-346 — Find Agenthix Cloud, and be offered it only where it removes a limit

As a fleet admin, I want one place in the Fleet Console that shows where the organisation stands with Cloud and how many people asked, and a single dismissible offer where Cloud would remove a limit I have hit, so that I am never sold what I do not need.

**Acceptance criteria:**
- AC-346a: HQ's page has a Cloud section in each state — not connected, connected, HQ on Agenthix Cloud — with one Connect wording and how many people asked when any did.
- AC-346b: the Fleet Console's menu head lists only this organisation and offers the switcher, as the member sees it.
- AC-346c: an offer appears only to a fleet admin, as one line, only on *no site available*, *backups kept on the machine* and *domain and HTTPS*; dismissing it is kept for good, for that person and that offer.
- AC-346d: Organisation › Infrastructure and HQ's page say where HQ runs, and link to the guide's page on Agenthix Cloud.

---

### US-347 — Be invited to the Responsible AI Pledge, without being nagged

As a member, I want to be invited to the Responsible AI Pledge and told why, and not asked again once I have signed or dismissed it, so that it never nags.

**Acceptance criteria:**
- AC-347a: from my first sign-in a card on Home invites me to the pledge and says why, and dismissing it is kept for me alone.
- AC-347b: without a linked Agenthix account HQ asks no one for the card; no link carries anything about me or the organisation.
- AC-347c: with a linked account, I am not shown the card once I have signed the current version, I can sign in one step if I have not, and a new version reaches me once.
- AC-347d: Settings shows me my own signature and links to my badge; no one else sees it there.

---

## Models and voice from one place (added 2026-10-23)

### US-355 — Keep the organisation's providers in one place

As an organisation admin, I want to add, replace, rename, check and remove the services the organisation reaches AI through, each with one key that is never shown back, so that the people and agents of the organisation can use models and voice without anyone holding a key.

**Acceptance criteria:**
- AC-355a: I add a provider by its type and vendor with its key, and the key is checked with the vendor first; the organisation has at most one provider of a vendor.
- AC-355b: I replace a key and the new one is checked before the old one is dropped; I rename a provider.
- AC-355c: a key is stored encrypted and never shown to me or anyone, only its last four characters.
- AC-355d: only an organisation admin, HQ's machine and Agenthix Cloud on a machine it runs may change providers; a member may not.
- AC-355e: before I remove a provider I am told what falls to what, and that a type goes down when I remove its last provider; I can revoke one at once. *(Changed 2026-10-28)*
- AC-355f: every change is recorded with who made it and when, and every organisation admin is told.
- AC-355g: I am told when a provider stops working, in the vendor's words and with what depends on it, and everyone else sees it only where they are choosing a model or using voice.
- AC-355h: the Providers page shows each provider's state, what uses it, the end of its key and, for a custom endpoint, its address.
- AC-355i: I connect Agenthix Cloud from HQ, in setup or on Providers, by approving a short code; it says when it is not available yet.

---

### US-357 — Set up HQ with models and voice

As the person who installed HQ, I want one setup, opened from the link the installer printed, that makes my account, describes the organisation, and gives my agents a model and a voice now or later, so that I can start even before I have the keys.

**Acceptance criteria:**
- AC-357a: setup opens at the first step that is still needed, whether I stopped there or came back.
- AC-357b: before setup is finished HQ's address shows no organisation: it says it is not set up yet and how to get a new link, or that it is almost ready.
- AC-357c: setup takes me through my account, the organisation, how my agents reach AI (Agenthix Cloud, my own keys, or later), a model provider and voice for my own keys, each of which I can skip, and a last look. *(Changed 2026-10-28)*
- AC-357d: setup finishes with or without models and voice, says plainly what is not set up yet, and writes the organisation's defaults for what was added; a provider added later fills the defaults still empty, and until then HQ says models or voice are not set up rather than down. *(Changed 2026-10-28)*
- AC-357e: the defaults are chosen for me from what I added, I can change each on the last look, and a preview plays the voice.
- AC-357f: I give the organisation a name, a picture, a cover and a time zone, and a default billing profile is made, named after it.

---

### US-358 — Manage the organisation in a place of its own

As an organisation admin, I want a separate area for what only I manage, reached from my account menu, so that the organisation's page stays for everyone and my tools stay out of the way.

**Acceptance criteria:**
- AC-358a: only an organisation admin reaches it; a member who tries is told who to ask.
- AC-358b: it has its own menu — Overview, People, Agents, Models and billing, Settings, and Where work runs — with a way back to the organisation, and no conversation docked beside it.
- AC-358c: the old addresses of what moved lead to where it went.
- AC-358d: its Overview shows what needs me and the day's figures.
- AC-358e: if I am not signed in, an address in it sends me to the sign-in page instead of leaving me waiting.

---

### US-359 — Know which model and provider every call uses

As a member or an organisation admin, I want every call to a model decided by one rule, so that I can tell which model through which provider a conversation, a task or a worker uses and why.

**Acceptance criteria:**
- AC-359a: one rule decides every model, listening and speech call, and answers a model through a provider or one problem.
- AC-359b: a call takes my pick, else the model a conversation already talks on, else the agent's own default, else the organisation's.
- AC-359c: the runtime follows the model and the provider, and I choose neither.
- AC-359d: the organisation, an agent, a project and I can each say which models may and may not run, with patterns such as a maker or a family, and a ban always wins.
- AC-359e: when nothing may run I am told what is missing and who can add it, and a pick a list cuts is refused rather than swapped.
- AC-359f: when a provider stops working new work goes through another and returns by itself, and a conversation fixed to it is offered the same model through another provider, never switched without my say.
- AC-359g: my own Claude subscription serves work in my own place only and never pays for HQ's own calls.
- AC-359h: a model picker shows each model with its provider and the ones a provider that is not working would serve are marked.

---

### US-360 — Choose the organisation's models and voice

As an organisation admin, I want to set the models and the voice the organisation and each agent use, and which models may run, in one place, so that I decide what people get.

**Acceptance criteria:**
- AC-360a: Models holds three settings — the default model (which a conversation and the work it hands off run on), the voice and the listening model — and one line about which models may run.
- AC-360b: an agent can have its own of each or follow the organisation, and every agent has a voice.
- AC-360c: I edit a list with patterns and bulk selection, and a project admin or a person may narrow it for their own place but never widen it.
- AC-360d: speech is always Inworld TTS 2 and listening is one of three AssemblyAI live models, and nothing else can be saved.
- AC-360e: I choose a voice by ear from the provider's own list, with filters and a search, and tapping a voice plays a sample.

---

### US-361 — Speak and listen through the organisation's providers

As a member, I want voice to work for any agent through the organisation's listening and speech providers, so that I can talk to it hands free.

**Acceptance criteria:**
- AC-361a: voice uses the providers the organisation chose for the agent, costed to the conversation's place, and says plainly, and who has been told, when no provider works.
- AC-361b: a sample of a voice plays through a working speech provider, and when none works I am told.

---

### US-362 — Make as many personal projects as I need

As a member, I want to make personal projects of my own besides my space, so that I can keep separate pieces of my own work, private to me.

**Acceptance criteria:**
- AC-362a: I make one by giving a name, whether or not I am an organisation admin, and it has its own files.
- AC-362b: only I see it; an organisation admin sees neither its contents nor its name.
- AC-362c: I can delete it by typing its name, and nobody else can; my space is never deleted.
- AC-362d: it has no members and cannot be shared, my work in it runs as me with my own subscription and lists, and its cost goes to the default billing profile.

---

### US-363 — Know what AI costs and who it belongs to

As an organisation admin, I want every call costed to a billing profile and a report of what each profile, project, agent and person used, so that I can say whose cost it is.

**Acceptance criteria:**
- AC-363a: every call is written once to a ledger that is only added to, with its cost in exact millionths.
- AC-363b: a cost says whether it is estimated from list prices, included in a subscription, unpriced, or awaiting Agenthix Cloud's actual figure, and voice at list price is said to be an estimate.
- AC-363c: HQ's own calls — replies, titles, summaries and samples — are costed.
- AC-363d: an agent's calls on a site are costed once each to their project and billing profile, even if reported twice.
- AC-363e: listening and speech are costed by the time and the characters used.
- AC-363f: I make, rename, archive and choose the default billing profile; the default and one projects use cannot be archived until they move.
- AC-363g: a new project gets the default profile and, when there are two or more, its creator may pick one; only I change it later.
- AC-363h: Usage shows a month by profile, project, agent or person, keeps each currency and basis apart and exports to a file.
- AC-363i: a month is cut in the organisation's time zone and a person who is erased stays in the report as a former member.

---

### US-364 — Keep provider keys out of agents' containers

As a machine owner, I want an agent's model calls to pass through my site without its container ever holding a provider key, and each call's usage to be reported to HQ, so that a key cannot leak from a run and every call is costed.

**Acceptance criteria:**
- AC-364a: the site relays a call only for a run's own turn, from its own container, with the turn's key set at the last step.
- AC-364b: the site's log never holds a key, a token or a body.
- AC-364c: the relay works behind a proxy without giving the proxy the key.
- AC-364d: each call's usage is read as the answer passes, unchanged, and reported to HQ.
- AC-364e: a report waits on disk until HQ acknowledges it, so a restart loses none.
- AC-364f: a call through Agenthix Cloud uses a token HQ gives the site and never one the harness sent.

---

## Workflows, secrets and GitHub (added 2026-10-25)

A place's secrets — a project's, or a person's own storage's — are used only by **workflows**: fixed steps a person approved word for word, run by the site in containers of their own. An agent proposes and runs them, and never holds a secret.

### US-375 — Approve the workflows that may use my place's secrets

As a project administrator, or a person for their own storage, I want every workflow that can use my place's secrets listed, and each new version of one to wait for my approval, so that nothing runs with a secret unless a person read it and agreed.

**Acceptance criteria:**
- AC-375a: every workflow of my place is listed with its steps, the secrets it uses, its versions and its runs; a new version waits for the place's administrators, and an agent can never approve, decline or switch one.
- AC-375b: I approve one exact version, identified by its hash; it then runs as often as needed until a newer version is approved, a version waiting meanwhile never stops it, and the same files in another project wait for that project's own approval.
- AC-375c: before I decide, plain checks with no model flag risky patterns and a reviewer that holds nothing advises; the card in the conversation offers Approve only when the plain checks allow it, and otherwise only the full review, with the reason.
- AC-375d: in my own storage I approve only GitHub permissions over contents and pull requests; anything wider also needs an organisation administrator.
- AC-375e: I switch a workflow off, which stops it running for anyone and stops a run in progress, and on again without approving it again.
- AC-375f: when the executor image changes, an approval carries over only where its tools are the same; otherwise the version asks for approval again while the one approved before keeps running.

---

### US-376 — Keep my place's secrets and variables

As a project administrator, or a person for their own storage, I want to keep the secrets and the plain settings my place's workflows use, so that each value is in one place, used only where it is named, and never seen again once typed.

**Acceptance criteria:**
- AC-376a: a secret is typed, or uploaded as a file of up to 48 KB, once; it is stored encrypted, never shown again to anyone, agents included, and can only be replaced.
- AC-376b: each secret says what it is and where to get a new one, and may carry a rotate-by date: the administrators are told a week before, and it shows overdue from the day.
- AC-376c: a variable's value is in plain sight with every change old → new; a name that changes how programs run is refused, and a value that looks like a secret is questioned before it is saved.
- AC-376d: I see which workflows use each secret and variable, and deleting one that a switched-on workflow uses is refused, naming the workflows.
- AC-376e: every set, replace and delete, and every run that used a secret, is recorded with who and when, never the value.
- AC-376f: only the place's administrators change them; the place's people read their names and descriptions.

---

### US-377 — Let agents use workflows without ever holding a secret

As a member, I want an agent to write, propose and run workflows for the work I give it, so that it can deploy, push or open a pull request without a secret ever being in its container, where an instruction hidden in a file could make it leak one.

**Acceptance criteria:**
- AC-377a: an agent lists the place's workflows by name, proposes a new version from a definition in one of the place's workspaces, runs an approved one on a workspace it names, and checks on a run.
- AC-377b: a run an agent starts is on behalf of the person its run is for, so an agent working for someone who only reads the place cannot run one; an agent may run a workflow a limited number of times an hour, and people are not limited.
- AC-377c: no secret value, and no GitHub token, ever reaches the agent's container; a plain `git push` there fails, naming the `push` workflow.
- AC-377d: the agent gets each step's result and the last lines of its masked output, and of a run that left a secret in a file only that its changes were dropped.
- AC-377e: values that change from run to run are parameters, checked against the rule approved with the workflow, and reach the steps as files, never as text pasted into a command.

---

### US-378 — Run workflows on my machine without exposing what they hold

As a machine owner, I want my site to run each workflow exactly as approved, apart from the agents, so that a secret it is given can't be read by an agent or sent anywhere that wasn't approved.

**Acceptance criteria:**
- AC-378a: the site checks the version's hash again and runs only the approved files, from a read-only folder, on a snapshot of the workspace the agent can't change while it runs.
- AC-378b: each step runs in a fresh, hardened container with only the secrets that step names, as files, and the container is removed before the next step starts.
- AC-378c: a step has no network unless hosts were approved, and then reaches only those hosts, through a proxy that answers its name lookups and refuses the machine's own and private addresses.
- AC-378d: what a run changed reaches the workspace only after a scan finds no secret in it, git's own stored objects included, and a file the agent changed meanwhile is kept.
- AC-378e: the site never follows a symbolic or hard link while reading, copying or writing back.

---

### US-379 — Set up GitHub for the organisation

As an organisation admin, I want to register the organisation's own GitHub App once and decide which GitHub accounts it may work on, and for which places, so that agents can work on our repositories and our clients' without a long-lived key.

**Acceptance criteria:**
- AC-379a: I register the App from one page, *Manage organisation › Settings › GitHub*, choosing the GitHub organisation that owns it; the page holds the App and its accounts, and Infrastructure's GitHub App card leads there.
- AC-379b: anyone may install the App, but a new installation is used only once I allow it, choosing every shared project or chosen ones, and the people whose own work may connect (none by default); I can ignore one instead.
- AC-379c: the page shows the App's real permissions on GitHub with what uses each, what each account lets it reach and whether it accepted the latest permissions, and gives me an install link to send a client.
- AC-379d: after GitHub sends me back, the page looks for the new installation itself, with no Refresh to press.

---

### US-380 — Connect a workspace to a repository, with its starter workflows

As a project administrator, I want to connect a workspace to a new or existing repository through one flow that checks before it creates, so that agents can work on the code and share it through approved workflows.

**Acceptance criteria:**
- AC-380a: I set my project's default GitHub account from those it may connect to, and a connection starts there; a person's own space is offered the accounts chosen for them.
- AC-380b: before a repository is created, the flow checks that the account can create one and that the name is free, says how to fix an account that can't, offers the existing repository on a clash, and deletes a repository it created if a later step fails, saying so.
- AC-380c: an existing repository is checked out into an empty workspace, or receives a workspace's files when it is empty or shares their history, and is otherwise refused, never overwritten; a workspace's own branches are never moved.
- AC-380d: once connected, the starter workflows `push`, `pull` and `open-pull-request` wait for approval in the same sitting.
- AC-380e: a connected workspace shows the workflows that reach GitHub, the repository's own GitHub workflows with their last run, and the secrets on GitHub by name, each saying whether it came from Secrets.

---

### US-381 — Follow a workflow's run

As a member, I want to start a workflow and follow its steps, in its own page and in the conversation that started it, so that I can see what it did and where it stopped.

**Acceptance criteria:**
- AC-381a: I run a workflow from the Workflows section, its parameters checked before anything is sent, and its run shows each step's state and time, the running step's live masked output, and Stop for anyone who could start it.
- AC-381b: in the conversation a run under way is in the work bar with the step it is on; once finished it moves into the thread where it ended, with how it ended and a link to the run.
- AC-381c: I see all of a step's masked output, and which file and which secret a scan found.

---

### US-382 — Keep secrets safe around GitHub and in output

As a project administrator, I want GitHub tokens narrowed to each run, protected branches and GitHub's own secrets kept from what agents push, and secret values hidden from output, so that a workflow can't do more than it says or show what it holds.

**Acceptance criteria:**
- AC-382a: each run gets its own GitHub token, for its workspace's own repository by GitHub's ids, with only the permissions its workflow declares, checked against which places may connect at every mint, and ended when the run ends.
- AC-382b: `push` and `open-pull-request` refuse a protected branch, read from GitHub when the run starts, and refuse when it can't be told.
- AC-382c: `set-github-secrets` sets environment secrets only, on an environment that only protected branches may deploy from.
- AC-382d: every secret of the place is hidden in a run's output in its common encodings, and a run that printed one is flagged and the administrators told to replace it.
- AC-382e: *Turn off what uses it* switches off at once every workflow that uses a secret or variable, and stops their runs in progress.
- AC-382f: adding a secret can also set it on GitHub, which proposes `set-github-secrets` for it.

---

## Knowledge at every level (added 2026-10-26)

Written from the finished code at the close of the agent knowledge unit. Knowledge is what a place has written down to share — processes, decisions, conventions, reference — as **pages** in **sections**, at four **levels**: the platform guide (how Agenthix works), the organisation's, a project's, and Your space's. Agents look it up when they need it; people browse, edit and restore it in the Knowledge tool. What agents find and change on their own is in US-324.

### US-383 — Ask an agent about Agenthix itself

As a member, I want an agent to answer a question about Agenthix from the product's own guide, so that it finds the right screen or setting without asking me back, in the words the product uses.

**Acceptance criteria:**
- AC-383a: asked how to do something in Agenthix, the agent searches the guide before answering or asking back, and names the screens and settings as the guide does.
- AC-383b: the guide agents read is the user guide of the running version, with its glossary and a list of the agents' tools; a guide page without a description, a glossary that cannot be read, or a tools list that differs from the tools stops the build.
- AC-383c: whatever the guide describes, the agent is reminded that what it may do is what its own tools allow.

### US-384 — See what an agent did with knowledge, and undo it

As a member, I want to see in the conversation which knowledge an agent searched, read and changed, and to open or undo a change, so that I can trust what it writes down and correct it at once.

**Acceptance criteria:**
- AC-384a: each search, read and change of knowledge is one line among the reply's steps, in plain words, naming the places searched or the page.
- AC-384b: a change says in one line what changed, opens the page's history at that version, and can be undone once.
- AC-384c: every change records who made it — me, or the agent and the person it acted for, with the conversation or run it came from — and that record outlives the agent and the conversation.

### US-385 — Browse, search and read a place's Knowledge

As a member, I want to browse, search and read the pages my team has written down, in a project, in Your space and for the whole organisation, so that I can find what we know without asking an agent.

**Acceptance criteria:**
- AC-385a: I see a place's knowledge as sections and pages, newest first, with what each is about, its tags and properties, and who changed it last; I narrow it by tag and property, and pages that need fixing — a page put there by hand included — are gathered with what is wrong.
- AC-385b: I read a page with its headings, follow its links to other pages, the organisation's included, and see which pages link to it.
- AC-385c: I search for the words I type in this place, the organisation's or both, and each result says where it is from.
- AC-385d: what I am offered shows what I may change: someone who may only read sees no way to change.

### US-386 — Write and keep a place's Knowledge

As a member who may change a place, I want to write, change, move and delete its pages, and to see and undo what was changed, so that the team's knowledge stays right and nothing is lost by mistake.

**Acceptance criteria:**
- AC-386a: a project's Members and Admins change its knowledge and a Viewer only reads it; Your space's is mine alone; the organisation's is changed by its admins; and every change, mine or an agent's, goes through one gate that keeps the page as it was before.
- AC-386b: I write a page as a title, description, tags, properties and text, never front matter, and the same rules the agents meet tell me on each field what to fix; nothing that breaks them is stored.
- AC-386c: when someone changed a page while I was editing it, nothing is lost: I keep my text, see theirs and who made it, and choose; two changes at once never mix.
- AC-386d: I move a page to another section without its ever being under both names or under neither.
- AC-386e: a deleted page is kept 30 days with who deleted it and can be restored; I can remove a page, or one version of it, for good after one confirming step.
- AC-386f: I see every earlier version with who made it and what it changed, and restore one as a new version; earlier versions are kept 30 days, a page's last 20 always, and tidied away by themselves after that.

### US-387 — Keep the organisation's own Knowledge

As an organisation admin, I want one place for how the whole organisation works that every member and agent can look up, so that it is written once and not copied into every project.

**Acceptance criteria:**
- AC-387a: every member and every agent reads it, from the organisation's area and from any project; only organisation admins, and agents acting for one, change it.
- AC-387b: it has the same screens as a project's Knowledge, at its own address in the organisation's area, with a card on the Workplace.
- AC-387c: it is kept on the organisation's default site from its first use and does not move when the default changes.
- AC-387d: no project can take a name that is a level of knowledge (org, platform, personal) or the key ORG.

### US-388 — Decide how far a conversation reaches

As a member, I want to choose which of my places a conversation can read and work in, so that what an agent finds in one place reaches another only when I put them together.

**Acceptance criteria:**
- AC-388a: a conversation reaches its own place, the organisation's knowledge and the platform guide, and any other place only after I add it; I see which places it holds at the top of the conversation.
- AC-388b: only I, whose conversation it is, add or remove a place, and only one I can open, after being told what adding lets the agent do; the agent can ask me with a card but never adds one.
- AC-388c: a place I lose access to drops out of the conversation, and nothing reaches it from then on.
- AC-388d: the agent knows which places it has and which it has not, says a place out of reach was not searched rather than that it is empty, and asks me for it.
- AC-388e: the agent starts work only in the places the conversation holds, and says how to add one when asked for another.

---

## Seeing the agents' work (added 2026-10-27)

Written from the finished code at the close of the unit *seeing the agents' work*. People direct agents in Agenthix, and must be able to see what the agents made — a report, a chart, a data file, a change to a codebase — without leaving it. A file opens read-only and in place wherever it is named; the page that coordinates the agents never carries the file's bytes (US-397, in [`cross-cutting.md`](cross-cutting.md)); and what the fleet admin sees of the machine that carries them is US-396, in [`console.md`](console.md).

### US-390 — Open what an agent made, where I am

As a member, I want to open any file an agent produced, in place and read-only, drawn the way it should be read, so that I can see the work without downloading it or leaving Agenthix.

**Acceptance criteria:**
- AC-390a: I open a file from a project's or my own Files, a workspace, an artefact, a knowledge page, a task, a link or a chip, and see which file it is, where it lives, its size and what kind it is.
- AC-390b: Markdown reads as a page, plain text and code as text (code highlighted, its language named), JSON as a tree and as text, a CSV file as a table I can sort, an image as an image and a PDF as a PDF; a kind that cannot be drawn says so and offers Download.
- AC-390c: a file too large to show in full shows its start and says so; text that is not text, a file that changed while I was looking (I can open the new version) and a file that is gone are each said in words.
- AC-390d: when a file cannot be reached I am told why — the machine's relay is not answering, or the machine is not — naming them, and can try again; the page does not load forever.
- AC-390e: someone who may not see a place gets what they would for a place that does not exist, and never a file's name.

### US-391 — Download any file, and attach one to a task

As a member, I want to download any file I can reach, whatever its kind or size, and to attach a file to a task, so that nothing an agent made is out of my reach and I can give an agent my own.

**Acceptance criteria:**
- AC-391a: Download is offered for every file I can reach, of any kind and any size, and gives the file as it is.
- AC-391b: I attach a file of up to 10 MB to a task; a larger one is refused at once, telling me the limit before anything is sent.

### US-392 — See pictures and files where they are written

As a member, I want the images in the text I read — a file, a knowledge page, a task's description and comments, an agent's reply — drawn where they are written, and a link to another file to show what it is, so that a report reads as the report it is.

**Acceptance criteria:**
- AC-392a: an image a text names — in its own folder, in the place's other folders, or a task's own attachment — is drawn there; one that is not there, or that I may not see, shows as a broken image with its name and reveals nothing.
- AC-392b: an image on another website is not asked for until I click *Load*, so opening a page never tells another website that I am reading it.
- AC-392c: a link to a file alone on its line shows a card with what the file is and opens it; inside a sentence it is a chip.
- AC-392d: nothing in a file can run: only an image, with its address, text, width and height, is drawn inside a text, and every other tag stays text.

### US-393 — Reach a file from wherever it is named

As a member, I want each file to have one link that opens it in place, and files, folders and tasks that are named in a conversation to be chips I can click, so that I can follow an agent's words to the work and point an agent to a file myself.

**Acceptance criteria:**
- AC-393a: *Copy link* gives the file's one address — the place's own, with the tool and the file — which opens it in place for anyone who may see the place and never names a machine or a ticket; a file that is gone says so and where it was.
- AC-393b: a file, folder, task or attachment an agent names, or a link pasted into a message, is a chip with its kind, status or title; a task I may not see stays plain text; a file that is gone is struck through.
- AC-393c: a chip opens the file beside the conversation, in the frame; a link to another place goes to that place.
- AC-393d: *Mention* puts a file in my message as a chip where I am typing, one Backspace removes it whole, and a path I type or paste becomes a chip; what is sent is the text with the paths written out.
- AC-393e: typing `@` offers the files of the conversation's places by name, narrowed as I type, which I choose with the keyboard or a click; Escape closes it and leaves my text.
- AC-393f: agents are told how to name files and tasks, and what they attach comes back with the name that makes it a chip.

### US-394 — See a task's files beside the task

As a member, I want a task's attachments and the files its runs worked on to open beside the task, so that I find the result where I asked for the work.

**Acceptance criteria:**
- AC-394a: a task's attachment opens beside the task (covering it, with a way back, on a narrow screen) and still downloads.
- AC-394b: the folder the task's runs work in is listed under its attachments, and I step into its folders and open its files.
- AC-394c: a task's file has a link that names the project, the task and the file, which opens the task and the file together; someone who cannot see the project is told it is not found.
- AC-394d: a file in a task's own text opens beside the task, and a file of the place opens in its own tool.

### US-395 — See where a workspace stands in git

As a member, I want to see a workspace's branch, whether it has uncommitted changes and its last commit, so that I know where the agents left it without asking.

**Acceptance criteria:**
- AC-395a: above a workspace's files and my project's `files/` one line shows the branch (or the commit checked out), clean or how many files changed, the last commit and how long ago, and a merge or rebase left stopped halfway; a folder that is not a repository shows no line.
- AC-395b: reading never runs anything a repository is set up to run and never gets in the way of an agent's own commit.

---

## The Library, skills and the asset layer

### US-398 — Find and add skills and other assets in the Library

As a member, I want one place that lists everything installed for the organisation, and a plain way to add more, so that I can see what my agents can be given and bring in what is missing.

**Acceptance criteria:**
- AC-398a: the Library, after Agents in the sidebar, lists every installed skill, agent template, board template and team template in one searched view that I narrow by type and by state; each row says what it is, who signed it or that it was made here, who has it and what state it is in, and its whole row opens the asset's page.
- AC-398b: an administrator adds a skill from Agenthix's shelf, from an upload (a ZIP or a folder, with its signature file if there is one) or from a link, beside *New skill*; the shelf marks what the organisation already has and narrows by what a skill is suited to.
- AC-398c: before anything is installed I am told what comes with it: a template's role skills, the ones I already have and the ones that are newer.
- AC-398d: an asset is installed once for the organisation however many agents have it, and installing the same version again changes nothing.
- AC-398e: a link must be an https address on the public internet; anything else is refused in words that do not say why.

### US-399 — Know who signed what I install

As an administrator, I want to be told who published an asset and whether it was changed on the way, so that I decide what to trust.

**Acceptance criteria:**
- AC-399a: I am told one of four things before installing: signed by someone I trust, signed by someone new (and I may trust them, install once or cancel), not signed (installable only after I say I have read it, if the organisation allows it), or changed after it was signed (refused, with no way round).
- AC-399b: the publisher is who signed, never what the package says about itself; Agenthix's name belongs to Agenthix alone; the same name from a different signer is a different asset, never an update.
- AC-399c: I record the publishers the organisation trusts exactly, a release workflow of a repository, a key or a person, and remove them; Agenthix is always on the list.
- AC-399d: I choose whether unsigned assets are allowed or never, and who may install from outside.

### US-400 — Update, roll back and remove what is installed

As an administrator or Library maintainer, I want to move an installed asset between versions on purpose and take one out knowing what depends on it, so that agents use the version I chose.

**Acceptance criteria:**
- AC-400a: an update is offered only for a newer version signed by the same publisher, and shows what changed.
- AC-400b: I roll back, or install any version on purpose, with a reason that the history keeps; a version its publisher withdrew warns me first, naming why.
- AC-400c: I can skip a version, or dismiss news about an original, and am not asked again until a later one is out.
- AC-400d: removing an asset names the agents that have it, or what was made from a template, and asks first; only administrators remove.

### US-401 — Write and publish a skill

As a member, I want to draft a skill, see exactly what changed and publish it with a note, so that agents get a version someone chose.

**Acceptance criteria:**
- AC-401a: *New skill* asks for a name and a description, checks the name as I type and opens an editor on a draft that no agent sees; the draft is shared by everyone who may edit it and saves itself.
- AC-401b: the editor shows the skill's files with a marker for each change, lets me view, edit and compare each file, and checks the skill against the Agent Skills rules as I edit.
- AC-401c: *Publish* shows every changed file, asks for a note, makes the next version and publishes only the draft I saw.
- AC-401d: editing a skill another publisher signed makes the organisation's own copy and sets the original aside, one click to go back; the two are one entry in the Library.
- AC-401e: a copy credits what it was based on, and a line is shown as verified only when HQ recorded it.
- AC-401f: I can ask an agent to edit, and am told which agent will answer and where before anything is sent.

### US-402 — Look after the Library together

As an administrator, I want to name the people who look after the Library and say what everyone may do, so that skills are kept right without everyone being an administrator.

**Acceptance criteria:**
- AC-402a: I name Library maintainers, who create, edit and publish every Library asset, update, roll back and review proposals; installing from outside, removing, choosing agents, trust and naming maintainers stay with administrators; I am shown what maintainers reach before anyone is named.
- AC-402b: a project's administrators publish its skills, its members edit drafts and add skills, and viewers read; an organisation administrator outside the project acts nothing there.
- AC-402c: *Library and skills* in Settings holds trusted publishers, unsigned assets, who may install, Library maintainers, skills found in files, personal skills outside Your space and the built-in switches.

### US-403 — See and choose what each agent has

As an administrator, I want to see every skill an agent will use and say which agents have which, so that agents have what they need and no more.

**Acceptance criteria:**
- AC-403a: an agent's page lists everything it will see, grouped by why it has it, with what was set aside and why.
- AC-403b: an administrator adds a skill to chosen agents or every agent and removes one from an agent; members read what they can see.
- AC-403c: the page estimates what the listing costs each request and warns when it grows past about 20 skills or 4,000 tokens.
- AC-403d: when one skill comes from two places, the organisation's installed one wins over the project's, and the project's over the person's; what was set aside is shown with the reason.

### US-404 — Decide which skills found in files run

As a project administrator, I want to see the skills agents find in a place's files and switch them on or off, so that nothing reaches an agent without someone choosing it.

**Acceptance criteria:**
- AC-404a: a place's Skills page lists the skills found in the place, for one agent and in each workspace's repository, with their version and state, and *All on* and *All off* for the page and each group.
- AC-404b: the default for skills found in files is *Off by default*, *On by default* or *Never*, a place only ever stricter than the organisation; a switch holds for the files as they were switched on and goes off when they change, and says why.
- AC-404c: publishing a skill found in files asks for a note and gives it a version; a change made outside the editor shows what changed with *Publish* or *Put back*; rolling back asks why and publishes the older files as the next version.
- AC-404d: *Add to this place* copies an installed skill in, offering a newer version later; *Remove* deletes a place's skill; a workspace repository's skill can only be switched.
- AC-404e: members edit and add, administrators publish and switch, viewers read; in Your space the person does everything.

### US-405 — Keep my own skills with me

As a member, I want the skills I write in Your space to follow me into my own conversations, so that I do not copy them into every project.

**Acceptance criteria:**
- AC-405a: a skill I published in Your space reaches my own conversations everywhere, projects included, at the version I published.
- AC-405b: it reaches no one else's run, no task and no scheduled run, and an administrator can turn it off for the organisation.

### US-406 — Pick a skill and see it used

As a member, I want to ask an agent for a skill by name and see afterwards that it used it, so that I know it did the work that way.

**Acceptance criteria:**
- AC-406a: typing `/` at the start of the message box offers the skills this conversation's agent has, grouped by where each comes from and narrowed as I type; my choice stays in the message as highlighted text and is sent as a choice, not parsed from the words.
- AC-406b: text I type that begins with `/` is plain text for the agent; the runtime's own commands are never reached.
- AC-406c: the work shows *Used the skill* with its name and opens it beside the conversation at the version the run used, for whoever may see it.
- AC-406d: a skill's page says when it was last used and by which agent.

### US-407 — Review what agents propose

As a member, I want an agent that learns a good routine to propose it as a skill, and a person to decide, so that no agent changes what other agents are told.

**Acceptance criteria:**
- AC-407a: an agent proposes a skill rather than writing one; from my own conversation, where I may edit, it becomes my draft with *Open draft* and *Publish* on its card, and from anywhere else it is a proposal.
- AC-407b: proposals reach the people who review their level, counted on the Overview, in the Library and on a project's Skills page; they accept, edit then accept, or reject with a note, and the agent is told the outcome.
- AC-407c: an agent's request to publish, roll back, switch on or install is a card for the person it acts for, shows what would change, and runs only if that person approves and still holds the right.

### US-408 — Use ready-made templates

As an administrator, I want agent, board and team templates to be installed, checked and kept up to date like skills, so that I can make agents and teams from them.

**Acceptance criteria:**
- AC-408a: templates ship with HQ and install, update and are removed through the same asset layer, each carrying every skill it needs, built from one source.
- AC-408b: from a template I create an agent, or use a team template through its review.
- AC-408c: an agent can be exported as an agent template package, and installed again in the Library.
- AC-408d: Kernel's own skills ship with HQ and are Kernel's alone.

### US-409 — Rely on the built-in skills

As an administrator, I want a small set of skills every agent has, so that agents work well in Agenthix from the first conversation.

**Acceptance criteria:**
- AC-409a: working with git and creating a skill are built in and on for every agent, git only in a run that works in a repository; I can switch a built-in off and on again, the switch holds across upgrades, and members read the list.

---

## Code work on branches, and live previews (added 2026-11-02)

### US-410 — Let every piece of code work run on its own branch

As a developer, I want every task and conversation in a code workspace to work on a branch of its own, in a working copy of its own, so that many can run at once on one workspace without getting in each other's way.

**Acceptance criteria:**
- AC-410a: a task given a code workspace, or any conversation whose work the agent starts in one, works on its own branch (one per conversation and workspace; never for a project's Viewer), named from the work, in a working copy that its later runs keep; whether work is code work is decided from the workspace's folder, never by an agent.
- AC-410b: every commit reaches the workspace's repository: at once with the agent's commit tool, while the run goes when the agent uses its own `git`, and at the end of a run, which commits anything left as *Work in progress*; the agent can bring `main` into its branch.
- AC-410c: agents read the workspace's own folder but never write it, nothing an agent writes in a copy (a Git hook, setting, filter or link) runs or is followed on the site, and only a merge, a restore, turning Git on or a pull from GitHub moves `main`.
- AC-410d: a run on a branch is told its branch, how far behind `main` it is, the other branches and who works on them, and which tools it has for Git and for the live preview. *(The live-preview part is behind the `livePreview` flag, at experimental, so not in the release.)*
- AC-410e: the lead is told the place's workspaces and which are code workspaces, and names one when it makes a task.
- AC-410f: a Member or Admin renames a branch, and deletes an unmerged branch whose work is over, told how many commits are lost; removing a workspace lists its branches first.

### US-411 — Turn Git on for a workspace

As a member, I want to make a plain workspace a Git repository with one confirmation, so that its work can go on branches.

**Acceptance criteria:**
- AC-411a: the confirmation says what happens; the files are recorded as the first version, by me, with a standard `.gitignore` when there is none, and files over 50 MB are left out and named.
- AC-411b: a workspace without Git shows its files only, with *Turn Git on* where Live preview and Git would be. *(The live-preview part is behind the `livePreview` flag, at experimental, so not in the release.)*

### US-412 — Review a branch in the workspace view

As a developer, I want a read-only view of a workspace that shows a branch's files and its changes, beside HQ's chat, so that I can review the work as in a light IDE.

**Acceptance criteria:**
- AC-412a: opening a workspace fills the page beside the app's rail, without the project's menu, with a way back to the project and a switcher of the project's workspaces, most recently opened first.
- AC-412b: the branch select lists `main` first, then each branch with whose it is, what works on it, how far ahead and behind it is, and whether it has a live preview.
- AC-412c: Files shows the branch's tree with each changed file marked and opens a file read-only; Git lists the changed files and shows each one's changes against `main`; nothing in the view edits a file.
- AC-412d: the conversation beside the view is the branch's: a task's thread for a task's branch, the conversation for a conversation's; on `main`, *New conversation* starts one on a branch of its own.
- AC-412e: a link opens the view at a branch, a section and a file, and the view remembers where I was, per workspace.
- AC-412f: on a laptop, a tablet and a phone the view folds so that the conversation and the middle stay usable.

### US-413 — Merge a branch into main

As a member, I want to take a branch's work into `main` as one version, even while its agent is still working, so that `main` holds finished pieces of work.

**Acceptance criteria:**
- AC-413a: *Merge into main* shows the changed files, a summary from the work and the version it goes in as; the branch goes in as one version and, with no agent working on it, closes.
- AC-413b: while an agent works on the branch, a merge takes what is committed so far, and the next merge brings what came after without clashing with itself.
- AC-413c: a clash merges nothing and names the files and the versions of `main` that changed them; a dialog made against an older `main` changes nothing.
- AC-413d: after a clash, the branch's agent is asked at once, on my behalf, to bring the branch up to date.
- AC-413e: an agent merges only when I press *Merge* on the card it puts in the conversation, and as me.
- AC-413f: with the workspace connected to GitHub, versions pushed there arrive first, and `main` is pushed after.

### US-414 — Keep main's versions, restore one, and deploy main

As a member, I want to see `main`'s versions, restore any of them and deploy `main` with an approved workflow, so that nothing is lost and deploying stays the organisation's choice.

**Acceptance criteria:**
- AC-414a: `main` lists its versions newest first, each with its number, summary, who merged it, how many files and when.
- AC-414b: *Restore* makes a new version with exactly the files of the one restored, deleting nothing from the history.
- AC-414c: *Deploy…* lists the place's approved workflows that are on and runs the one chosen; with none, it says how to add one.

### US-415 — Read a code workspace as a Viewer, and change nothing

As a viewer, I want to see a code workspace's files, branches, changes, versions and live previews, so that I can follow the work without being able to change it.

**Acceptance criteria:**
- AC-415a: I see everything in the workspace view, and every action — merge, restore, delete a branch, start or stop a live preview, reload, start an app, message the agent, *New conversation* — is greyed with the reason or absent, and refused by the server. *(The live-preview part is behind the `livePreview` flag, at experimental, so not in the release.)*

> **Behind the `livePreview` flag, at experimental, so not in the release:** US-416 to US-421 (the live preview itself). The product does not keep these promises while the flag is off. The QA model has no mark for a promise outside the release, so this note stands in for one. What stays on with the flag off in US-418: install scripts are off in every agent command, and a blocked package outside a live preview gets a card in the task's thread.

### US-416 — See the app running beside the conversation

As a developer, I want to open a live preview of any branch and see the app running beside the agent's conversation, so that I can try it while the agent works.

**Acceptance criteria:**
- AC-416a: *Live preview* on a branch starts one on the branch's copy, making a copy when the branch has none, on a site HQ picks, saying where and how full it is; a second person sees the same one.
- AC-416b: the app shows in the middle with the live preview's own bar fixed at the top — its state, *Reload*, the address, *New tab*, *Stop*, the site and how full it is — and the conversation is never covered, on a tablet or a phone either.
- AC-416c: the app reloads when the agent asks, by itself with *Auto* when the branch gets commits, or with *Reload*; the person who started it or a project Admin stops it.
- AC-416d: each app has an address of its own that cannot be guessed, a separate origin, opened only with a single-use ticket HQ signs for one person and one app, and a short-lived cookie.

### US-417 — Have the agent run the app, or start it myself

As a developer, I want the branch's agent to start, stop and reload the app, and to start a known app myself, so that a live preview shows the app even where no agent works.

**Acceptance criteria:**
- AC-417a: every run on a branch has the app tools, which act only on its own branch's live preview on its site; `start_app` on a branch with none opens one first, with the rules a person's start has; nobody is asked to allow them.
- AC-417b: the strip offers *Start* for each app known on the workspace, as it was last started.
- AC-417c: the lead can offer a live preview of a task's branch with a card that opens it. *(The live-preview part is behind the `livePreview` flag, at experimental, so not in the release.)*
- AC-417d: an app that listens only on `localhost` works without change.
- AC-417e: `main`'s live preview runs from a copy of its own that follows `main` as it moves.

### US-418 — Decide which services and install scripts run

As a member, I want services and package install scripts to run only after a person's yes, named and explained, so that an agent's choice of package cannot run code on the site unasked.

**Acceptance criteria:**
- AC-418a: services declared in `.agents/services.yaml` run beside the app on an internal network of their own; a new or changed one waits for a yes in HQ, which holds across a site restart.
- AC-418b: install scripts are off in every agent command; the agent's `install_packages` runs the scripts of packages that pass the rule; a blocked one is asked about by name, on the strip or with a card in the branch's thread, and a yes lets that one version run on that branch.
- AC-418c: an organisation admin names the organisation's own npm scopes, whose packages are trusted.

### US-419 — Give a live preview its secrets through an approved workflow

As a member, I want an app that needs secrets to get them only through a workflow a person approved, so that the agent never holds them.

**Acceptance criteria:**
- AC-419a: *Start live preview* and *Reload live preview* workflows that the place approved and switched on are offered, run aimed at the live preview, and hand the secrets they name to the app's own container, never to the agent's container or into the copy.
- AC-419b: what the agent reads from a live preview that holds secrets is masked.

### US-420 — Know where a live preview runs, and why it stopped

As a developer, I want to see which site runs my live preview and why it stopped, so that I can start it again, stop another, or pick another site.

**Acceptance criteria:**
- AC-420a: HQ picks the workspace's own site when it allows live previews and has room, else the allowed site with the most room, and I may pick another allowed site.
- AC-420b: on a full site I see the open ones, whose and which branch, and can stop one of mine; on another site the branch goes there as a bundle, its runs follow it there, and its commits come back.
- AC-420c: one unused for its site's idle time stops, and stopping never loses work.
- AC-420d: a stopped or paused live preview says why; after the guard pauses one, a person resumes it.
- AC-420e: after a site restart, live previews come back with fresh containers, and HQ shows their apps as stopped.

### US-421 — Trust that an app an agent wrote is held apart

As an organisation admin, I want a live preview's app to reach only its own copy, its services and the public internet, so that code an agent wrote cannot reach the organisation's other data or its network.

**Acceptance criteria:**
- AC-421a: a live preview's container binds only the branch's copy, with no added capability, no Docker socket, a read-only root and no IPv6, on a network of its own, and the machine's firewall closes private addresses and the machine's own address to it.
- AC-421b: a guard checks that the container matches its template and that nothing appears that the live preview did not start, and stops or pauses it, saying why.
- AC-421c: the relay lets through only the app's own requests, from its own page or the person's own navigation, and cuts a person or an app off as soon as HQ says so.

## Features: trying what is not finished (added 2026-11-03)

Written at the close of the unit *live preview*, from the finished code. A feature that is not ready ships behind a flag with a stage: experimental (being tried), preview (waiting on something outside it), beta (usable, unfinished) or released (done, and switchable off for the rest of the minor release it went live in). What it does for everyone, and for the maintainers, is under *Features that are not on* in [`cross-cutting.md`](cross-cutting.md).

### US-424 — Try a feature in beta, or switch off one that is new

As an organisation admin, I want one screen where I switch a feature in beta on for the organisation, or switch off one that is new in this release, so that we try what is unfinished only if we choose to, and can stop a new feature at once if it causes trouble.

**Acceptance criteria:**
- AC-424a: *Features*, in the organisation's settings, lists the features in beta and those new in this release, each with what it is, a *Beta* or *New in this release* label and a switch, and says what *beta* means: usable, unfinished, may change, and can be switched off again.
- AC-424b: switching one on applies to the whole organisation and no person opts in for themself; switching it off hides the feature and makes it refuse again, and what it stored is kept for when it is switched back on.
- AC-424c: with no feature to list, the screen says there is nothing to try.
- AC-424d: beside each I see who last switched it and when, or that it is on or off by default.
- AC-424e: only an organisation admin switches a feature; a member is told who to ask, and a refusal says what is wrong and that nothing was changed.

### US-425 — See and switch every feature while building

As a developer of Agenthix, I want to see every feature by stage and switch any of them in my own copy of HQ, so that I can build an experiment without it reaching anyone else, and see the product as it ships.

**Acceptance criteria:**
- AC-425a: in a development build, *Features* lists every flag grouped by stage and explains all four stages.
- AC-425b: a switch is kept in my own HQ's database, so nobody else's setup and no test run changes; in production only a beta can be switched on and only a feature new in this release switched off.
- AC-425c: an experimental feature is off until I switch it on, a preview or beta feature is on until I switch it off, and in production an experimental feature cannot be switched on.

## Tasks, runs, boards and routines (added 2026-11-08)

Written at the close of the unit *tasks, runs, boards and routines* (adr-0174 to adr-0177), from the finished code. The stories this unit replaced are retired where they stood (US-028 to US-039, US-046, US-047, US-187 to US-189, US-192, US-205, US-206, US-220, US-221, US-223, US-261, US-262), and the criteria it reworded were changed in place on 2026-11-08.

### US-430 — Plan work as tasks with a type and a column

As a member, I want every task to have a type and a column, so that a project's planning says where each piece of work is and whether it is done.

**Acceptance criteria:**
- AC-430a: every project has the task types Task and Epic, each with four columns, one per state — Backlog, To do, In progress, Done — and neither can be deleted.
- AC-430b: a task is in one column of its type, and its state is the state of that column; moving it to a column sets the state, and setting the state puts it on that state's default column.
- AC-430c: a new task starts in Backlog, last in the project's order; one added from a board column starts in that column.
- AC-430d: changing a task's type keeps its state.
- AC-430e: making, editing or moving a task never starts work, and a run ending does not move the task.

---

### US-431 — Put work in one order

As a member, I want one order for the project's tasks, so that every board and list agrees on what comes next.

**Acceptance criteria:**
- AC-431a: dragging a task on any board or on the Tasks list changes its place in the project's one order, which is never shown as a number.
- AC-431b: Backlog is the first state, for work wanted and not yet committed to; moving a task to To do is deciding to do it.
- AC-431c: the order is the one an agent's Start follows.

---

### US-432 — Group tasks under an epic

As a member, I want epics that group tasks toward one goal, so that I can see how far each goal has come.

**Acceptance criteria:**
- AC-432a: Epic is a type in every project; an epic is never run.
- AC-432b: an epic may have an agent that manages it, and a task with an agent can become an epic.
- AC-432c: the Tasks list shows each epic with its tasks by state.

---

### US-433 — Define my project's task types and columns

As a member, I want my own task types, each with its own columns, so that the project's steps are named in its own words.

**Acceptance criteria:**
- AC-433a: I add a task type with columns, each sitting in one task state; every state keeps at least one column and exactly one default.
- AC-433b: I rename, recolour, reorder and remove columns, and move a column to another state, being told which tasks that changes.
- AC-433c: a type with open tasks cannot be archived, and only a type nothing has used can be deleted; Task and Epic never.

---

### US-434 — Add fields of my own

As a member, I want custom fields on my tasks, so that I can look at the same work another way without changing its state.

**Acceptance criteria:**
- AC-434a: I make a single-select field with options; a task has at most one option in each, and setting one never changes its state.
- AC-434b: archiving a field hides it and keeps its values; deleting it removes its values and its boards, never a task.

---

### US-435 — Look at the same work on a board

As a member, I want boards that show my tasks in different ways, so that I see the work the way I am thinking about it.

**Acceptance criteria:**
- AC-435a: a board is a saved view of the project's tasks and owns none; I see a type's columns, the four task states across every type, the execution states, or a custom field's options.
- AC-435b: I filter a board to a sprint, an epic, an agent or a type, and the filter only hides cards.
- AC-435c: dragging a card sets what that board sets — a column, a state or a field's value — and its place in the order; the execution board is not dragged.
- AC-435d: I save a view as a board with a name, rename it, change its filter, copy it and delete it, and deleting a board never deletes a task.
- AC-435e: each column shows how many tasks it holds, and the Boards list shows each board's spread and how many cards need me.

---

### US-436 — Plan in sprints

As a member, I want the project's sprints, so that I plan a time box and see it through.

**Acceptance criteria:**
- AC-436a: the project has one series of sprints, started once with a length, and the next two can be planned ahead.
- AC-436b: planning a Backlog task into a sprint moves it to To do.
- AC-436c: a sprint is finished only by someone finishing it, who chooses where the unfinished tasks go; done tasks stay recorded in it, and a sprint past its last day stays current, shown as overdue.
- AC-436d: a Viewer of the project can finish and rename nothing.

---

### US-437 — Know what an agent is doing with a task

As a member, I want to see what an agent is doing with a task apart from where the task is planned, so that I can tell a task that is waiting from one that has failed.

**Acceptance criteria:**
- AC-437a: a task is Not started, Waiting, Running, Needs you, Failed or Finished, set by the system from its latest run, and never changes its state or column.
- AC-437b: Needs you counts an okay or an answer asked for, a failed run of open work and a routine run that asks or fails, the same everywhere.
- AC-437c: the agent's avatar shows the run as a ring wherever a task has an agent assigned.

---

### US-438 — Start work only when I ask

As a member, I want work to start only because someone started it, so that nothing runs that I did not expect.

**Acceptance criteria:**
- AC-438a: nothing starts because of a column, a board, a switch or the time passing; work starts by a person's Run or Run at…, an agent's Start or Start all agents, or an agent starting a task with its tool.
- AC-438b: Run starts one task with its assigned agent; a task with no agent, or an epic, cannot be run.
- AC-438c: Run at… starts a task once at the time I choose, and until then it is Waiting.
- AC-438d: I run a failed task again or dismiss its failed run.

---

### US-439 — Start and stop an agent's line from the Workroom

As a member, I want each agent's work as a card with Start and Stop, so that I decide what runs and can stop it.

**Acceptance criteria:**
- AC-439a: Start lists the agent's ready tasks in order, I confirm with ticks, and they are put in the agent's line on my behalf.
- AC-439b: Start all agents does the same for every agent at once.
- AC-439c: an agent takes its tasks one at a time in order, and a failed run does not hold the line: it waits under Needs you and the agent takes the next task.
- AC-439d: Stop takes an agent's waiting tasks out of line, back to Not started, and stops the run going.
- AC-439e: Stop every run does so for the whole project; nothing more starts until someone runs it.
- AC-439f: the Workroom shows each agent at work, why each task waits, what needs me as bars and what ran today with its cost; a Viewer reads it with every control greyed.

---

### US-440 — See what agents did

As a member, I want the history of runs, so that I can see what happened, who started it and what it cost.

**Acceptance criteria:**
- AC-440a: Workrooms, in the navigation, shows every project's Workroom on one page, with my own runs.
- AC-440b: a project's Runs, and my own Runs, list runs with tabs by state, search and filters, a page at a time.
- AC-440c: a run has its own page with its tool calls, model, site, time against its limit, tokens and cost.

---

### US-441 — Repeat a run on a schedule

As a member, I want a routine, so that an agent does the same thing every weekday at nine without my asking.

**Acceptance criteria:**
- AC-441a: a routine is a schedule, an agent and instructions, in a project or my own space, and is on or off; each firing is one run and makes no task.
- AC-441b: I build the schedule from presets in words or type any cron rule under Advanced, with a timezone, read back in plain words with the next three run times; it cannot fire more often than every 5 minutes.
- AC-441c: Run now starts one run for me at once without changing when the routine next fires.
- AC-441d: its runs are listed like any other run, each with its cost.

---

### US-442 — Know whose behalf a routine runs on

As a member, I want to know who a routine's runs are for, so that its work is never done for nobody.

**Acceptance criteria:**
- AC-442a: a routine runs on behalf of the last person who changed it, switching it on or off included; Run now is a run for the person who pressed it and changes nothing about whose routine it is.
- AC-442b: saving a change that moves whose behalf it runs on asks me first.
- AC-442c: a firing that comes while the routine's last run is still going is skipped and listed.
- AC-442d: a firing that cannot start is listed as failed with why; a routine whose person lost access to the project is switched off with the reason.
- AC-442e: three failures in a row tell the routine's person.

---

### US-443 — Share my task types and fields

As a member, I want to share my project's task types and fields as a task template, so that another project starts from them.

**Acceptance criteria:**
- AC-443a: adding a task template to a project adds its types and fields and leaves alone any of the same name, and says so before I confirm.
- AC-443b: a Library maintainer publishes a task template; I propose mine, and a maintainer reviews it.

---

### US-444 — Ask an agent to arrange and start work

As a member, I want to ask an agent to arrange my tasks and start work, so that I can do it by talking.

**Acceptance criteria:**
- AC-444a: an agent has tools to list, make and change tasks, to read and open views and finish a sprint, to run a task and to make and change a routine, described in the words of types, columns and states.
- AC-444b: an agent starts a task only in a run I started, in its project, and only as deep as the organisation allows.
- AC-444c: an agent makes a routine or sets a start time only when I asked it and only where the project lets agents do so; it does so on my behalf.

---

### US-445 — See a project's tasks by what they are

As a member, I want the project's tasks counted by state, so that I know what is committed to, under way and late.

**Acceptance criteria:**
- AC-445a: the Tasks list counts by task state, Late and No agent — never by run — sorted by the project's order, with each epic and its tasks by state.
