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
    ├── <AppSidebar />                      the navigation, full height, left
    ├── screen column (data-testid="shell-screen", position: relative)
    │   ├── <MobileHeader />                below lg only: ☰, the screen's title, Notifications and Runs
    │   ├── <ScreenBar />                   lg and up: breadcrumb left, the page's slot right
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

Outside a place, top to bottom: the logo with **Notifications** and **Runs** beside it (`ShellPanelButtons`); the places —
Home `/`, Chat `/chat`, Your space `/space`, Projects `/projects`, Agents `/agents`, Tasks `/tasks` (with its "N need you"
count); and at the foot (below) Pinned, then you.

- **Highlighting.** `aria-current="page"` marks the active place. Projects is active only on `/projects`
  itself — inside a project the project's pin is what is highlighted. Chat is active on `/chat` and on
  `/sessions/:id`; Your space on `/space`.
- **The foot never moves** (`sidebar/SidebarFooter.tsx`, `data-testid="sidebar-foot"`). It is the same inside a place,
  on the main navigation and in *Go to*, and it is not in any scrolling list, so what you choose cannot move it.
  Two rows:
  - **Pinned, one row** (`pins/components/PinnedFoot.tsx`): the pin used last that isn't where you are (`rowPinId`;
    before any is used, the first), its count and ▴. The name goes there; ▴ opens the list upward from the row
    (`sidebar/FootPopover.tsx`), the current place marked, Edit / Done inside it, scrolling past half the panel's
    height. The list stays open until ▴ closes it. Open or closed and the pins used (latest first) are one
    `localStorage` key, `pinnedFoot` (`pins/pinnedMemory.ts`, shared by the panel's foot and *Go to*'s). With no pins
    there is no row. `AppSidebar` takes it as the `pinned` prop — a node, or a function given `{ collapsed, onNavigate }` —
    and `ShellFrame` passes `PinnedFoot`; the navigation draws no Pinned heading of its own.
  - **You** (`sidebar/YouMenu.tsx`): your avatar and name open a menu (`role="menu"`, label *Account*) with
    Organisation, Settings and Sign out; Esc and a click outside close it and focus returns to your name. Collapse
    is a « button on the row (» when collapsed), hidden where `onToggleCollapse` is not given.
- **Collapsed** (`lg` and up): an icon strip — the logo, Notifications and Runs stacked with their counts,
  the places as icons (Tasks' count as a badge), then the foot: Pinned as the last pin's avatar (its list opens to the
  right, for one choice, and is not remembered), you as your avatar (the same menu, to the right), and expand. The choice is kept in `localStorage` (`useNavCollapsed`), so it survives
  navigation. On a medium window (768–1279 px) the dock slides over the canvas and `ShellFrame` forces this strip
  (`navIcons`) whatever the setting.
- **Mobile** (below `lg`, `useIsMobile`): the navigation is a drawer, opened from ☰ in `MobileHeader` and
  closed on navigation or by its backdrop (`NavDrawerContext`). The drawer is always the full navigation,
  whatever the collapsed setting, with the same foot and no collapse button; following a pin or a menu link closes it. There is no bottom bar.

**Inside a place** the panel drills in (`sidebar/PlacePanel.tsx`; the parts of `AppSidebar` are in `sidebar/`). A place's
screen gives `AppShell` a `PlaceNav` (`shared/layouts/placeNavTypes.ts`, built by `placeNavOf` in `src/places/placeNav.ts`:
kind, id, name, `homePath`, sections with counts and group labels, the section shown). `AppShell` publishes it with the
breadcrumbs, and `ShellFrame` passes it to `AppSidebar` and `ScreenBar`; with none the panel is the main navigation.

- **The panel.** ‹, the place's avatar and name (to Overview) and its pin; then the sections under their group labels,
  scrolling; then the foot. Collapsed, and on a medium window (`navIcons`),
  it is ‹, the avatar and one icon per section (`sidebar/sectionIcons.ts`), the count as a badge, the name on hover.
- **‹ shows *Go to*** (`sidebar/MainNavOverlay.tsx`): the main navigation and the foot over the panel. Choosing
  an item goes there; choosing the current place, ✕, Esc or a click outside closes it and nothing moves (the canvas is
  never remounted). On a phone it covers the drawer, ✕ goes back to the place's panel, and a click outside closes it
  and the drawer together.
- **Breadcrumb lists.** `drillCrumbs` gives the parts of the breadcrumb a `list` (*Home ▾*, *Projects ▾*, the place's name,
  the section); `shared/layouts/CrumbLists.tsx` draws them. The phone header (`PlaceDrillMobileHeader`) names the section
  and its title opens the sections.
- Chat (`/chat`) is a list of conversations, not a place's sections: it stays on the main navigation.

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

A slim bar across the top of each screen's content, `lg` and up. The breadcrumb's links are router
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
- **Small screens.** The drawer is the place's panel; the header (`PlaceDrillMobileHeader`: ☰, the section's name,
  the place's name) opens the section list from its title.
- **Talk about <place>.** `TalkButton` in the screen bar calls `dock.startNew(place)` (a project, or your
  space); on an agent's page, *Talk to <agent>* calls `dock.startNew(yourSpace, agentId)`. With no dock it opens
  the place's Conversations section instead.

## The dock: the open conversation

`src/dock/`. One conversation is open at a time, in `<Dock>`, drawn by `RootShell` beside the canvas whether or not
a page is framed. The thread is the existing `ConversationThread`; the dock adds its header (a place chip from
`useDockPlace`, then `DockActions`: recent 🕘, new ＋, expand, collapse), nothing else. It talks to the
conversation components only through their props: the thread's `onActivity`, `onDeleted` and `onArchived`, and
the box's `agentId` and `onAgentChange`. It provides `CardPlaceContext` (the conversation's place, from
`useDockPlace`), so an agent's card in the thread offers what the person can do with the agent there.
A list of conversations marks the open one's row with `aria-current="page"`, read from `?c=`.

- **State** is `useOpenConversation()` (held by `RootShell`, provided as `DockContext`, read with `useDock()`):
  `open`, `draft`, `width`, `position`, `openConversation`, `startNew`, `close`. `useDocked()` says a root shell
  is above. **Never remount to change layout:** width and position only change the one `<aside>`'s classes
  (`dockClasses`, `dockLayout.ts`) and hide the thread behind the rail or pill.
- **Position** (`DockPosition`): `docked`, `expanded` (over the canvas, which stays mounted and is hidden:
  `screenCovered`), `collapsed` (a rail, `DockRail`, with the agent, a working dot and a count of approvals
  waiting; a pill, `DockPill`, when narrow). ⌘J / Ctrl+J toggles collapsed. A move of the canvas drops
  `expanded` to `docked` (wide), or puts an open dock away to its rail or pill (medium and narrow).
- **Width** (`useDockWidth`): `wide` ≥ 1280 px (beside the canvas), `medium` 768–1279 px (slides over it; the
  navigation shows as icons, `navIcons`, and below `lg` it stays the ☰ drawer), `narrow` < 768 px (a pill at the
  bottom of the stacked frame; opened, the dock is full screen with a ‹ in its header).
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
- **The draft.** ＋ and *Talk about* call `startNew(place)`: the dock becomes `NewInDock` — *New conversation*
  with **Cancel** (or Esc) in place of the buttons — and remembers what was open (kept mounted, hidden) and its
  position; Cancel puts it back. The area is `DockNewConversation`: `DockPlaceList` (the places the person can
  use, grouped *You're here*, *Your space*, *Pinned*, *All projects*, from `placeList.ts`, with search that
  never moves the selection), a line saying who leads (the agent the box reports through `onAgentChange`) and
  what it can use, and `NewConversationBox` given `home`, `projectId` and `basePath` from the chosen place, and
  the draft's agent as `agentId` (`startPlace.ts`,
  `canvasPlaceOf`: anything under a project's address, or a task's, is that project). Sending goes to the new
  conversation's address, which the shell opens in the dock.
- **Rail and pill signals** are what the thread, still mounted behind them, reports through `onActivity`: work
  or a reply under way, and the approvals waiting. Nothing is polled.

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
