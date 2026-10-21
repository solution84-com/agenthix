---
created: 2026-10-17
description: hq's desktop shell — the canvas for work, one conversation docked beside it that never closes by itself, and a place's sections in a left panel that drills into the place. A layout change only.
---

# Design Spec · Desktop shell: one conversation, docked

**Kind:** initiative · **Boards:** [`boards/pages.html`](boards/pages.html) (every page, the questions and their
answers) and [`boards/shell.html`](boards/shell.html) (the dock's flows), standalone, light and dark · **Builds on:**
the shell from the every-screen-reviewed unit, as built, and the conversational experience.

## Why

Today every place is its own screen. Chat (your space) or a project shows its conversation list or one
conversation, with the Tools panel beside it, and there is no docked conversation. Leaving a place leaves its
conversation. That followed from a conversation being bound to one storage boundary. Since the conversational experience, a conversation's
lead commissions work across boundaries, so the conversation no longer has to own the screen.

## The ground rule

**This is a layout change only.** Approved are the layout (one shell above the pages, the dock) and a place's
sections moving out of the Tools panel. No page's content changes, no server API changes, and no component
changes, above all the conversation interface (the thread, the message box, the pickers, the work bar), which stays
exactly as built. A change that turns out to be unavoidable is put to the owner first, one item at a time, with
why; it is never folded into the build. The one approved so far is the place chip (§10).

## Agreed

1. **The open conversation always stays**, wherever you go: other projects, Tasks, Settings, Home. Only the person
   changes it, never navigation.
2. **One open conversation, always in the dock** on the right, showing only that conversation: its title, a place
   chip (your space, a project or a task), and the buttons history 🕘, new ＋, expand ⤢ and collapse ›; then its
   messages, the work bar and the message box. The conversation is the existing `ConversationThread`, unchanged.
3. **The address carries both.** The page is the canvas; the open conversation is `?c=<id>` on whatever page you
   are on (`/?c=8f2c`, `/projects/AGX/tasks?c=8f2c`). Reload and Back restore both.
   - **A conversation's own addresses are kept** (`/chat/t/<id>`, `/projects/<key>/t/<id>`), so no list or link
     changes. The shell reads them: arriving **from outside** hq (a pasted link, a bookmark, an email), the canvas
     shows the conversation's place on its Conversations section; **from inside** hq (a row in a list, sending
     from a new-conversation box), the canvas stays where you were and only the dock changes. Either way the `/t/`
     address is replaced at once by the `?c=` form.
4. **Switching is a history icon:** 🕘 shows a short, flat list of recent conversations from the place you are in,
   each with its place chip, and *All conversations*, which opens the Chat page. No tabs of open conversations.
5. **The canvas is for work:** any existing view at full width. The Tools panel and the four-way layout control go.
6. **A place's sections are in the left panel, which drills into the place** (see *A place's navigation* below).
   Every section is listed, none nested, in a fixed order (§7). A place opens on Overview, today's top of the Tools
   panel. There is no reordering of sections. A pinned project opens the project, as it does today.
7. **Every place has the same model** — a project, your space and an agent's page:

   | Place | Sections |
   |---|---|
   | A project | Overview · Conversations · Tasks · Boards · Timeline · Runs · Automation · Files · Artefacts · Knowledge · Workspaces · Members · Settings · Memory (admins) |
   | Your space | Overview · Conversations · Tasks · Boards · Runs · Automation · Files · Artefacts · Knowledge · Workspaces · Agents |
   | An agent's page | Overview · Conversations · Now · Projects · Runs · Usage · Your instructions · Memory · Your settings |

   The sections are the existing views, unchanged. A place's Conversations section is today's list for that
   place; choosing one opens it in the dock, and writing in its box starts one there.
8. **Your space is the default personal project.** Behind it is the person's personal project, created with the
   account and never deletable ([personal projects](../../concepts/projects/personal-projects.md)). It has its own
   entry, *Your space*, fixed at the top of the navigation, and the same model as a project. When a person can
   create more personal projects, each is a project with the same sections, listed under Projects and marked
   personal; nothing here needs redrawing. This unit creates no personal projects and changes nothing in how your
   space is stored.
9. **The Chat page** lists the conversations of your space, as today. A list across every place, with a place
   filter, waits on a server read that is its own follow-up.
10. **A new conversation is a draft in the dock, and asks for nothing.** ＋ in the dock or 💬 *Talk about <place>*
    in the bar swaps the dock to a draft and remembers what was open. The draft's header reads *New conversation*
    with **Cancel** in place of 🕘 ＋ ⤢ ›; Cancel (or Esc) puts back exactly what was open, or closes the dock if
    nothing was, and discards any text not sent. The draft's area is **the list of places you can use**, with
    search at the top, grouped *You're here*, *Your space*, *Pinned*, *All projects*. The place you are on is
    already selected and the message box has focus, so the usual case is to type and send. Only the selected place
    shows its one-line explanation (*"A project. Works in its files, with its agents. Others in it can see it's
    running, not what's said."* or *"Private to you. Works in your own files."*), and a line above the box says
    who leads it and what it can use. Searching filters the list without moving the selection. Choosing a place
    hands it to `NewConversationBox` through the props it already takes (`home`, `projectId`, `basePath`), so the
    box is unchanged and its own agent picker follows the place. Sending turns the draft into the conversation,
    with its place as the chip in the dock's header. See [`boards/new-conversation.html`](boards/new-conversation.html).

    **The place you are on is the project for anything inside it** — a workspace, a task, a board, a file — since a
    conversation in a project covers everything in it. There is no conversation bound to one workspace: a
    workspace's former *Start a conversation here* is removed, and ＋ there starts one in its project.
11. **No focus mode.** ⤢ expands the conversation over the canvas for reading and writing, and the left panel
    stays. **Going anywhere drops it back to docked**, so it never hides where you went. › collapses it to a rail
    that shows the agent, a dot while work is under way and a count of approvals waiting. Click or ⌘J reopens it.
12. **One model at every width:**
    - wide (≥ 1280 px): docked beside the work;
    - medium (768–1279 px): the dock slides over the canvas; the navigation goes to icons
      from 1024 px, and below that stays the ☰ drawer, where hq's phone layout already begins (owner, walkthrough 2);
    - narrow (< 768 px): a pill at the bottom of every screen; tapping it shows the conversation full screen.

    Resizing never loses the conversation, its scroll position or unsent text.
13. **Home** keeps its box. Sending from it starts a conversation in your space and opens it in the dock; Home stays
    in the canvas.
14. **Links in a conversation** (a task, a board) open in the canvas, and the conversation stays. A worker's run
    opens in the canvas beside the conversation that commissioned it.
15. **A reply keeps streaming, and voice keeps going, wherever you navigate.**
    - The shell — the left panel, the bar and the dock — is drawn once, above the pages, so the conversation, its
      socket subscription and its streaming reply stay mounted while the canvas changes.
    - Expanding, collapsing, the medium slide-over and the narrow pill are changes of position, never a remount.
    - The reply runs on the server either way; the thread already rejoins with a replay of the running reply.
    - Voice already continues across pages through the shell's voice bar.

## A place's navigation: the left panel drills in

The owner chose this over tabs across the canvas after using both (built first as tabs, then side by side behind a
switch in development builds). See [`boards/navigation.html`](boards/navigation.html).

- **The left panel drills into a place.** Inside a project, your space or an agent's page, the panel's main
  navigation becomes the place: its header (‹, avatar, name, pin — the name opens Overview), then every section
  with its count and the current one marked, under small group labels (*Work*, *Agents at work*, *Files*, *Project*;
  an agent's *At work*, *About it*) with nothing nested. *Pinned* is in the foot (below). There is no tab row and no header in the canvas; the canvas is the
  section, full height.
- **The foot never moves** (see [`boards/pinned-foot.html`](boards/pinned-foot.html)). It is two rows, the same inside a
  place, on the main navigation and in *Go to*:
  - **Pinned, one row:** the pin you used last that isn't where you are, with a count and ▴; its name goes there. ▴
    opens the list upward from the row, attached to the foot, the current place marked, scrolling past about half the
    panel; it stays open until closed. Open or closed and the last pin are remembered in the browser. With no pins
    the row is not shown.
  - **You:** your avatar and name open a menu with Organisation, Settings and Sign out; Collapse stays a button (« )
    on the row.
  - At icon width Pinned is the last pin's avatar (its list opens to the right) and you are your avatar; the phone
    drawer has the same foot without Collapse.
- **‹ shows the main navigation over the panel** (*Go to*: Home, Chat, Your space, Projects, Agents, Tasks, Pinned
  with the current place marked, the footer). Choosing an item goes there; choosing the current place, ✕, Esc or a
  click outside closes it and nothing moves.
- **The breadcrumb's parts open lists:** *Home ▾* (the main navigation), *Projects ▾* (the places), the place's name
  (your projects; switching keeps the section) and the section (the place's sections with counts).
- **Overview** is today's view: the facts, Members and the sections as rows with their counts. A project's
  description, which the header above the canvas used to show, sits under *About this project*.
- **Collapsed and medium widths (1024–1279 px):** ‹, the place's avatar, then one icon per section (Lucide:
  Overview `layout-dashboard`, Conversations `messages-square`, Tasks `square-check`, Boards `kanban`, Timeline
  `gantt-chart`, Runs `play`, Automation `repeat`, Files `folder`, Artefacts `diamond`, Knowledge `book-open`,
  Workspaces `git-branch`, Members `users`, Settings `settings`, Memory `brain`; an agent's Now `activity`,
  Projects `folder-kanban`, Usage `gauge`, Your instructions `scroll-text`), names on hover, pinned as avatars.
- **Below 1024 px:** the drawer shows the drilled-in panel with ‹, which swaps the drawer to the main navigation;
  ✕ on *Go to* goes back to the place's panel, and tapping outside closes *Go to* and the drawer together. The header names the section, and its title opens the section list.
- Addresses are unchanged (`?tool=`); nothing inside a section changes; the dock is the same.

## How the shell moves above the pages

Today every page wraps its content in `AppShell`, so going to another page removes one shell and builds an
identical one. The page files do not change: `AppShell` keeps its name and props, but instead of drawing the
navigation and bar it passes its breadcrumbs, bar buttons and mobile header up to the one shell in the app's root
(`App.tsx`, around the routes), and draws only the page's content. The screens for a place (`PlaceScreen`,
`ProjectLayout`) change anyway, because the Tools panel and layout control go.

## Before this layout: one kind of conversation

The new conversations were built behind the `conversations` flag, off in a production build. Nothing is released, so
the flag is removed and the new conversations are always on. The conversation lists also still showed the chats from
before the conversational experience (harness chat sessions with no task and no conversation), marked *from before* and read-only; they are
removed, and so is the old chat path for a person's or a project's conversations. Home shows no *Jump back in* when
there is nothing to list, and its first suggestions and an agent page's box start a new conversation. A task's
session and a conversation's workers stay as they are.

## Scope

Shell, layout and navigation only, reusing existing views and conversation components:

- the shell drawn once in the app's root, with `AppShell` passing its parts up;
- the dock, built from `ConversationThread` and `NewConversationBox`, with the new-conversation draft and its list of places (§10);
- `?c=` and the shell's reading of the `/t/` addresses;
- each place's sections in the drilled-in left panel, with the breadcrumb's lists, opening on Overview; retiring the Tools panel and `LayoutControl`;
- your space's own entry, and agent pages on the same model;
- expanded, collapsed, the medium and narrow layouts.

**Not in this unit:**

- A list of conversations across every place (the Chat page's place filter, 🕘 across places, *Jump back in* for
  the new conversations): a server read, its own follow-up.
- Talking to a conversation's worker from its run: a feature of its own, follow-up.
- Creating more personal projects.
- Choosing the order of a place's sections.

The phone app (Flutter) is separate and unaffected.
