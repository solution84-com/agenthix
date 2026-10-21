---
created: 2026-10-18
description: How the desktop shell is built — the shell drawn once above the pages, a place's sections in a left panel that drills into the place, the docked conversation, and the narrower widths — as a layout change that leaves page content, the server API and the conversation components as they are.
---

# Implementation Plan · Desktop shell

## Goal

Build the desktop shell the [spec](spec.md) describes: one conversation docked beside the work on every page, kept
in the address, and a place's sections in the left panel, which drills into the place (built first as tabs in phase 3, replaced
in phase 7).

**In scope:** making the new conversations the only ones — the chats from before removed (task 1.1), the
`conversations` flag and the old chat path for a person's or a project's conversations removed; the shell drawn once above the pages; a
place's sections in the drilled-in left panel (first as tabs), for a project, your space and an agent's page, with your space's own entry; the dock with
`?c=`, 🕘, ＋ and the place chip, expand and collapse; the medium and narrow widths; the user guide and the shell's
own documentation brought up to date.

**Out of scope:**

- A list of conversations across every place: it needs a new server read, which the ground rule forbids here. It is
  a follow-up, after this lands.
- Talking to a conversation's worker from its run: a feature with design questions of its own.
- Choosing the order of a place's sections: it needs storage, and nobody has asked for it yet.
- Creating more personal projects; the phone app.

## Approach

**The ground rule shapes everything: this is a layout change.** No page content, server operation or conversation
component changes. Every piece below is either the shell, or existing components placed somewhere new and given the
props they already take. Anything that turns out to need more is stopped and put to the owner before it is built.

**The shell is drawn once, above the routes.** Today each page renders `AppShell`, so the navigation, the bar and
anything in them are rebuilt on every page change. The frame moves into the app's root, around `<Outlet />`, with a
small context the pages write to. `AppShell` keeps its name and props, so no page file changes: instead of drawing
the frame it publishes its breadcrumbs, its bar's right-hand slot and its mobile header to that context, and renders
only its children. `AppLayout`, `ProjectLayout` and `PlaceScreen` keep working through it. The voice bar, the
notices and the Notifications and Runs panels move with the frame. This phase changes nothing a person can see, which
is what makes it safe to land alone and the seam the rest builds on.

**A place's sections are tabs, using the address the tools already have.** A place's tool is already in the address
(`?tool=tasks`, `usePlaceUrl`), and every tool already renders as a view of its own (`PlaceTool.render`). The tabs
are a row the place screen draws above the canvas from the place's existing tool list (`teamRows`, `toolGroups`,
`linkedTools`), in the order the spec's §7 gives, with Overview (today's `PlaceOverview`) first and Conversations
second. The canvas renders the chosen tool at full width. A place's own address (`/projects/AGX`) opens Overview, as
spec §6 says; its conversation list is `?tool=conversations`. The Chat page (`/chat`) stays the list of your space's
conversations. The row measures
what fits and folds the rest into ⋯. The Tools panel, `LayoutControl` and the layout preference's use go; the
preference's server operations are left in place, unused, rather than changed. Your space gets an entry and an
address of its own, drawn from the same `useChatPlace`, and an agent's page uses the same tab row. Phase 7 replaced
the row with the left panel drilling into the place, on the same `?tool=` addresses and tool lists.

**The open conversation belongs to the shell, and the address mirrors it.** Links all over hq drop the query string,
so the dock cannot rely on `?c=` surviving navigation. The shell holds the open conversation as its own state,
writes `?c=` back onto every new location (with `replace`, so Back is unaffected), and reads it on load. It reads the
conversation addresses too: a `/t/` address reached from inside hq keeps the canvas where it was and only opens the
dock; one reached on a fresh load shows the conversation's place on its Conversations section. Either way it is replaced
by the `?c=` form. The dock renders the existing `ConversationThread` for an open conversation and the existing
`NewConversationBox` for a new one, with the place chip above the box handing it `home`, `projectId` and `basePath`.
Expanded, collapsed, the medium slide-over and the narrow pill are positions of the same mounted dock, never a
remount, so a streaming reply, its socket and unsent text survive every change.

**The new conversations become the only conversations, first.** They were built behind the `conversations` flag
(adr-0116), on in development and off in a production build. Nothing is released, so the flag goes (owner,
2026-10-18): the new conversations are always on, in core, hq and the site, and the old chat path for a person's or a
project's conversations goes with it. A task's session and a conversation's workers are harness sessions too and
stay as they are. Doing this first means every later phase builds one shell for one kind of conversation, with no
branch for a flag that is off.

**How the work is carried out.** Each phase runs as lanes from short briefs (`running-lanes`), each lane in its own
worktree on a branch cut from `feature/desktop-shell`, merged into it one at a time, rebased first. Lanes run the
typecheck and the unit tests for what they touch; the lead runs hq's integration and e2e suites, the guide recipes
and the cross-app suite after each merge, because they need the shared test databases and fixed ports. Phases run
in order; within a phase, lanes that own different files may run in parallel. The owner walks the work through after
phase 3 (tabs) and again after phase 5 (the dock at every width); findings are fixed in phase 6. The branch merges to
`main` once, at the close, with `--no-ff`, regrouped by feature first, and only with the owner's approval; nothing is
pushed without it.

## Decision records

| | Records |
|---|---|
| **Depends on** | adr-0096 (a conversation belongs to a place: the place chip only chooses a place before the first message) |
| **Implements** | adr-0128 (the open conversation is docked, and navigation never closes it) and adr-0129 (a place's sections are navigated in the left panel), both written at the close |
| **Revisits** | adr-0096 — its binding "the tools shown beside a conversation are its place's" no longer holds once the dock stays beside any page, and "the person's own space, shown as Chat" becomes *Your space* · adr-0121 — its lines about chats from before staying readable, removed by task 1.1 · adr-0116 — its lines about the `conversations` flag and chats from before; the rule itself, that an unready feature ships behind a flag, stands |

## Key decisions

| Decision | Why |
|---|---|
| The frame moves into the app's root; `AppShell` keeps its props and publishes them | The dock must stay mounted across pages, and no page file has to change |
| Editing each page to drop `AppShell` (decided against) | About 40 page files touched for no visible gain; publishing the same props keeps them as they are |
| The shell owns the open conversation and writes `?c=` onto each location | Links across hq drop the query string; teaching every link to carry `?c=` would change components across the app |
| A conversation's `/t/` addresses are kept and read by the shell | No list, box or link changes; from inside hq the canvas stays, from outside it shows the place (owner, Q5) |
| A place's sections use the existing `?tool=` address and tool list | Every former tool address keeps working, and each tool is already a view of its own |
| No reordering of a place's sections (owner, Q2a) | Ordering needs storage |
| The left panel drills into a place, and the breadcrumb's parts open lists (owner, after using both) | It keeps the person focused on the place they are in. Tabs across the canvas were built first and removed with the switch (phase 7) |
| The place chip sits outside `NewConversationBox` | The box already takes its place as props, so it stays as built (owner approved the chip, Q8) |
| The `conversations` flag is removed, and the old chat path with it, before the layout (owner) | Nothing is released; one kind of conversation means one shell with no flag-off branch |
| Keeping the dock behind the flag, or the whole shell (decided against) | Two layouts in the code until the flag went, for an install base of none |
| The layout preference's server operations stay, unused | Removing them is an API change; they can go with a later cleanup |
| The chats from before are removed first (owner, Q4) | Nothing released has any, and the dock opens only the new conversations |

## Work breakdown

6 phases. Each one rests on the one before: the shell must be drawn once before the dock can live in it, the tabs
give the dock's links and Conversations tab somewhere to land, and the narrower widths are positions of a dock that
must exist first. Phases 2 and 3 change no conversation behaviour, so they can be walked through and kept even if
the dock were held back.

### Phase 1 — The new conversations are the only conversations
**Delivers:** the `conversations` flag is gone and the new conversations are always on; no chat from before or old
chat path for a person's or a project's conversations remains; task sessions and workers are unchanged.
**Starts when:** —
**Execution plan:** none — lanes; 1.1 is built, the rest is one lane.

- [x] 1.1 Remove the chats from before: unlisted, unopenable, `continueFromBefore` gone (`589d5e6`)
- [x] 1.2 The guide's screenshot recipes no longer depend on a chat from before or on *Jump back in*
- [x] 1.3 The `conversations` flag removed from core, hq and the site: the new conversations always on
- [x] 1.4 The old chat path for a person's or a project's conversations removed, task sessions and workers kept
- [x] 1.5 Home's first suggestions and an agent page's box start a new conversation, not an old chat

### Phase 2 — The shell is drawn once
**Delivers:** the navigation, bar, notices, voice bar and panels are rendered once above the routes; every page looks
and behaves exactly as before.
**Starts when:** phase 1 is done.
**Execution plan:** none — lanes; one lane, the shape is set by the approach above.

- [x] 2.1 A shell context that pages publish their breadcrumbs, bar slot and mobile header to
- [x] 2.2 The frame rendered in the app's root around the routes
- [x] 2.3 `AppShell` publishes its props instead of drawing the frame; `AppLayout`, `ProjectLayout` and `PlaceScreen` unchanged in use
- [x] 2.4 The document title, nav drawer and collapse behave as before across navigation

### Phase 3 — A place's sections are tabs
**Delivers:** a project, your space and an agent's page show their sections as tabs that fold into ⋯; the Tools
panel and layout control are gone.
**Starts when:** phase 2 is done.
**Execution plan:** none — lanes; the tab row first, then the places on it.

- [x] 3.1 The tab row: Overview and Conversations first, then the place's tools in order, folding into ⋯ with a count
- [x] 3.2 The canvas renders the chosen tab at full width from `?tool=`
- [x] 3.3 A project on tabs, Members and Memory included
- [x] 3.4 Your space on tabs, with its own navigation entry and address
- [x] 3.5 An agent's page on tabs
- [x] 3.6 The Tools panel, `LayoutControl` and the small-screen place page retired
- [x] 3.7 💬 *Talk about <place>* in the bar

### Phase 4 — The docked conversation
**Delivers:** one conversation is docked beside every page, kept in the address, opened and started
as the spec says; a reply streams through navigation.
**Starts when:** phase 3 is done.
**Execution plan:** none — lanes; state and addresses first, then the dock's parts.

- [x] 4.1 The shell holds the open conversation and mirrors it to `?c=` on every location
- [x] 4.2 `/t/` addresses read by the shell: from inside, the canvas stays; from outside, the place's Conversations tab
- [x] 4.3 The dock renders `ConversationThread` with its title, place chip and buttons
- [x] 4.4 A place's Conversations tab and the Chat page open conversations into the dock
- [x] 4.5 ＋ and 💬 start a new conversation in the dock with `NewConversationBox`
- [x] 4.6 The place chip above the box, defaulting to the current place, changeable before the first message
- [x] 4.7 🕘: recent conversations of the current place, and *All conversations*
- [x] 4.8 Home's box opens its new conversation in the dock, Home staying in the canvas
- [x] 4.9 ⤢ expand over the canvas, dropping back to docked on any navigation
- [x] 4.10 › collapse to a rail with the agent, a work dot and approvals waiting; click or ⌘J reopens

### Phase 5 — Every width
**Delivers:** one model at every width: docked when wide, sliding over the canvas when medium, a pill when narrow;
resizing never loses the conversation, its scroll or unsent text.
**Starts when:** phase 4 is done.
**Execution plan:** none — lanes; one lane.

- [x] 5.1 Medium: the navigation as icons and the dock sliding over the canvas
- [x] 5.2 Narrow: the pill on every screen, the conversation full screen when tapped
- [x] 5.3 Moving between widths keeps the same mounted dock

### Phase 6 — Walkthrough and documents
**Delivers:** the owner has walked the shell through and accepted it, and the documents describe it.
**Starts when:** phase 5 is done.
**Execution plan:** none — a feedback loop, one finding at a time.

- [x] 6.1 The owner's walkthrough findings fixed (numbered as they are found)
- [x] 6.4 A new conversation as a draft in the dock: Cancel, and the list of places with search (walkthrough 2)
- [x] 6.2 The user guide updated for the dock, tabs and your space, with its screenshots
- [x] 6.3 hq's `app-layout` skill and the places concept describe the new shell

### Phase 7 — The drilled-in navigation
**Delivers:** the drilled-in left panel and the breadcrumb's lists, first beside the tabs behind a development-only
switch; then, with the owner's choice, the only navigation for a place.
**Starts when:** phase 6 is done and the navigation board is agreed.
**Execution plan:** none — lanes; one lane for the navigation and the switch, then one to remove what isn't chosen.

- [x] 7.1 A development-only switch, remembered in the browser, between tabs and the drilled-in panel
- [x] 7.2 The drilled-in panel for a project, your space and an agent's page, with group labels and counts
- [x] 7.3 ‹ and the main navigation over the panel, dismissible without moving
- [x] 7.4 The breadcrumb's parts open lists
- [x] 7.5 Collapsed and medium widths with a section icon each; the phone drawer and header
- [x] 7.6 The tabs and the switch removed: the drilled-in panel is a place's only navigation
- [x] 7.7 The user guide, its screenshots, hq's `app-layout` skill and the places concept describe the drilled-in panel
- [x] 7.8 Pinned as one row in the foot that never moves, and Organisation, Settings and Sign out in a menu behind your name
- [x] 7.9 The code the shell left unused removed: the layout preference and its column, the place-link query, the chats from before, the Runs screen's chat filter, "tab" names
- [x] 7.10 The dock talks to the conversation components through their props instead of workarounds

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 7 | The close's debt done in the unit (7.9, 7.10): server operations and a column removed, and additive props on the conversation components | The owner, 2026-10-18: "any debt that we can do now we need to do"; approved the component changes for the dock |
| 7 | Pinned moves to the foot as one row, and the foot's other links go into a menu behind your name (7.8) | The owner, 2026-10-18: a pin that moved when tapped left them disoriented |
| 7 | The owner kept the drilled-in panel; the tabs and the switch are removed (7.6, 7.7). Pinned scrolls with the sections; Overview stays as rows, cards being a later polish | The owner, 2026-10-18, after using both: the panel keeps them focused |
| 7 | Phase 7 added: the drilled-in navigation built beside the tabs behind a development-only switch, the owner to keep one before the close | The owner wanted to look at the navigation before closing (2026-10-18), and to try both first |
| 6 | Walkthrough 2 added the dock's resizing, remembered in the browser, and a fix to a reply that stopped streaming after a line in the middle of a turn (an approved change to the conversation thread's hook); task 6.4 is the draft | The owner's walkthrough 2 (W2-1, W2-2, W2-3) |
| 5 | Between 768 and 1023 px the navigation stays the ☰ drawer, as on a phone; icons start at 1024 px (spec §12) | The owner accepted it in walkthrough 2: hq's phone layout already begins there |
| 3 | Walkthrough 1: a place's header and Overview align left, Chat is the list with no sections, a workspace has a *‹ Workspaces* link. The tabs themselves were replaced in phase 7 | The owner's walkthrough 1 |
| 2 | None | — |
| 4 | A new conversation became a draft in the dock with Cancel, its area the list of places with search, replacing the chip above the box (spec §10) | The owner's walkthrough 2: ground the person in where the conversation happens, and let them go back |
| 1 | The `conversations` flag and the old chat path are removed (tasks 1.3–1.5), and the dock is not flagged | The owner, 2026-10-18: nothing is released, so the flag has no purpose |
| 1 | Task 1.1 was built before the unit existed, and its QA contract and concepts changes were made without the owner's approval | A process slip: it was dispatched without `starting-work`. The owner placed it in this unit on 2026-10-18; its document changes and open items go to the owner for review |

## Closing note

**2026-10-18. Accepted by the owner** after walkthroughs 1 and 2 and their use of both navigations.

- **Built:** the shell drawn once above the pages; one conversation docked beside the work, kept in `?c=`, with the
  draft, history, expand, collapse, resizing and its positions at every width; one kind of conversation, with the
  flag, the old chat path and the chats from before removed; a place's sections in a left panel that drills into the
  place, with *Go to*, the breadcrumb's lists and a foot that never moves. Phase 3's tabs were replaced in phase 7.
- **Open items:** closed in the unit — the code the shell left unused (7.9) and the dock's workarounds (7.10).
  Deferred, none critical and none blocking release: cross-app and e2e in CI, Vite reloads during e2e,
  the guide's diagnostics recipe (the owner: at release), dock polish, and two planned features held
  outside this repository (a reply's reasoning; Overview as cards). Comments added to five related issues; the
  issue for the conversations' feature flag closes with the merge.
- **QA:** the unit's stories and scenarios are written and their tests tagged. No QA audit ran at this close; the
  entries await the audit before release (the owner's call).
- **Decision records:** adr-0128 and adr-0129 written; dated notes on adr-0041, 0076, 0081, 0096, 0116, 0121 and
  0122–0127.

