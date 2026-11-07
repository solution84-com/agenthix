---
name: app-layout
description: Use when adding, modifying, or debugging any part of hq's app shell — the frame drawn once in the root (RootShell, ShellFrame), AppShell and what pages publish to it, the navigation (AppSidebar), the screen bar, the mobile header and drawer, the docked conversation (the dock, ?c=, the draft), a place's drilled-in panel, the Notifications and Runs panels, or the AppLayout / ProjectLayout wrappers pages render. Also use when wiring a new panel beside the navigation, or touching the URL parameters that open those panels or the conversation.
---

# App layout — the shell every screen shares

hq's shell is drawn **once**, in the app's root, around the routes: the navigation on the left, the screen
(a bar, then the page's content) in the middle, and the open conversation docked on the right. Going to
another page changes the content only; the navigation and the dock are never unmounted, which is what keeps a
conversation, its socket subscription and a streaming reply alive across navigation. There is **no global top bar**.

```
<RootShell>                                 src/shared/layouts/RootShell.tsx (in App.tsx, around the routes)
└── <ShellFrame>                            src/shared/layouts/ShellFrame.tsx — the frame
    ├── <AppSidebar />                      the rail, full height, left; a place's menu beside it
    ├── screen column (data-testid="shell-screen", position: relative)
    │   ├── <MobileHeader />                below lg only: ☰, the screen's title, the chat, Notifications and Runs
    │   ├── <ScreenBar />                   lg and up: breadcrumb (from Home) left, the page's slot right
    │   ├── <ShellNotices /> <VoiceBar />
    │   ├── …the page (its AppShell draws only its content)
    │   └── <ShellPanelHost />              the open Notifications or Runs panel, over the content
    └── <Dock />                            src/dock/ — the open conversation, right
```

**`AppShell` publishes, it does not draw.** Every page still wraps itself in `AppShell` with `breadcrumbs`,
`screenBarRight` and `mobileHeader` (and, for a place's screen, `placeNav`). Under the root shell it passes the breadcrumbs up (`useShellPublisher`,
published by value in a layout effect) and portals `screenBarRight` and `mobileHeader` into slots the root
draws, so they keep the page's own context. The last published page is the active one; with none, only the
page is drawn (`framed` false) at the same place in the tree, so nothing remounts. Rendered with no root shell
above it (a page in a unit test), `AppShell` draws the whole `ShellFrame` itself. Inside an `AppShell`,
a nested one draws only its children (`InsideShellContext`).

Pages render one of the wrappers, or — a place's screens — `PlaceScreen`:

| Wrapper | Props | Adds |
|---|---|---|
| `AppLayout` | `breadcrumbs`, `title`, `subtitle`, `action` | A page title block under the screen bar; a scrolling `<main>` |
| `ProjectLayout` | `breadcrumbs` | For a project page. Drawn as a section of a place (`useInToolPanel`) it draws only the page's content; at a former page's address (`/projects/:key/tasks`, `/files`, `/github`, `/workspaces`, `/routines`, `/settings`) it redirects to the project on that section (`?tool=…`); otherwise (a board) a non-scrolling `<main>` |
| `PlaceScreen` (`src/places/components/`) | `place`, `breadcrumbs`, `mobileHeader`, `conversations`, `section`, `isPlace` | A place's screen: the chosen section across the canvas, with *Talk about <place>* in the screen bar. It hands the shell the place (`placeNav`), whose sections are the left panel's. `isPlace={false}` (Chat) hands none |

Because the frame lives above the pages, **anything that must survive navigation can live in the shell's
state**; what a page keeps in its own component state is lost when the person leaves it, so state a link must
restore goes in the URL.

## Navigation (`src/shared/components/AppSidebar.tsx`)

The main navigation never goes away. On `lg` and up it is a slim **rail** (56 px, icons only): the organisation's picture
(`OrgSwitcher`), the places as icons, each named by a tooltip on hover and keyboard focus (and by its accessible name) — Home `/`, Chat `/chat`, Your space `/space`,
Projects `/projects`, Tasks `/tasks` (its count as a badge), Agents `/agents`, Library `/library` — then the foot
(`sidebar/SidebarFooter.tsx`, `data-testid="sidebar-foot"`, its top edge the divider): Manage `/admin` for organisation
admins, Notifications and Runs (`ShellPanelButtons`), and you. There are no pinned projects in the rail: they lead the
Projects list and Find a project. The rail does not collapse.

- **Highlighting.** `aria-current="page"` marks the active place. Projects is active only on `/projects` itself.
  Chat is active on `/chat` and on `/sessions/:id`; Your space on `/space`.
- **You** (`sidebar/YouMenu.tsx`): your initials open a menu (`role="menu"`, label *Account*) with who you are, Your
  settings, Organisation, Help and the guide, and Sign out; Esc and a click outside close it and focus returns.
- **Phone** (below `lg`, `useIsMobile`): the same `<nav aria-label="Main">` is the **main drawer**, from ☰
  (`NavDrawerContext`), the same everywhere and never a place's menu: the organisation, the places as rows, Manage
  and you. Notifications are in the top bar instead. Following a link closes it.

**Inside a place** a place's screen gives `AppShell` a `PlaceNav` (`shared/layouts/placeNavTypes.ts`, built by
`placeNavOf` in `src/places/placeNav.ts`), and `ShellFrame` passes it to `AppSidebar` and `ScreenBar`.

- **The place's menu** (`sidebar/ProjectMenu.tsx`, `data-testid="place-menu"`, labelled *<name> menu*) opens beside the
  rail, never instead of it. Its header is the place: its name ▾ (Find a project; an agent's name only opens its
  page), its pin, and the hide icon (`MenuToggle`). Then the sections under their group labels. On a medium window
  (`navIcons`) it is one icon per section (`sidebar/sectionIcons.ts`), the count as a badge.
- **Hidden** (`useProjectMenuHidden`, `localStorage` `placeMenuHidden`): the menu is not drawn and the show icon leads
  the breadcrumb.
- **Find a project** (`sidebar/FindProject.tsx`, logic in `sidebar/projectChoices.ts`): a search, your pinned projects
  in their order, the other projects A–Z, *All projects →*. Choosing one lands on the same section (`?tool=`). It opens
  from the menu's header, from the breadcrumb's project part, and on a phone inside the project drawer.
- **Breadcrumb.** `drillCrumbs` gives the place's parents, the place (`list: 'projects'`, opening Find a project),
  then the section; `ScreenBar` puts *Home* first on every screen (`fromHome`).
- **Phone top bar** (`shared/layouts/TopBar.tsx`, shared by `MobileHeader`, `PlaceMobileHeader` and
  `PlaceDrillMobileHeader`): what leads, the title (with the place's name small underneath inside a place), then the
  chat's icon slot, Notifications and Runs, then what the screen adds. Inside a project or an agent's page the top
  left is ‹ Back (to the list the place sits in); in your space it stays ☰. The button at the end opens the
  **project drawer** (`sidebar/ProjectDrawer.tsx`) from the right: the name ▾ on top, then every section; the name
  brings up Find a project in the same drawer, so there are never more than two layers.
- Chat (`/chat`) is a list of conversations, not a place's sections: it has no place menu.

Counts come from `useShellCounts` (`src/shared/layouts/`): unread notifications, runs in progress, tasks
needing a person.

## Notifications and Runs panels

They are twins: each opens **beside the navigation, over the screen's content**, and closing it leaves the
person exactly where they were. On a small screen the panel fills the screen instead.

- **State lives in the URL**, read and written by `useShellPanels` (`src/shared/context/useShellPanels.ts`):
  `?panel=notifications`, `?panel=runs`, and `?runs=<sessionId>` for one run opened inside the Runs panel
  (the older deep link, kept). Writes use `replace`, so opening a panel adds no history entry. Leaving the
  page drops the parameters and so closes the panel — a panel that navigates (Open task, a notification's
  action) just navigates; it must not call `close()` afterwards, which would write the old page's URL back.
- **`ShellPanelHost`** chooses the content: `NotificationPanel`, `RunsPanelList`, or `RunsPanelSession`.
  On a wide screen it also renders a click-outside layer; Escape closes it too.
- **Panel components** (`NotificationPanel/`, `RunsPanel/`) are `flex flex-col h-full` and own their header,
  with a close button calling `close` from `useShellPanels`. There is no maximise or full mode.
- **Opening one from elsewhere:** call `openRunsSession(id)`, `openRuns()` or `openNotifications()` from
  `useShellPanels` — for example the task view's "view transcript".

## The screen bar (`src/shared/layouts/ScreenBar.tsx`)

A slim bar across the top of each screen's content, `lg` and up. The breadcrumb starts at Home; its links are router
`<Link>`s: they navigate inside the app and never reload the page. The last crumb is marked as the current
page. The right-hand slot is the screen's; the shell puts nothing there.

Below `lg` the screen bar is hidden and `MobileHeader` shows the last crumb as the screen's title.

## Places: sections in the left panel

A place — a project, the person's own space (`/space`), or an agent's page — is one thing in the client
(`src/places/`): the Overview and the sections' views are built once and given a `Place`
(`placeTypes.ts`), which carries its facts, its grouped tools, `sectionOrder` and the agents its conversations may
use. A project's is built by `useProjectPlace` (`src/projects/place/`), the person's space by `useChatPlace`
(`src/chat/`), an agent's by `useAgentPlace` (`src/agents/pages/place/`).

- **Sections.** `placeSections(place)` gives Overview, Conversations, then the tools in `sectionOrder`; another address for
  a tool (`aliasOf`, e.g. `?tool=people`) has no section of its own. The chosen section is the address's `?tool=`
  (`usePlaceUrl`; none is Overview; `chosenSection`, `sectionHref`). Choosing one replaces the query, so what one section
  kept in the address is dropped. `navSections` (`placeNav.ts`) gives them to the panel with their group labels.
  A section's view is today's page drawn inside `PlaceToolView`/`ToolPanelBoundary` (`toolPanelContext`), which is
  what `ProjectLayout` reads. There is no header or row of tabs in the canvas.
- **Overview** (`PlaceOverview`) shows the facts, a row for Members, then the tool groups; a row opens its section.
- **Routes.** A project is `/projects/:key`; your space is `/space`. Conversation addresses
  (`/projects/:key/t/:id`, `/chat/t/:id`) still exist; the shell reads them (below). Chat (`/chat`, `ChatPage`)
  is only the list of your space's conversations, with the main navigation (`isPlace={false}`). `/sessions/:id` opens
  a task's session, and sends any other session to Chat.
- **Navigation.** *Your space* is its own entry in the main navigation, under Chat, active on `/space`.
- **Small screens.** The header (`PlaceDrillMobileHeader`: ‹ Back, the section's name over the place's) opens the
  place's sections in the project drawer from its end button.
- **Talk about <place>.** `TalkButton` in the screen bar calls `dock.startNew(place)` (a project, or your
  space); on an agent's page, *Talk to <agent>* calls `dock.startNew(yourSpace, agentId)`. With no dock it opens
  the place's Conversations section instead.

## The dock: the open conversation

`src/dock/`. One conversation is open at a time, in `<Dock>`, drawn by `RootShell` beside the canvas whether or not
a page is framed. The thread is the existing `ConversationThread`; the panel adds a header with only a place chip from
`useDockPlace` (on a phone also ⌄ to fold it and ⋮ for the menu), and on its right **the chat's bar** (`DockBar`, not
on a phone). It talks to the conversation components only through their props: the thread's `onDeleted` and
`onArchived`, and the box's `agentId`, `onlyAgentIds` and `onAgentChange`. It provides `CardPlaceContext` (the conversation's place, from
`useDockPlace`), so an agent's card in the thread offers what the person can do with the agent there.
A list of conversations marks the open one's row with `aria-current="page"`, read from `?c=`.

- **State** is `useOpenConversation()` (held by `RootShell`, provided as `DockContext`, read with `useDock()`):
  `open`, `draft`, `width`, `position`, `openConversation`, `startNew`, `close`. `useDocked()` says a root shell
  is above. **Never remount to change layout:** width and position only change the one `<aside>`'s classes
  (`dockClasses`, `dockLayout.ts`) and hide the thread when minimised.
- **Position** (`DockPosition`), chosen with the three-state control at the top of the bar (`DockStateControl`):
  `collapsed` (minimised: only the bar is left; on a phone the panel is out of sight), `docked` (beside the page),
  `expanded` (over the canvas, which stays mounted and is hidden: `screenCovered`; the thread in a centred column).
  ⌘J / Ctrl+J toggles minimised. A move of the canvas drops `expanded` to `docked` (wide), or minimises an open
  panel (medium and narrow).
- **Width** (`useDockWidth`): `wide` ≥ 1280 px (beside the canvas), `medium` 768–1279 px (slides over it; a
  place's menu shows as icons, `navIcons`, and below `lg` the navigation stays the ☰ drawer), `narrow` < 768 px (no bar: folded
  away, `DockPhoneButton` in the phone's top bar opens it full screen; ⋮ in its header opens the menu sheet).
- **The bar** (`DockBar`): the state control, ＋, **Conversations** with one badge for everything waiting
  (`WaitingBadge`, amber when anything needs the person), then the pinned places (`pinnedPlaces.ts`: Your space,
  then pinned projects), each tile with its signals (`placeSignals`) and the open conversation's place ringed.
- **Overlays** (`DockOverlays`, `DockLayer`): one at a time over one app-wide scrim, drawn into `document.body`; a
  tap on the scrim, ✕ or Esc closes it with nothing changed. The Conversations list (`DockConversationList`: newest
  first, search, *Needs you* and *Unread* toggle filters kept in `localStorage` as `dock-conversation-filters`,
  *Open in Chat*), a pinned place's conversations (`DockPlaceConversations`), a new conversation over an open one,
  and on a phone the menu (`DockPhoneMenu`), whose choices replace it, with ‹ back. On a phone each is a bottom sheet.
- **What is going on** comes from one query, `getConversationInbox` (`src/conversations/inbox/`): every conversation
  the person can open (their own, in their space and their projects, scoped as `getConversations` is), newest first,
  each with `needsYou` (requests waiting for approval), `unread` (since `ConversationReader.lastReadSeq`), `working`
  and its last line, and the totals. `useConversationInbox` reads it again on `notifications:changed`,
  `needsYou:changed` and `runs:changed`, and after any action on a conversation. The conversation in sight in the
  panel is marked read (`useMarkShownRead`).
- **Resizing** (`dockSize.ts`, `DockResizeHandle`): the docked width is dragged from the dock's left edge
  (pointer, arrow keys, double-click resets), stored in `localStorage` (`dock-width`), kept between 400 px and
  the smaller of 720 px and half the window.
- **The address.** The conversation is `?c=<id>` on whatever page is open (`dockAddress.ts`:
  `withConversation`, `conversationParamOf`). Links across hq drop the query, so the shell keeps the conversation
  as its own state and writes `?c=` back onto every location, replacing it so Back is unaffected; an address
  that names one opens it on load and on Back.
- **The `/t/` addresses.** `threadAddressOf` reads `/chat/t/<id>` and `/projects/<key>/t/<id>`.
  `DockGuard` blocks a navigation to one before the canvas leaves, so a row in a list or a box that has just
  started a conversation opens it in the dock while the canvas stays. Only a data router can block, so
  `RootShell` draws it when given `dataRouter` (the app's root, under Wasp's router, does). Arriving from
  outside hq, `useOpenConversation` replaces the address at once with `?c=` on the place's Conversations section
  (`conversationsSectionOf`). Deleting or archiving the open conversation calls the thread's `onDeleted` /
  `onArchived`, which close the dock; the canvas stays.
- **The draft.** ＋ and *Talk about* call `startNew(place)`, which remembers what was open and its position. Over an
  open conversation the draft is an overlay (the conversation stays in view under the scrim); closing it puts back
  what was open. With nothing open it fills the panel as `NewInDock`, *New conversation* with **Cancel** (or Esc). The area is `DockNewConversation`: `DockPlaceList` (the places the person can
  use, grouped *You're here*, *Your space*, *Pinned*, *All projects*, from `placeList.ts`, with search that
  never moves the selection), a line saying who leads (the agent the box reports through `onAgentChange`) and
  what it can use, and `NewConversationBox` given `home`, `projectId` and `basePath` from the chosen place, and
  the draft's agent as `agentId` (`startPlace.ts`,
  `canvasPlaceOf`: anything under a project's address, or a task's, is that project). Sending goes to the new
  conversation's address, which the shell opens in the dock.

- **One place to write.** Pages have no message box of their own. Home and the Chat page draw `FloatingComposer`
  (`conversations/components/`) over their foot only while the dock is minimised (`showsFloatingComposer`); they keep
  `FLOATING_COMPOSER_ROOM` at the foot of what they scroll whether it shows or not, so nothing moves. A project's or
  your space's Conversations list (`NewConversationsList`) is a list and *New conversation here*; the Chat page
  (`chat/components/ChatList.tsx`) keeps its search and filters in its address (`shared/conversations/chatList.ts`),
  which the bar's *Open in Chat* writes. A list's `?agent=<id>` starts a draft with that agent
  (`useStartFromAddress`). *Talk about this task* (`TaskThreadSection`) opens the task's conversation in the dock, or
  a draft about the task (`DockDraft.task`) whose first message creates it.

During a voice call on a conversation, the voice controls take the message box's place
(`composerReplacement` on `PanelChatView`); the shell's `VoiceBar` keeps it across pages.

## Adding a panel beside the navigation

Only for something ambient that every screen needs, as Notifications and Runs are; anything about one
place belongs in that place's sections.

1. Add its name to `ShellPanel` in `useShellPanels.ts`, with open and toggle functions.
2. Create `src/shared/components/YourPanel/YourPanel.tsx` — `flex flex-col h-full`, its own header and a
   close button.
3. Render it from `ShellPanelHost`.
4. Add its button to `ShellPanelButtons`, with its count if it has one.

Colours in every shell file come from the design tokens (`bg-surface-*`, `text-text-*`, `border-border*`,
`bg-accent`, …); never a hex value or a dark-only utility such as `text-white/40`. See `ui/DESIGN-SYSTEM.md`.
