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

## Files: the frame and its renderers (added 2026-10-27)

A file is drawn only by a renderer behind one boundary: it is given the file's facts and a way to read its bytes through the relay and reports one state, and the frame draws everything around it. `@agenthix/ui/files` holds the registry, the contract, the frame and the renderers.

- **SC-1578** — The frame words eight states: (1) no renderer for the kind; (2) past the renderer's cap with part shown, the renderer under a line saying so; (3) past the cap with nothing useful to show; (4) looks like text but is not, by its name or by the renderer's report; (5) a PDF with no files address; (6) changed while open, where *Show the new version* opens it again; (7) the site's relay is not answering, naming the site and the relay from the answer, with *Try again* and Download greyed; (8) the site is not answering. Download is a link in every state but 7 and 8. · fulfils AC-390c
- **SC-1579** — Around the renderer the frame says *Loading…* while the answer is asked for, draws the breadcrumb, the title and a facts line with the kind's own fact (code by its language), offers *Mention* and ⋯ with *Copy link*, *Copy path* and *Open full screen* as the caller gives them, shows ‹ back in the header row with no breadcrumb when narrow, and mounts the renderer afresh for a new version, aborting the old one's reads. · fulfils AC-390a
- **SC-1580** — The frame never makes an `href` of a link that is not an http(s) address or a path. · fulfils AC-392d
- **SC-1581** — An embedded file is drawn as a card for a kind whose renderer does not embed, which opens it on a click, and with no controls for a renderer that embeds; the card says why when the file cannot be shown. · fulfils AC-392c
- **SC-1582** — A renderer reads bytes through the relay link: the first bytes with a `Range` request and no credentials (whole when the limit covers the file, stopping at the limit when the relay ignores the range, an empty file whole), a range by its inclusive offsets (cut out of a whole answer), a 409 as *changed*, a network failure or a refusal as *unavailable*, the abort signal passed on with an aborted read staying an abort, and a limit or range that means nothing refused. · fulfils AC-390c
- **SC-1583** — Text is drawn wrapped, as text and never as HTML, with its line count (one line for a file with no newline, none for an empty file); it reads at most 1 MB and shows the first 1 MB of a larger file under a line saying so; a multi-byte character cut at the cap is not called bytes that are not text; bytes that are not text are said in words, a 409 is the changed state and an unavailable relay is the relay state. · fulfils AC-390b
- **SC-1584** — Markdown is drawn as a page through the caller's Markdown renderer with its line count, switching to *Source* — the text as written, never as Markdown or HTML — and back; it reads at most 1 MB and reports partial past it, says bytes that are not text in words, turns a 409 into the changed state, embedded is a card since only images draw inside a page, and without a caller's renderer the text is drawn as text. · fulfils AC-390b
- **SC-1585** — Code is highlighted as spans of text with line numbers and its language named in the facts line, with colours taken from the design tokens and no hex value on the page; *Wrap* is off by default and can be turned on; a language the highlighter lacks is drawn with line numbers and no colour; a file past 512 KB is drawn plain with a line saying why and all of it is shown up to 1 MB; it reads at most 1 MB and says so for a larger file; bytes that are not text and a changed file are said in words. · fulfils AC-390b
- **SC-1586** — JSON is drawn as a tree folded below the first level with its fact in the facts line, each fold opened and closed from a keyboard-reachable button, *Text* showing the file as written and *Tree* going back; every value is drawn as text, never as HTML; invalid JSON is drawn as text with the line of the problem; it reads at most 5 MB and draws a larger file as its first 5 MB of text under a line saying so; a long array shows 200 children at a time. · fulfils AC-390b
- **SC-1587** — CSV is read to RFC 4180 — quotes, escaped quotes, commas and newlines inside fields, CRLF, a lone CR, a missing final newline, a byte order mark, blank lines in the middle kept as empty rows, an unterminated quote read to the end — and the first rows past the cap are kept and all counted. · fulfils AC-390b
- **SC-1588** — A table is drawn with a header, row numbers and the cells, the row count in the facts line, sorted by a column (numbers as numbers), then reversed, then back to the file order; every cell is drawn as text; 10,000 rows of a larger table are shown with a line saying how many there are; it reads at most 5 MB, dropping the row the cut fell in and reporting the part shown; it scrolls sideways inside its own area. · fulfils AC-390b
- **SC-1589** — An image is drawn from its preview link with no referrer, with its pixel size in the facts line once loaded (left out when an SVG has none), fitted to the area with *Fit* / *100%* to switch, on a checkered ground made from a token; an image that will not load is said unreadable, a file over 20 MB is not loaded and said too large, and embedded it has no controls and is at most 480 px tall. · fulfils AC-390b
- **SC-1590** — A PDF is the registry's entry for `pdf`: framed, up to 50 MB, a card when embedded; the viewer page on the files address is framed sandboxed with the least it needs and the ticket in the address fragment (the page's theme told to it); the page count and reports come from the viewer on the files origin and messages from any other origin, window or shape are ignored; a PDF it cannot read is said in words for a PDF, one page is said as one page, a PDF past 50 MB is said too large and nothing is framed, nothing is framed for a link that is not a ticket on an http(s) files address, and with no files address the frame's state 5 applies. · fulfils AC-390b
