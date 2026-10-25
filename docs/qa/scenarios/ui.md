# Scenarios — `ui/` (`@agenthix/ui`)

> Module contract: what `@agenthix/ui` promises to its consumer, `hq/` (`hq/src/`); `site/` does not depend on it.
> The agent proposes changes (additions, rewordings, removals); a human reviews and approves — see [`../README.md`](../README.md).
> Exercised through consumers — no in-repo test runner.

---

## Theming + tokens

- Design tokens cascade from `theme/tokens.css` to consumers.
- Light is the default theme, with no attribute on the root element; `data-theme="dark"` on the root applies dark, and `data-theme="light"` selects light explicitly. Both are defined for every token.
- Component files contain no hex literals — all colours go through tokens.

## Brand

- `Logomark` renders SVG at the expected size and colour token.
- `Wordmark` renders SVG with the correct font + colour.

## Primitives

- `Button` variants (primary / secondary / ghost) render with token-driven styles.
- `InlineEdit` opens on focus, commits on blur, cancels on Escape.
- `NativeSelect` renders + emits change events through the standard form interface.
- `StatusBadge` renders a task's status as a label, with its colours from tokens.
- `PlaceAvatar` draws a project's initial, or a board mark, on a colour derived from the item's id, at the size asked for.
- `PanelItem` draws an item of the Notifications and Runs panels in two lines with its time, one action and, where given, a ✕; the whole item is tappable, and its action and ✕ do not open it. `PanelGroupHeading` heads a group with its count.
- `ViewHeaderRow` lets a view inside a tools panel replace the panel's header row with its own, so the panel keeps one header row.
- `SearchField` and `FilterSelect` are the search box and filter used alike by the conversations list and the Tasks tool.

## Domain components

- `ProjectCard` renders name + progress bar + completion percentage.
- `TaskRow` renders title + status pill + assignee.
- `RunStateBadge` shows a task's run state with one label wherever it appears — Queued, Throttled, Running, Needs you or Run failed — and nothing when no run is pending or the value is unknown; it takes its colours from tokens.
- ~~`AutomationSection` presents a boundary's automation: its own choices beside the organisation's values, any value limited by the organisation marked as such, the last round and what it started, and the next round's earliest time; it is read-only for a person who cannot change it.~~ **Retired 2026-10-07** — the component is gone; a place's automation is shown by the Automation tool (below, and **SC-511**, **SC-512** in [`hq.md`](hq.md)).
- `AutomationOverview`, `AutomationRoutines` and `AutomationRules` present a place's Automation tool: its status with Pause or Resume, what runs and what is stuck now, the Routines and Rules views and what starts later; each is read-only for a person who cannot change it.
- `TasksList`, `TasksToolHeader`, `TaskViews`, `TaskInTool` and `TaskSessionView` present the Tasks tool: the three groups, Backlog and Done, a task with what waits and its comments, and its session with each run as a divider; one layout narrow and one wide, chosen by the width they are given.
- `RoutineForm` presents the form that creates or edits a routine, with the schedule fields shared with the task's start-time editor (`TaskScheduleEditor`); `RoutineSentence`, `RoutineNextRound` and `RoutineFacts` present what a routine does and its next round, `RoutineRoundList` its rounds newest first, and `RoutineSquares` its last rounds at a glance.
- `KanbanColumns` (through `BoardColumnsView`) lets a card be dragged from one column to another, except a card whose run is active.

## Conversation components (added 2026-10-12)

- **SC-783** — `conversationItems` turns a conversation's record, already in reading order, into the items the screen draws: a person's message (marked waiting while its run is still pending), an agent's reply with the run's tool lines, thoughts and ending behind it, an approval, a marker where the runtime summarised, and a marker where the model changed (placed before the message that began the run); a run that did nothing and wrote nothing draws no reply, and a person's old approval-answer message is not drawn.
- **SC-784** — A failed or stopped run is worded for a person: `failedReason` is the reason's sentence in lower case without its full stop, `stoppedBy` says "by you", "by" the named person, "for a newer message", "at its time limit" or "at its turn limit", and `modelName` gives a known model's label and otherwise the id without its provider prefix.
- **SC-785** — `ApprovalCard` shows a waiting request as a card that says what the agent will do and why, in plain words, first two items with "+ N more", with Approve (which allows all of them) and Deny (with an optional reason); once answered it folds to one line — approved or denied, by you or by whom, when, and the items — that opens to the same card with "for this run only" or "Nothing ran", the reason and a link to the run; a request replaced by a newer message reads "Not answered". Where the person only reads, a waiting request shows what it asks without the buttons.
- **SC-786** — `WorkLineFold` shows one run's work as the folded line and opens to its plain steps in order, each with a glyph for what kind it was, thinking in italics, commands in monospace, steps of one kind folded behind a list that opens in place, and a change linking to the thing it changed where the screen can open it.
- **SC-787** — `MemoryBar` draws the agent's memory as a bar filled to its share of the window, in the accent colour with room, the warning colour from 70% and the danger colour from 90%, with a tick where the runtime summarises by itself; the conversation's popup row gives the share and the tokens with "as of the last reply" or says it is not known yet; from 90% a quiet notice appears above the message box; **Summarise now** is disabled, with its reason, while the agent is working; `SummarisedMarker` says who summarised (you, a named person, or the agent to make room) and opens to what the agent remembers now.
- **SC-788** — Under each reply `ReplyActions` always shows Copy, Usage (a popup of tokens, estimated cost, energy and CO₂, saying they are estimates and that the cost is not known for a model without a price) and Details (the run's page), each at least tap-sized on a phone.
- **SC-789** — `SessionTranscript` draws a session's record as a conversation draws it, with the run in progress live — its tool calls and thinking as they happen, the reply streaming in, the seconds worked, and a request for approval — and reads the record again when the run ends; each view of a run's conversation passes only the actions it offers.
- **SC-790** — `mentionInMessage` puts a reference into the message box of the conversation open beside the caller and says whether a box took it.

## Agents, people and places (added 2026-10-12)

- **SC-791** — `PlaceCard` shows what is happening now with its state first and in its own colour (Needs you, Running, Idle, Quiet), its facts in order with any fact given an action acting on its own without opening the card, and one action; `ProfileCard` opens beside what was tapped, under it when there is room and over it otherwise, kept on screen, as a sheet from the bottom on a phone, and Escape or a click outside closes it and returns focus to what was tapped.
- **SC-792** — `nowLine` gives the state that matters most with its detail — "Needs you" and what for, "Running" and what and for how long, or "Idle" and when it next starts; `whenText` says "today 09:00", "tomorrow 09:00", a weekday within the week, or a date; `tasksLine` counts "To do · In progress · Done" or says "No tasks here".
- **SC-793** — The People tool's one status line says what waits on a person ("Needs Dana", or "Needs you" for the viewer, with the task), what they are running, or when they were last here or that they are not active yet; roles read Admin and Member in the organisation (a person gone reads "Former member") and Member, Viewer and Admin in a project; `localTimeBeside` gives their local time beside the viewer's, "same time as you" or hours ahead or behind; and a project's last admin carries no remove, leave or role control, because no project may be left without an admin.
- **SC-794** — The permissions view's draft has one shape at every level: the organisation's can be set to anything; a project's or a person's can only take away, so a line is offered only its limit and every stricter state, a preset or a group change never loosens the organisation's, Bypassed hides the tool list and counts nothing below it, **the organisation's** undoes every narrowing, a changed list that matches no preset reads Custom, and saving sends the organisation's whole list but, below it, only what is stricter — nothing at all (null) where it leaves the organisation's.

## Boards and the timeline (added 2026-10-12)

- **SC-795** — A board card's state reads "Needs you", "Running · 12 min", "Not started", "Done Tue" or the scheduled start, with its tone; the counts under a board's bar read "Backlog 3 · To do 4 · In progress 2"; sprint dates read "6–20 Oct" or "30 Sep – 13 Oct" and the time left "N days left", "1 day left" or "ends today".
- **SC-796** — A board's places are its Backlog first and then its columns in their order, each with its cards; the columns draw side by side with drag and drop where there is width, stacked in groups with Done folded in the middle, and one column at a time on a phone, chosen by the width the view is given; the Backlog can be folded away and the choice is remembered, and a column's menu can switch whether it starts work.
- **SC-797** — The timeline places a plan on whole UTC days: the week scale has a column a day, month a column a week from a Monday, quarter a column a month, with the chart as wide as the dates it covers and room before today and a screen after it; a plan's bar runs from its first day to the end of its last (either date alone is one day), a run is a slice that reaches now while it is running, a bar partly out of range is clipped and marked; dragging moves a plan by whole days or changes one end without passing the other, and changes only the plan.

## Files and cards (added 2026-10-12)

- **SC-798** — The Files tools list newest first (what has no time after, by name) in Today, This week and Older, hide names that start with a dot, show "Markdown · 2 KB" (a folder is just "Folder", an unknown size is left out), and word a change as a time today, "Yesterday", a weekday, "last week", "N weeks ago" and then a date. *(Changed 2026-10-26: Knowledge is no longer one of these lists; its pages, filters and search are hq's, **SC-1426** and **SC-1428**.)*
- **SC-799** — A card — a bordered tile that stands on its own, such as a project, team, site or product — shows hover and focus by its border turning the accent colour and never by a grey fill, a chosen card keeps the accent border, and a row in a list, a menu item or a button highlights with the grey fill.

---

## Out of scope

- Storybook / direct unit tests on components — components are exercised through hq's tests, including its Playwright e2e suite (`hq/e2e/`).
- Visual-regression / pixel-diff tooling — separate audit.
