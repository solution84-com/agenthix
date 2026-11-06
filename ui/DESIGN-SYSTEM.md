# Agenthix Design System

> **Read this when working on UI in any Agenthix module.**
> It's the canonical reference for visual consistency, theme tokens, component conventions, and the lift workflow that keeps shared components in `@agenthix/ui` rather than in the app.

---

## Two Layers of Consistency

### Layer 1 — Design tokens (universal)

**Every Agenthix screen uses the same brand colors, typography, spacing, radii, etc.**

Single source of truth: [`ui/src/theme/tokens.css`](src/theme/tokens.css). It defines:

- Surfaces — `--color-surface-0`..`--color-surface-3`, `--color-surface-hover`
- Text — `--color-text-primary` / `secondary` / `muted`
- Borders — `--color-border`, `--color-border-subtle`
- Accent — `--color-accent`, `--color-accent-hover`, `--color-accent-subtle`
- States — `--color-success`, `--color-warning`, `--color-danger`, `--color-danger-hover`
- Typography — `--font-sans` (Inter), `--font-mono` (JetBrains Mono)
- Chips and choices — `--color-chip` (a neutral pill: a plain fact such as *Self-hosted*), `--color-selected` (a
  chosen menu item), `--color-border-strong` (the outline of a chosen option), `--color-card` (a card on the page)
- The frame — `--color-frame-sidebar`, and `--color-frame-wash` / `--color-frame-glow` behind a page's title
- The primary button and marks — `--color-primary-from` / `-to` / `-shadow` (`shadow-primary`), `--color-mark-from` /
  `-to`, `--color-avatar-from` / `-to`; `--shadow-pop` for a dialog
- Buttons — `--color-button-secondary`, `--color-button-danger` / `-hover` / `-text` / `-ring`,
  `--color-button-primary-ring`, `--radius-button`, `--font-weight-button`, and `--button-primary-image` (a plain
  custom property, not a Tailwind token). hq's values reproduce its buttons exactly (no ring, no image); the Fleet
  Console's give its slate gradient primary and quiet outline secondary and danger. The rings are inset, so they take
  no room
- Shared by every portal — the state colours; Cloud's badge (`--color-cloud`, `--color-cloud-subtle`) and sunrise
  (`--color-sunrise-from` / `-via` / `-to`, `--color-on-sunrise`); a terminal (`--color-terminal`,
  `--color-terminal-text`)

How they are consumed:

| Module | Mechanism |
|--------|-----------|
| `hq/` (Wasp web) | `@import "@agenthix/ui/theme/tokens.css"` in `hq/src/Main.css`, which also maps Wasp's sign-in form variables onto the tokens |
| `console-web/` (the Fleet Console's screens) | The same import in `console-web/src/index.css`, with `data-portal="fleet-console"` on `<html>` (`console-web/index.html`), which selects the Fleet Console's values |

`site/` serves no web page. Clients built on these tokens outside this
repository keep their own copy, so a change to `tokens.css` is not finished until those copies are updated too — each
in its own repository and commit.

**Rule**: If you need a new color or font weight, add it to `ui/src/theme/tokens.css` first — never inline a hex in a consumer.

**No hardcoding — ever.** This means:

| Context | Correct | Wrong |
|---------|---------|-------|
| Web Tailwind class | `bg-accent`, `text-accent`, `border-accent` | `bg-[#6366f1]`, `text-[#7c5cfc]` |
| Web inline style | `style={{ color: 'var(--color-accent)' }}` | `style={{ color: '#6366f1' }}` |
| Web CSS file | `color: var(--color-accent)` | `color: #6366f1` |

If you catch a hardcoded hex anywhere outside `tokens.css`, treat it as a bug and fix it immediately.

**One design language, a set of values per portal (U1 of the host-management boards).** Every portal uses the same
token names; hq's values are the defaults, and another portal's set is selected by an attribute on `<html>` beside
`data-theme`: `data-portal="fleet-console"` selects the Fleet Console's graphite (slate) values, light and dark. hq
carries no `data-portal`. The state colours, Cloud's badge and sunrise, the terminal and the scrim are shared, so
*Healthy*, *near capacity* and *Not reachable* look the same everywhere. A new token gets a value for hq (in
`@theme {}` and the light block) even when only another portal draws it, so the utility exists in every build. The
Fleet Console bundles its fonts (`@fontsource-variable/*`, whose families end in "Variable"), and its set names them in
`--font-sans` / `--font-mono`.

**Light / dark theming:** tokens.css holds the dark values in `@theme {}` and the light values in `:root[data-theme="light"], :root:not([data-theme]) {}`, so light is the default and `data-theme="dark"` on `<html>` switches to dark. hq remembers the choice in the browser (Settings › Profile) and applies it before first paint. Never bake dark-only assumptions into component files: no `text-white/…`, `bg-white/…`, `border-white/…`, `bg-black…` or hex colours; use the token utilities (`text-on-accent` for text on the accent colour, `bg-scrim` for a modal backdrop) so the override propagates automatically.

### Layer 2 — Shared components

**A concept hq draws in more than one place is drawn by one component in `@agenthix/ui`.** A task, a status, a
project header or a conversation looks and behaves the same wherever it appears; the way to keep it so is one
component, composed by every screen that shows it.

---

## Rules When Working on Web UI

1. **Components live in `@agenthix/ui`, not in the app.** hq composes its pages from the shared primitives (Button, InlineEdit, NativeSelect, …) and the shared domain components (KeyBadge, StatusBadge, ProjectTabBar, ProjectProgressBar, TaskMetaSidebar, …). Inventing a parallel component in hq is the path to drift — don't do it.

2. **When you change a shared component, you change it in `ui/`.** Don't tweak Tailwind classes inline in hq to "fix" a color — the next screen that uses the component will not get the fix. The single source of truth is `ui/src/`.

3. **What depends on the app goes in through prop slots.** `ui` has no Wasp or router imports, so routing, data fetching and app-specific rendering are passed in. Examples already in the codebase:
   - `InlineEdit` accepts optional `renderText` / `renderEditor` props; hq's wrapper (`hq/src/shared/components/ui/InlineEdit.tsx`) plugs in markdown rendering.
   - `CommentsSection` accepts `renderContent` and `filterComment`; hq's `TaskPanel` uses them for manifest-approval comments.
   - `ProjectTabBar` accepts a `TabWrapper` prop so the app supplies its link component.

   Pattern: keep the visual shell shared, let the app inject the differing bits.

4. **Tailwind v4 must scan `ui/src/`.** hq's root CSS (`hq/src/Main.css`) has `@source "../../ui/src"` so classes used only inside the ui package are emitted. Without it, classes like `justify-end` silently disappear from the build.

5. **A card highlights with its outline; a row with a fill.** A card — a bordered tile that stands on its own, such
   as a project, team, site or product card — shows hover and focus by its border turning the accent colour
   (`hover:border-accent`), never by a grey fill: on a white surface a grey card reads as disabled, not chosen. A
   row in a list, a menu item or a button highlights with the grey fill (`hover:bg-surface-hover`). A chosen card
   keeps the accent border and may add `bg-accent-subtle`.

6. **Inter font must be loaded.** The Fleet Console bundles it (it makes no request off its machine); hq loads it with an `@import url(…fonts.googleapis.com…)` at the top of `hq/src/Main.css` (`main.wasp.ts`'s `head` only preconnects to the font hosts). The `--font-sans` token expects Inter; without it, system fonts ruin the look.

---

## Sizes, spacing and selection

| Rule | What it says |
|------|--------------|
| Icon buttons | 36 px square on a wide screen; at least 44 px to tap on a phone. |
| Spacing | 8 px between items in a group; 16 px, with a thin divider, between groups. |
| The app's two edges | The rail on the left and the chat's bar on the right are both 56 px wide. |
| Icon-only buttons | Their name shows as a tooltip on hover and keyboard focus, and is their accessible name. |
| Selected | The button whose pop-up, panel or page is open shows the selected fill (`--color-selected`). An outline is never used to mark a button's state. |
| Long text in a row | Each line ends with … inside its container; nothing runs past the edge. |

---

## Component Lift Workflow

When extracting an existing hq component into `@agenthix/ui`:

1. **Add the component to `ui/src/<area>/<Component>.tsx`** with a data + callbacks API. No Wasp imports, no react-router imports — let consumers pass `Wrapper` / `TabWrapper` / `Link` props for routing.
2. **Export it from `ui/src/<area>/index.ts`** and (if it's a primitive) from the relevant subpath in `ui/package.json`'s `exports` map.
3. **Refactor the originating screen** in the same logical commit:
   - Either replace inline JSX with the lifted component, or
   - Convert the local file into a thin re-export shim from `@agenthix/ui` (preferred when the local path was widely imported).
4. **Then switch any other screen** that drew the same concept its own way to the lifted component.
5. **Commit it as one change** with the lifted component, its consumers and their tests together.

---

## When You Find Drift

Treat it as a bug. Either:

- **Layer 1 drift** (a hardcoded color/font somewhere): find the canonical token in `ui/src/theme/tokens.css` and switch the offending code to use it.
- **Layer 2 drift** (two screens drawing the same concept differently): lift the offending JSX into `@agenthix/ui` and refactor both screens to use it.
- **Intentional difference**: document why in the relevant component's file header. Without an explanation it'll get "fixed" on the next pass.

---

## Component Inventory

Current contents of `@agenthix/ui` (canonical; hq consumes them):

**`ui/src/primitives/`** — generic atoms:
- `Button`, `Input`, `Textarea`, `Select`, `NativeSelect`
- `SearchField` and `FilterSelect` (the one style of a list's search box and filters: white, bordered), and `ViewHeaderRow` (a view's one header row — back, title, action — drawn in the panel's header slot when the panel provides one through `ViewHeaderContext`)
- `FormField`, `Modal` (alias `ModalDialog`), `Avatar`, `PlaceAvatar` (a project's initial or a board mark on a colour derived from its id), `Tooltip` (the name of an icon-only control, on hover and keyboard focus)
- `InlineEdit` (with `renderText` / `renderEditor` plug points)
- `EmptyState` (`variant="inline"`: one dashed line in the flow, with an `action`), `StatCard`
- `PrioritySelector`, `SiteSelector`
- `StatePill` (a state in words, its tone only repeating them: healthy, warning, danger, neutral) and
  `HostingBadge` with `hostingLabel` (where a site runs, *Self-hosted* or *Agenthix Cloud*, the same in every portal
  — U3); both used by the Fleet Console today
- `UnansweredSitesNotice` (presenter — takes composed copy; the app writes and tests the words)

**`ui/src/tasks/`** — task-domain composites:
- `KeyBadge`, `StatusBadge`, `PriorityBadge`, `RunStateBadge` (renders nothing when no run is pending; `wait` is its tooltip)
- `AgentPicker`, `CommentsSection`, `TaskMetaSidebar`
- `TaskFilterBar` (with `EMPTY_TASK_FILTER`, `isFilterActive`, `applyTaskFilters`)
- `TaskPanel` (presenter — takes `detail: TaskDetailState`, `SessionSlot?`, `renderCommentContent?`)
- `CreateTaskModal` (presenter — takes `agents`, `boards`, `onSubmit`)
- `TaskScheduleEditor` (presenter — a task's one-off start time, the routine it is a round of, and "Make this a routine…"; takes `schedule`, `routine?`, `onSave`, `onClear`, `onMakeRoutine?`, `renderRoutineLink?`)
- `RoutineRuleFields` (presenter — when a routine's rounds come; `describeRule`, `formatWhen`), `RoutineForm` (presenter — a routine's template and schedule; takes `boards`, `agents`, `onSubmit`), `RoutineList` and `RoutineRoundList` (presenters — a project's routines, one routine's rounds; take link render props)
- `PRIORITY_COLORS`, `PRIORITY_SELECTED_CLASSES` constant exports; `runStateLabel` / `runStateClasses` — the one label table for a task's run state (`tasks/runState.ts`), used everywhere a run state is shown; `runWaitText` — the words for why a queued or throttled task has not started

**`ui/src/projects/`** — project-domain composites:
- `ProjectHeader`, `ProjectStats`, `ProjectCard`
- `ProjectProgressBar`, `ProjectMembersList`
- `ProjectTabBar`
- The Automation tool's presenters: `AutomationOverview` (status with Pause or Resume, Now, the Routines and Rules buttons, Later), `AutomationRoutines` (each routine with its switch, schedule, person and next run), `AutomationRules` (the agents' switch, the limits with the org's maximum, the columns that start work) with `AutomationLimitsForm`; types and `whenLabel` in `AutomationTypes.ts`
- The Files tools' presenters (`FilesToolParts.tsx`): `FilesViewHeader`, `FileRow`, `TopicRow`, `WorkspaceCard`, `FileFact`, `FilesGroupHeading`, `FilesToolNote`, `FilesQuietLine`; the pure list rules in `fileListing.ts` (`kindAndSize`, `changedLabel`, `newestFirst`, `groupByRecency`, `filterTopics`). `src/sessions/mention.ts` carries Mention to the open message box
- The Tasks tool's presenters: `TasksList` (one list in three groups, two lines per task narrow and a table wide, by container width), `TasksToolHeader` (Backlog and Done with counts, search, filters), `NewTaskRow`, `BacklogList` and `DoneList`, `TaskInTool` with `TaskFact` and `OverflowMenu` (one task, its facts beside or below), `TaskSessionView` (a task's transcript with each run a divider, and the box that sends into it); the grouping, ordering and wording are pure functions in `taskGroups.ts` and `sessionRuns.ts`
- **The Boards tool's presenters** (`ui/src/board/`, adr-0097):
  - `BoardsList` with `ColumnBar` and `SprintTag` — a project's boards, Project Tasks first, each with its column bar, counts, current sprint and what needs you
  - `BoardBox` — an opened board's box: the sprint, past sprints, Finish sprint, Rename sprint, the Columns · Timeline switch; `FinishSprintForm` (nothing chosen until a destination is picked), `NewBoardForm`, `EditColumnsModal`
  - `BoardColumnsView` — the columns in one of three layouts by width: `KanbanColumns` (dnd-kit, side by side), `StackedColumns` (groups, Done folded), `ChipColumns` (a phone, one column at a time); `ColumnHeader`, `BoardCardView`, `ShowAlsoChoices`; `ColumnMenu` (every column's ⋯: starts work, the Backlog's Show also… and Hide, Done's Show or Hide) with `useBacklogFold` (the Backlog folded away, remembered per board in the browser)
  - `RoundLineBar` — one line above the columns of a board whose project throttles: the round in progress, or the next
  - Pure rules in `cardState.ts` and `columnsModel.ts`
- **The Timeline's presenters** (`ui/src/timeline/`, adr-0098): `Timeline` with `TimelineToolbar`, `TimelineRows`, `TaskBar` (a task's plan as its bar, ▶ its start, its runs as slices; dragging changes only the plan) and `TimelineAgenda` (the narrow and phone view); pure rules in `layout.ts` (the chart's range, its width and scroll position), `rows.ts` and `agenda.ts`

**`ui/src/files/`** (`@agenthix/ui/files`, adr-0155) — the renderer boundary:
- `FileFrame` — the frame around every file shown: breadcrumb, title, facts line, Mention, Download (a link through the relay, greyed only when the relay or the site isn't answering), ⋯ (Copy link, Copy path, Open full screen), and every state in words (`frameStates.ts`); opened or embedded (a card for a kind whose renderer does not embed). Takes hq's open answer and callbacks
- The registry (`RENDERERS`, `createRegistry`) and the `Renderer` entry: a renderer is given the file's facts and its bytes, and reports one state; each lives in `renderers/<name>/`. `createFileBytes` reads a ticket link by range, with no credentials, aborted when the renderer unmounts

**`ui/src/sessions/`** — session/chat-domain composites:
- `ChatPanel` — width-responsive master-detail chat panel (session list + chat view, two-pane or single-pane by width)
- `PanelSessionList`, `PanelChatView` — the two panes `ChatPanel` composes; also usable standalone
- `PanelActivityList`, `PanelActivitySession` — the running-agents activity panel and its single-session detail view (read-only)
- `SessionTranscript` — a session's record drawn as a conversation draws it (who replied and when, the work line, approvals, failures, icons under each reply) with the run in progress live; every view of a run's conversation uses it, passing only the actions it offers. `SessionUsageButton` — the total usage behind a header icon
- `TaskSessionSection` — a task's execution/session card (run state, run count, last message)
- `SessionComponents` — `AgentAvatar` and `formatTime`
- `ManifestApprovalBubble`, `ManifestApprovalComment` — HITL manifest approval UI, in the chat stream and in a task comment respectively
- `ClosedConversationNotice` (presenter — takes `ClosedConversationNoticeCopy`; the app composes the words, for the same reason as `UnansweredSitesNotice` above) — what a closed conversation shows in place of its message box (adr-0076)
- `ConfirmDialog` — generic confirm/cancel modal
- `socketHooks` (`useSiteSocketListener`, `subscribeToSession`, `subscribeToTask`, `subscribeToBoard`), `useStreamingText` — session-panel hooks and helpers, not components

### `@agenthix/ui/products`
| Component | Description |
|---|---|
| `ProductCard` | Grid card presenter — name, slug, status badge, project count |
| `ProductsListContent` | Grid + empty state + optional "New Product" create modal |
| `ProductDetailHeader` | Name, slug, status badge, optional vision statement |
| `ProductDetailTabs` | Tab nav — Overview, Settings |
| `ProductOverviewTab` | Projects list + task health bar + create/assign project modals |
| `ProductSettingsTab` | Edit form (name, slug, description, vision, status) + delete confirmation |
| `ProductDetailContent` | Composes header + tabs + content |

### `@agenthix/ui/programs`
| Component | Description |
|---|---|
| `ProgramCard` | Grid card presenter — name, status badge, project count |
| `ProgramsListContent` | Grid + empty state + optional "New Program" create modal |
| `ProgramDetailContent` | Full program detail — edit, delete, project management inline |

**`ui/src/agents/`** — agent-domain composites:
- `CreateAgentModal`, `ModelSelect` / `ModelOptions` (with `modelOptionLabel`, `filterModels`, `groupByProvider`), `sanitizeHandle`
- `AgentManageHeader` and the manage tabs: `ConfigurationTab`, `PromptTab`, `SkillsTab`, `VoiceTab`
- `AgentPermissionsView` (`permissions/`), `PermissionsSummary`, `BypassedMark`; the pure rules in `permissionsModel.ts`
- `AgentOverrideForm`, `ProfileCard`
- A project's agents: `ProjectAgentView`, `ProjectAgentEdit`, `ProjectAgentRemove`, `ProjectAgentAssign`; `nowLine` (`agentNowLines.ts`)
- `MODEL_PRICING`, `formatCost`, `calculateCost` (`aiMetrics.ts`)

**`ui/src/people/`** — person-domain composites:
- `PersonAvatar`, `PersonProfileCardView`
- A project's people: `ProjectPeopleList`, `ProjectPersonView`, `AddPeopleView`, `RemovePersonView`, `ProjectPreviewView`
- Pure rules: `isLastAdmin` (`lastAdmin.ts`) and the wording in `personLines.ts` (`orgRoleLabel`, `projectRoleLabel`, `personStatusLine`, …)

**`ui/src/voice/`** — voice calls:
- `VoiceCallProvider` / `useVoiceCall`, `useVoiceSession`
- `VoiceControlPanel`, `VoiceButton`

**`ui/src/brand/`** — `Logo`, `Logomark`, `Wordmark`

**`ui/src/dashboard/`** — `StatsCards`, `RecentProjectsList`, `TopAgentsList`, `AgentCostList`, `FinancialOverview`,
`TaskOverviewBar`, `ActivityFeed`, `RunsOverview`, `SystemLoadIndicator`, `SiteFilterBar`, `DashboardLayout` /
`DashboardCard`. Exported as `@agenthix/ui/dashboard`, but nothing in hq imports it today.

When adding a new component here, add it to this list.

---

## Pointers

- Theme tokens: [`src/theme/tokens.css`](src/theme/tokens.css)
- Component sources: [`src/primitives/`](src/primitives/), [`src/tasks/`](src/tasks/), [`src/projects/`](src/projects/), [`src/agents/`](src/agents/), [`src/people/`](src/people/), [`src/sessions/`](src/sessions/)
