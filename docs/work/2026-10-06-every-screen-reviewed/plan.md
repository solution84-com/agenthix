---
created: 2026-10-06
description: How hq becomes conversation-first. The shell, the places (projects and the personal space) with their conversations and tools, and Home are built in slices by agents, while the next screens are designed with the owner.
---

# Implementation Plan · Agenthix is usable — every screen reviewed

**Branch:** `feature/every-screen-reviewed` ·
**Spec:** [`spec/README.md`](spec/README.md)

## Goal

hq works the way a person uses it: they talk to agents in a place (a project, or their personal space shown as
Chat) with the place's tools beside the conversation. Home is where they start talking, and notifications and
runs are a click away from any screen.

**In scope:** the shell, both kinds of place with their conversations and tools panel, Home, and the small new
behaviour they need (spec: [README](spec/README.md)). Further design passes are also in scope, added to phase 3 as each screen is
agreed: each tool's own design, Automation among them, and Execution Sites.
**Out of scope:** the items the spec defers (spec: [Not in this pass](spec/README.md#not-in-this-pass)): "Show in" links, structured items in a conversation,
several agents in one conversation, an organisation-wide agent, and project status. Each is a large change or a
nice-to-have, or was not wanted.

## Approach

**Conversation-first is a re-layout, not a rewrite.** The data behind every screen already exists. Conversations
are `AgentSession` rows, places are projects (a personal project is one too), and runs, tasks and notifications
are what today's panels already read. The work replaces the frame: today's top bar, global right panel and
project tab bar give way to a navigation with twin panels, a screen bar, and a tools panel per place. Today's
views move into the new frame largely as they are. The tools' own views keep their current content inside the
panel until each gets a design pass. That keeps the first slice small enough to use quickly, which is the point
of the way this unit is worked.

**A place is one thing in the client.** Projects and the personal space differ only in their facts, their tool
list and which agents can be talked to. So the conversations list, the conversation screen, the tools panel and
the layouts are built once and given a place. Chat is the personal project shown through the same components.

**The new behaviour is server work with clear seams**, built test-first against the real database (adr-0094),
mostly on code that exists. Placing a conversation in a project uses `createSession`'s primary location. A
place's Stop all builds on `stopProjectRuns`. Waiting-task notifications attach to where a task's run state
becomes "Needs you". Pins and a project's lead are small schema additions. Nothing needs data carried forward:
before the first release, development databases are reset.

**The design keeps moving while the build runs.** The owner and the lead design the next screens on the living
mockups while agents build what is agreed. A design change to built work corrects the spec in place, and its
follow-up becomes a numbered task here.

**How the work is carried out**

- **Lanes, no execution plans**: one purpose, branch, worktree and agent each, from a short
  brief citing the task numbers and spec sections, with one shared rules file. Lanes branch from
  `feature/every-screen-reviewed` and merge back into it `--no-ff`, one at a time, each rebased onto the branch
  head first, with its fixes folded in.
- **Models per lane:** Opus for the shell frame and for the server behaviour (permissions on Stop all, which
  agents a project conversation may use); Sonnet for the theme tokens and for the screens built on the agreed
  frame. The lead stays on Opus.
- **Resources:** at most three lanes at once. Typechecks, tests and builds run under the machine-wide lock. Lanes
  run the tests they touch, and their modules' full suites once before reporting. The lead runs the cross-app
  suite and the end-to-end tests after merges, watches free memory and swap, and pauses the newest lane first at a
  limit.
- **The owner walks through each phase** in the running app once it merges into the branch. Findings become
  numbered tasks in the phase they belong to.
- **The branch merges to `main` once, at the close, with the owner's approval** — unless the owner chooses to
  land a phase earlier. The mockups stay in the unit's `execution/` folder and are not committed.

## Decision records

| | Records |
|---|---|
| **Depends on** | [adr-0039](../../adr/adr-0039-files-and-workspaces.md) (a run's primary location), [adr-0041](../../adr/adr-0041-chat-session-privacy.md) and [adr-0077](../../adr/adr-0077-within-a-boundary-a-running-chat-is-visible-its-content-is-not.md) (a chat's content is its owner's), [adr-0089](../../adr/adr-0089-every-task-runs-on-behalf-of-a-person.md) (who a waiting task notifies), [adr-0093](../../adr/adr-0093-hq-is-organised-by-feature.md), [adr-0094](../../adr/adr-0094-hq-operations-are-tested-against-the-real-database.md) — all Accepted |
| **Implements** | [adr-0096](../../adr/adr-0096-a-conversation-belongs-to-a-place.md): **a conversation belongs to a place** — a project or its person's own space — and a project conversation uses that project's agents. [adr-0095](../../adr/adr-0095-a-run-is-on-behalf-of-whoever-started-it.md): **a run is on behalf of whoever started it**, the task's person the default for runs nobody started (refines adr-0089). [adr-0097](../../adr/adr-0097-a-board-is-a-lasting-workflow.md): **a board is a lasting workflow**, Project Tasks on every project. [adr-0098](../../adr/adr-0098-a-task-has-a-plan-apart-from-its-schedule.md): **a task has a plan apart from its schedule**, with epics and milestones. [adr-0103](../../adr/adr-0103-a-team-joins-a-project-as-one-member.md): **a team joins a project as one member**, written through to its members. [adr-0104](../../adr/adr-0104-a-routines-round-starts-at-its-time.md): **a routine's round starts at its time**. [adr-0105](../../adr/adr-0105-a-run-uses-the-login-of-the-person-it-is-for.md): **a run uses the login of the person it is for**. [adr-0106](../../adr/adr-0106-each-service-keeps-its-own-logs.md): **each service keeps its own logs** |
| **Revisits** | None. hq's `app-layout` skill, which describes today's shell, is rewritten in phase 1 (it is a skill, not a record) |

## Key decisions

| Decision | Why |
|---|---|
| Today's tool views go into the panel unchanged for the first slice | Each tool gets its own design pass once the frame has been used; redesigning them all now is the up-front design the owner ruled out |
| One set of place components for projects and the personal space | They differ only in facts, tools and allowed agents; two sets would drift |
| Chat is the personal project, not a new kind of thing | The personal project and project-less chats already share the person's storage; a new kind would duplicate them |
| Against: keeping the global right panel for chat and runs | It competed with the tools panel for the same side and made chat a panel instead of the main workspace |
| Against: dragging to resize the tools panel | Four named layouts do the same with one control, work on touch screens, and need no precise widths |
| Against: notifications and runs merged into one panel | They answer different questions; one count could not say whether the person is needed or work is just running |
| Against: a top-right bell | The top right holds the layout control and the tools panel; the person's notices belong with the navigation, which is on every screen |
| Pins stored in hq, not the browser | They must follow the person to their phone |
| The layout remembered for the person | Same reason as pins |

## Work breakdown

### Phase 1 — The frame

**Delivers:** the new shell around today's pages: navigation with pins, Notifications and Runs as twin panels,
the screen bar, light by default. Also the server behaviour the screens need.
**Starts when:** the spec and this plan are committed on `main` and the branch is cut.
**Execution plan:** none — lanes: three in parallel (frame, theme, server behaviour); the steps follow from the
spec and the code.

- [x] 1.1 Light theme tokens in `ui` and light as the default; the type scale (spec: [shell](spec/shell.md#look))
- [x] 1.2 Navigation: places, Pinned, Organisation and Settings at the foot; collapsed strip; mobile drawer (spec: [shell](spec/shell.md))
- [x] 1.3 Notifications and Runs buttons beside the logo, each opening its panel beside the navigation; mobile header (spec: [shell](spec/shell.md), [notifications-runs](spec/notifications-runs.md))
- [x] 1.4 The screen bar with in-app breadcrumbs; today's top bar and global right panel removed; voice moved to the message box (spec: [shell](spec/shell.md))
- [x] 1.5 Activity renamed Runs everywhere (spec: [notifications-runs](spec/notifications-runs.md))
- [x] 1.6 Pins: stored per person, pin, unpin, reorder; default avatars for projects and boards (spec: [shell](spec/shell.md))
- [x] 1.7 Project lead: field, shown in facts, set in project Settings (spec: [settings](spec/settings.md))
- [x] 1.8 First agent added becomes the project's default (spec: [agents](spec/agents.md))
- [x] 1.9 Stop all for one place (spec: [tools-panel](spec/tools-panel.md))
- [x] 1.10 Conversations placed in a project; a project conversation uses only the project's agents (spec: [conversations](spec/conversations.md))
- [x] 1.11 A waiting task notifies the person it runs on behalf of (spec: [notifications-runs](spec/notifications-runs.md))
- [x] 1.12 The layout preference stored for the person (spec: [shell](spec/shell.md))
- [x] 1.13 hq's `app-layout` skill rewritten for the new shell
- [x] 1.14 The type scale applied across hq and ui: sizes, weights and labels (spec: [shell](spec/shell.md#look))
- [x] 1.15 The collapsed navigation keeps Organisation and Settings (spec: [shell](spec/shell.md))

### Phase 2 — The places and Home

**Delivers:** a project and Chat as conversation-first places with the tools panel and four layouts, and the new
Home, together with the navigation changes they bring.
**Starts when:** phase 1 is merged into the branch and the owner has walked it through.
**Execution plan:** none — lanes: the place screens first (they set the components), then Chat and Home in
parallel.

- [x] 2.1 Place conversations list: header, agent filter, search, grouped rows, message box (spec: [conversations](spec/conversations.md))
- [x] 2.2 Conversation screen: replaces the list, title renamed in place, fixed agent, today's chat features (spec: [conversations](spec/conversations.md))
- [x] 2.3 Tools panel: facts and grouped tools, one tool open at a time, today's views inside, Run all and Stop all (spec: [tools-panel](spec/tools-panel.md))
- [x] 2.4 The four layouts in the screen bar (spec: [shell](spec/shell.md#layouts))
- [x] 2.5 The project tab bar and Overview page removed; their parts moved as spec: [tools-panel](spec/tools-panel.md) lists
- [x] 2.6 Mobile: the full-screen Project / Space page, and its tools as full screens (spec: [conversations](spec/conversations.md))
- [x] 2.7 Chat as the personal space: any agent, its facts (Site hidden until placed), its tools (spec: [conversations](spec/conversations.md#chat--the-personal-space))
- [x] 2.8 Home: greeting, focused message box starting a Chat conversation, signal buttons, Jump back in (spec: [home](spec/home.md))
- [x] 2.9 Runs panel: personal filters and groups (spec: [notifications-runs](spec/notifications-runs.md)); the Runs screen with the organisation-wide Stop all for admins
- [x] 2.10 Products, Programs and Library inside Organisation; a product and programme filter on Projects; today's dashboard on its own page for admins (spec: [shell](spec/shell.md), [Not in this pass](spec/README.md#not-in-this-pass))
- [x] 2.11 The decision record: a conversation belongs to a place (adr-0096)

### Phase 3 — Further design passes

**Delivers:** each further screen, designed with the owner and then built. Tasks are added here, numbered in
order, as each design is agreed: each tool's own design, Automation among them, and Execution Sites.
**Starts when:** the screen's design is agreed. A pass may start while phase 2 is still being built.
**Execution plan:** none — lanes, one per agreed screen.

- [x] 3.1 The Automation tool as agreed (spec: [automation](spec/automation.md)): status and Pause, Now, Routines and Rules views, Later; archive finished tasks and the run time limit in project Settings
- [x] 3.2 Every screen's content on white, the navigation grey (owner's walkthrough)
- [x] 3.3 The usage line under each reply in grey (owner's review)
- [x] 3.4 The Tasks tool as agreed (spec: [tasks](spec/tasks.md)): the groups with Backlog and Done at the top, the Backlog and Done views, new task into the backlog, a task inside the tool with what waits in its session and its comments, the session inside the panel with a box to step in, and Your tasks
- [x] 3.5 Shared task sessions (spec: [tasks](spec/tasks.md)): names on messages, a run on behalf of whoever started it, anyone who may start runs may approve, the agent reads the comments new since its last run
- [x] 3.6 The Tasks walkthrough: one header row in the panel (Tasks and Automation views), controls styled alike, no New conversation button or list heading, the session's runs in time order, a task's own page and breadcrumbs on pages, the phone header
- [x] 3.7 The Notifications and Runs panels as agreed (spec: [notifications-runs](spec/notifications-runs.md)): two lines and one action, Needs you / Earlier, Waiting for you in Runs, seen when in view, items clearing themselves, a request inside the panel with long commands capped, the counts
- [x] 3.8 The Notifications and Runs walkthrough: one button per tile that acts at once, tap for the full request, seen without scrolling, the bell counts what is new, one item per task, plain reasons
- [x] 3.9 The Files tools as agreed (spec: [files](spec/files.md)): Files, Artefacts, Knowledge and Workspaces as four tools under a Files heading; a file or topic opened inside the tool with Mention; Edit as a placeholder; the workspace cards, a workspace opened inside the tool, New workspace in place; one quiet line for sites that do not answer
- [x] 3.10 What the Files tools need underneath (spec: [files](spec/files.md)): artefacts one file each, linked from the reply and opened in the viewer, listed for the view; hq reads `knowledge/`; `AGENTS.md` replaces PROJECT.md and `.agents/` replaces `.agenthix/`; no empty `history/` folder
- [x] 3.11 Boards as lasting workflows (spec: [boards](spec/boards.md); adr-0097): Project Tasks on every project, a task always on a board, Backlog as a column with Show also, sprint boards with sprints and Finish sprint, archiving instead of completing, "stages" renamed columns; agents' board and task tools to match
- [x] 3.12 A task's plan, epics and milestones (spec: [timeline](spec/timeline.md); adr-0098): start and finish dates apart from the start time, epics grouping tasks, milestones; agents' tools to match
- [x] 3.13 The Boards tool on screen as agreed (spec: [boards](spec/boards.md))
- [x] 3.14 The Timeline tool and a board's Timeline as agreed (spec: [timeline](spec/timeline.md))
- [x] 3.15 What the Agents design needs underneath (spec: [agents](spec/agents.md)): an agent's state per project and across projects, its instructions in a place read from that place's Files, "In this project" readable by members, Remove from a project with a required choice for its open tasks, assigning from the organisation to any project, usage by person, project and organisation
- [x] 3.16 The Agents tool, an agent's place, its profile card, Organisation › Agents, and the Agents and Projects screens' shared card on screen as agreed (spec: [agents](spec/agents.md))
- [x] 3.17 What the People design needs underneath (spec: [people](spec/people.md)): open projects open to join (adr-0099): only members act in a project or read its work, others see a preview; a person's display name and picture; organisation admins managing any project's people; Remove from a project with a required choice for their open tasks; leaving as Remove (deactivate), Reactivate and Erase, removal never deleting a project task's runs; invitations saying who they are for and naming projects to join
- [x] 3.18 People and Agents as two rows after the facts, Settings alone at the foot (Agents and People out of the tools list), People in a project, an open project's preview with Join, a person's profile card, Organisation › People (people, invitations, one person, leaving) on screen as agreed, replacing Settings › Users (spec: [people](spec/people.md))
- [x] 3.19 What an agent's permissions need underneath (spec: [agents](spec/agents.md#an-agents-permissions)): a project's and a person's narrowing hold Always, Ask or Never per tool, command patterns and approval, the strictest level winning for each; "autonomy" becomes approval (Bypassed, Deferred, Immediate) in the product and the code; the Unrestricted preset goes; Bypassed switches off the agent's own permissions for platform tools too (the person's authority still decides); a command matching no pattern follows Any other command, which presets set to Ask
- [x] 3.20 An agent's permissions on screen as agreed (spec: [agents](spec/agents.md)): one view at every level with approval first, presets and every tool, only the choices a level may pick; Permissions as its own section under Organisation › Agents, Permissions here in a project, Your permissions in Chat from Chat's Agents fact and Your settings; Bypassed confirmed and marked; a project's agents list opening the agent from the whole row
- [x] 3.21 The agent's card in context (spec: [agents](spec/agents.md#an-agents-place-and-managing-agents)): beside what was tapped, a part for where the person is, New conversation started where they are in place of Talk to it
- [x] 3.22 Viewer as a project role (spec: [people](spec/people.md); adr-0102): organisation roles Admin and Member, project roles Admin, Member and Viewer; a Viewer reads and changes nothing in the project, checked in the browser and for runs on their behalf (adr-0101); Add people, a person's page, invitations and Organisation › People to match
- [x] 3.23 Settings, Organisation › Settings and Organisation › Infrastructure as agreed (spec: [settings](spec/settings.md)): Settings one page of the person's own, with a password change (its change-password part); the organisation's admin pages under Organisation › Settings; HQ, sites, storage, the GitHub App's registration and diagnostics under Organisation › Infrastructure, admins only; the Organisation page's two groups
- [x] 3.24 What Execution Sites needs underneath (spec: [sites](spec/sites.md), [notifications-runs](spec/notifications-runs.md)): persistent notifications as a kind any feature can raise; a site's health reported over the channel (runs now and the most at once, disk free, Docker and the agent image); requests to connect capped in total and per address; the notifications for a machine asking to connect, a site needing upgrading, not connected with work waiting, HQ's own site not running, and Docker down or the disk nearly full
- [x] 3.25 Execution Sites on screen as agreed (spec: [sites](spec/sites.md)): the list grouped by what needs an admin with requests approved in place, each site's own page, the built-in site named HQ
- [x] 3.26 A project's Settings as agreed (spec: [settings](spec/settings.md)): each part a field only for those who may change it and text for everyone else, the key fixed once tasks exist, the default agent, where it runs, each part saving on its own, Delete for organisation admins only
- [x] 3.27 An approval is for the next run only (spec: [notifications-runs](spec/notifications-runs.md)): approving starts the next run for a conversation as for a task, carrying only what was approved; an unanswered request replaced by anything newer leaves every list; approving an outdated request never overwrites a newer run; a run's time-limit reason kept beside its request
- [x] 3.28 The Runs screen as agreed (spec: [notifications-runs](spec/notifications-runs.md#the-runs-screen)): Show all from the panel; the person's runs 25 at a time with filters and search, one read per site per page; one run beside the list with its own address; its facts, approvals and tool calls with risk labels, each opening to its input and output; the empty states; the panel's reads once per site
- [x] 3.29 The Projects screen's three views as agreed (spec: [projects-screen](spec/projects-screen.md)): Projects, Boards and Workspaces with the view in the address; the boards and workspaces of the person's projects, each opening in its project's tool; a card's boards link; ＋ New project ▾ with New board and New workspace; a workspace's own address in its place, with `/workspaces/<id>` forwarding there and `/boards`, `/workspaces` going to the views
- [x] 3.30 What the Organisation design needs underneath (spec: [organisation](spec/organisation.md); adr-0103): an organisation's and a team's cover, picture and handle; teams whose members are people and agents; a team joining a project as one member, written through to its members, removed as a unit and following the team's changes; Needs attention for admins from the notifications, with the persistent, acknowledgeable Bypassed item; Today's numbers; every library item — agent, board, skill, team template — one package recording its source, version and publisher, with Export and Import; a team template of agents only; the built-in agent's proposed team as a notification for admins
- [x] 3.31 Organisation on screen as agreed (spec: [organisation](spec/organisation.md)): the page with its hero, Needs attention, Today, Where it runs, the workplace cards and Settings, who sees what, the Dashboard page gone; Teams as cards and a team's page; a project's Members view in place of People and Agents; Products and Programs with one opened; the Library's Agents, Boards, Skills and Teams with their sources, and its Marketplace tab as Coming soon; `/skills` to Library › Skills
- [x] 3.32 A routine as agreed (spec: [automation](spec/automation.md), [projects-screen](spec/projects-screen.md); adr-0104): a round with an agent starts at its time whatever its column, one without waits; a routine inside Automation at its own address (`/routines/<id>` forwards); its sentence, Run now, Skip this time, the last 10 rounds as squares, the notice after three failed rounds, Edit in place; the Routines view of the Projects screen with New routine from ＋ New project ▾
- [x] 3.33 What the conversation design needs underneath (spec: [conversations](spec/conversations.md#what-a-conversation-shows)): each reply records its run; a failed run written into the transcript with its reason, and Try again sending the same message again; the message box sending into a busy conversation by the person's Wait or Interrupt setting; an approval's answer recorded as the request's answered state; the runtime's context use, its summarising with the summary, forwarded from Claude and OpenCode, and Summarise now
- [x] 3.34 The conversation on screen as agreed (spec: [conversations](spec/conversations.md#what-a-conversation-shows)): who replied with a model change marked once; Copy, Usage and Details as icons under each reply, Usage as a popup; the work line folded and opened in order; a waiting message with Send now and Cancel; the approval card, its long list, and its folded answered state; a failure and a stop folded, with one Try again; the conversation's popup with its total and the agent's memory bar; the nearly-full notice, Summarise now, and the summarised marker; the phone
- [x] 3.35 A run uses the model access of the person it is for (spec: [settings](spec/settings.md); adr-0105): the project's own first when it holds one, then the person's own login, then their own key, in a project as in Chat, then the organisation's; a person's login only for a run that runs as them, their API key for a task's run in a project; `AGENTHIX_DEV_SHARED_SUBSCRIPTION` kept for development; the Settings and model-access screens' wording to match
- [x] 3.36 Every view of a run's conversation uses the conversation's pieces (spec: [conversations](spec/conversations.md#what-a-conversation-shows)): a task's session, the activity view and the Runs panel show who replied, the work line, approvals, failures and usage as a conversation does
- [x] 3.37 What getting in needs underneath (spec: [getting-in](spec/getting-in.md)): `./agenthix install` making every secret, writing both settings files paired, building and starting HQ and its site and printing the first-admin link; `SITE_ADMIN_KEY` gone for a one-time first-admin key, hashed with a 24-hour expiry, printed from `HQ_URL` and reissued on start or by `./agenthix invite-admin`, which also works when users exist; `./agenthix reset-password` and an admin's one-time reset link, ending other sign-ins and telling other admins; setup once per HQ; the organisation's identity read before sign-in, with an admin's choice of how much shows; signing in returns to the address first opened; sign-in attempts limited; an invitation's page reads the organisation, inviter and projects, accepting stores a name, pins the projects and lands in the first; accepting while signed in asks first; links from HQ's address; the built-in agent's instructions covering setup, its name kept neutral
- [x] 3.38 Getting in on screen (spec: [getting-in](spec/getting-in.md)): the sign-in page with the organisation's identity; setup's three steps with the site line; the first Home with suggestions; the invitation page and its model-access step; Forgot your password?, Reset password in Organisation › People and the reset page; the problem screens; a line under Home's message box and a Needs attention item in place of the global model-access banner; the phone
- [x] 3.39 Setup and onboarding, named and built apart (spec: [getting-in](spec/getting-in.md)): setup at `/setup` (today `/onboard`, the `onboarding` code and its "onboarding complete" names become setup's); both links are invitations at `/invite/<code>` with `/accept-invite` removed and no forwarding; onboarding for every invited person at `/onboarding` — Join, You (picture, time zone), Model access only when needed, a last look — in the organisation's identity, landing in their first project
- [x] 3.40 Logs and diagnostics (spec: [diagnostics](spec/diagnostics.md), [adr-0106](../../adr/adr-0106-each-service-keeps-its-own-logs.md)): an admins-only Infrastructure page with Health (HQ's own and each site's), Recent errors grouped with what to do, Logs per source read from a site over its channel, and the support bundle; structured rolling logs with secrets removed in HQ and the site; the public `/health` answers status only, the version added to `./agenthix status`; `/debug` and the debug page removed with no forwarding

## Deviations

| Phase | What changed | Why |
|---|---|---|
| 3 | After 3.40: HQ's own site named "HQ · Built-in site" wherever it is shown; one persistent notification per problem, kept through restarts and reopened when it returns; the bell counting open persistent notifications; an All sites link on Infrastructure; the fresh development HQ and the cross-app suite on storage of their own | The owner's walkthrough of logs and diagnostics: the built-in site was confused with HQ itself, a site that stayed down raised a second notification, the bell went dark while a site was still down, and the test suites' logs appeared in the development HQ's |
| 3 | Added 3.40, and adr-0106 | Logs and diagnostics designed and agreed: an admin can see what is wrong without a terminal on each machine; the debug page, built for development and open to every member, goes; a site's logs stay on the site and are read when asked; the public health check stops naming the exact version |
| 3 | Added 3.39 | The getting-in walkthrough: setup (once, the first admin, our brand) and onboarding (every invited person, the organisation's brand) are different things and are named apart; invited people get a short guided onboarding like setup's; invitation links are one address with no old one kept |
| 3 | Added 3.37 and 3.38 | Getting in designed and agreed: one command installs HQ and its site with every secret made and paired; a one-time first-admin link replaces the standing key; recovery without email through an admin or HQ's machine; setup once, in three steps ending on a working conversation; the organisation's identity on every way in. Addresses password recovery, which blocks release, accepting an invitation while signed in, and links built from HQ's address |
| 3 | Added 3.35 and 3.36, and adr-0105 | Setting up a fresh HQ showed that a team using subscriptions has no model access for project work, a run now uses its person's own login (the first question of who holds model keys). A task's run in a project runs as the project in a shared home, so it gets the person's key, not their login, until a task's run can run as its person; the development switch stays for testing. The conversation's new pieces were built for conversations only; the other views of a run follow |
| 3 | Added 3.33 and 3.34 | The conversation's content designed and agreed, feature by feature: the work line keeps every step in order inside one folded line; approvals and failures fold once answered, with one Try again at most; usage behind a click; the agent's memory read from the runtime, never HQ's transcript, with its summary visible and Summarise now. The owner's review found failures lost on reload and the busy-conversation setting doing nothing |
| 3 | Added 3.32, and adr-0104 | The routine design agreed: a task starts when its column starts work, when a person presses Run, or when its time comes — a routine's round is the last, like a start time, so a routine runs without a board built for it; routines become a view of the Projects screen |
| 3 | Added 3.30 and 3.31, and adr-0103 | The Organisation design agreed: an identity has a hero; admins see what needs them first; a team is people and agents and joins a project as one member; a project's people and agents become its Members; the Library designed with a marketplace in mind — one package format recording each item's source, and a Coming soon tab — while the marketplace itself waits for Agenthix Cloud and a decision on a self-hosted HQ reaching it |
| 3 | Added 3.29 | The Projects screen agreed: the cross-project boards and workspaces lists, kept because people need to see theirs across projects, become views of the Projects screen rather than returning to the navigation; a workspace gets an address in its place. Items as topics of many conversations folded into collaborative conversations, left for later |
| 2 | Lane fixes from the owner's walkthrough: the conversation on white, its message box and message look; a project's Runs tool keeps every run in the project | The owner found the conversation greyed out; a lane had narrowed the Runs tool to the person's own runs |
| 3 | Added 3.23 | The Settings design agreed: three owners kept apart — the person, the organisation as a workplace, the infrastructure; a separate infrastructure portal is host management's; who holds model keys raised for later |
| 3 | Added 3.22, and a decision record that a run is bounded by the person it is for (adr-0101) | Building Bypassed found that a run in a project carried no person's authority; Viewer read as a project role, and all work is inside a project |
| 3 | Added 3.19–3.21 | The permissions design agreed: one view at every level, "autonomy" renamed approval with Bypassed made hard to miss, presets below the organisation, permissions reachable from a project, Chat and the agent's card; the card offers what can be done with the agent where the person is. Tool risk rules and the built-in agent's Bypassed approval go to the Settings pass |
| 3 | Added 3.17 and 3.18 | The People design agreed: People in a project, opened, like Agents, from a row after the facts (agents and people are not tools), Organisation › People, a person's profile card; open projects open to join; leaving deactivates and erasing is separate, which fixes the loss of project task runs when a person is deleted; an audit log raised for later |
| 3 | Added 3.15 and 3.16 | The Agents design agreed: a project's Agents tool, an agent's place for using it, Organisation › Agents for managing it; each place has its own instructions; an agent's revenue, agents made inside a project and a record of who changed an agent raised for later |
| 3 | Added 3.11–3.14 | The Boards and Timeline designs agreed: this pass also changes the architecture — boards as lasting workflows, a task's plan, epics and milestones; a roadmap generated from the timeline raised for later |
| 3 | Added 3.9 and 3.10 | The Files tools agreed: Files, Artefacts, Knowledge and Workspaces; knowledge's format and editing by hand left for later, pruning old conversations raised for later |
| 3 | Added 3.3–3.5 | The owner's review of the built screens, and the Tasks design agreed; collaborative conversations and context size raised for later |
| 3 | Added 3.1 and 3.2 | The Automation design was agreed; the owner asked for every screen's content on white |
| 1 | Added 1.14 and 1.15 | The owner's phase 1 walkthrough: the type scale was defined as tokens but no screen used it, and the collapsed strip dropped Organisation and Settings |

## Closing note

**Closed 2026-10-12.** Accepted by the owner, who walked through every design pass in the running app; the full
regression passes (core, hq unit and integration, site unit and integration, the cross-app suite) and the browser
suite runs against today's screens.

- **Open items:** gathered from every lane report, the walkthroughs and the code, and checked against the code at
  close. Closed in the unit: the security items raised along the way (the debug page open to every member, the public
  health check naming the exact version, sign-in without a rate limit, a run on behalf of no one) and most findings.
  The rest were deferred, none blocking release, as new issues or as comments where an existing issue already
  held the work.
- **What the unit resolved:** password change and recovery, which blocked release; accepting an invitation while
  signed in; open projects open to join; the Organisation page's size; and the loss of project task runs when a
  person is deleted, among others.
- **QA:** the unit wrote its contract — stories US-220 to US-283, scenarios SC-540 to SC-799, older entries corrected
  or retired — and tagged the tests that cover them. No QA audit ran at close; the contract waits for the audit
  before release.
- **Decision records:** adr-0095 to adr-0106 carry their "Acted on" notes; every record the plan depends on is still
  Accepted.
- **History:** the unit's commits were regrouped by feature before the merge, one design commit then what each
  feature needs underneath and on screen, with the final tree identical to the history built during the unit.
