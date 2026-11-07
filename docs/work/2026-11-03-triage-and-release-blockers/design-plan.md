# Triage and release blockers — design pass plan

The whole platform's user experience, made tight with the owner before the early access release 0.1.0. Nothing is off
the table; the work is ordered by priority, the most complex areas first. It is its own plan beside the triage plan
(`plan.md`): the triage fixes what is broken or unsafe; this pass decides how the screens should look and work, and
builds that.

**It is the triage's phase 3, as polish.** It starts once the triage's fixes have landed (its phases 1 and 2), so the
security and bug fixes have stopped moving screens around, and finishes before the review of the hard items, the
proofs on real machines, the readiness check and the close.

## Approach

- **One area at a time, walked with the owner.** Each area is a group of screens a person uses together. The lead
  prepares its boards from the screens as built, the open findings and the area's design notes; the owner walks them.
- **Boards show today, then each change.** Each area starts with a *Today* board (the screens as built, each element
  numbered), then one board per change: *Before*, *After* and *Why* side by side. A new element says "New — nothing
  today".
- **Design first, questions last.** The lead proposes the whole area with a default for every choice; the owner
  reviews it, then answers what is left.
- **Settled boards become the build's baseline**, committed under `boards/<area>/`. The build goes feature by feature,
  shared components first, in lanes, and ends with the owner walking the built screens.
- **Feedback is High impact**, as the triage design defines it: it ranks after Security and Critical, and is never cut.
  Layout or look findings from any other walk join the matching area here.
- **A message is never part of the content's layout** (owner, 6 November, one rule for everything). What needs the
  person's attention (a failure, a refusal, a choice) opens as a dismissable dialog in the centre of the screen, with
  Try again where it applies; a refusal known in advance is said by the control before it is pressed (greyed, why in
  its tooltip). A result the screen already shows, or the browser shows (a download), gets no message. No line under
  a header, no band across a page, no callout pushed into a tile.
- **Functionality stays where it is.** This pass changes how screens look, read and are laid out, and what is shown
  first; it does not change what the product does. A change of behaviour found here is raised with the owner first.

## Areas, in priority order

The pass covers every screen of HQ and the Fleet Console, in the order a person meets them and relies on them (owner,
5 November): first what everyone sees, then what only some people use. The release-blocking areas (2, 7 and 8) are
never cut, wherever they sit; if time is short, the pass stops near the bottom of the list.

### 1. Setting up a new HQ

The first thing anyone sees: the first admin, the organisation, how agents reach AI, voice, and the last look. If it
confuses, nobody gets further.

### 2. The chat panel and conversations

Where people spend most of their time. It blocks the release. People find and switch conversations from the
right-hand chat panel without opening each project: a pinned project shows there too, its recent conversations one tap
away, and choosing one opens it in the same narrow panel without moving the board or page in the centre (one pinned
state shared by both panels). The app's layout around it is settled with it, since both live in the same frame: the
left panel (a rail of the app's places, with a project's menu beside it) and both on a phone. The conversation itself
is reviewed with it. One model for a conversation's lead and the work it hands off is not part of this pass: it changes
how every run's model is resolved, so it is built in phase 4 with its tests; a task's model is settled with tasks.

**Settled with the owner on 5 November**; the boards are in [`boards/02-chat/`](boards/02-chat/index.html). **Built, walked and accepted by the owner on 5 November**, with the walk's fixes: the chat's bar and the rail are
56 px with 36 px icon buttons and the rail's names as tooltips; the button whose pop-up is open shows the selected fill
and toggles it, and the bar stays above the dimming; rows end with an ellipsis. The sizes and the selected state are
now in `ui/DESIGN-SYSTEM.md`.

- **The chat panel.** It always shows the conversation a person is in. A bar on its right is the chat's own menu: the
  panel's state (minimised, beside the page, over the page) as one control, a new conversation, the Conversations
  list (one badge for everything waiting), then the pinned projects, each showing what is waiting in it. Minimised,
  the panel folds into that bar; nothing else is left on the page.
- **The Conversations list** is a quick view over the whole app: every conversation, newest first, its state (needs
  you, unread, working) on its face, with Needs you and Unread as filters that can be combined, and a way through to
  the Chat page. A pinned project lists its own conversations the same way. Lists open over the app, dimmed, and close
  with nothing changed when a person taps outside them.
- **One place to write.** A person writes to an agent in the chat's box only. Home shows the state of the HQ (what
  needs the person, what is running, pinned projects, what is coming up, what happened recently) with the chat's box
  floating at its foot while the chat is minimised. The Chat page is the detailed list of conversations, with the same
  floating box. A task has a button that puts its conversation in the chat; a project's Conversations page is a list.
  No page changes the chat's state.
- **The app's layout.** A rail on the left always holds the app's places (Home, Chat, Your space, Projects, Tasks,
  Agents, Library), then Manage, notifications and the person's own menu. A project's menu opens beside the rail, with
  the project's name at its head; the breadcrumb above the page stays as it is, and either switches project. Hidden,
  the project's menu leaves the breadcrumb. Pinned projects lead the Projects list and the project switcher.
- **On a phone.** The chat is one icon in the top bar; open, it is the conversation alone, with everything else behind
  ⋮ in bottom sheets. ☰ opens the app's menu as a drawer, the same everywhere; inside a project the top left is Back,
  the title names the page with the project under it, and a second drawer from the right holds the project's menu and
  the project switcher.

### 2b. The conversation itself

What area 2 left out: the conversation inside the chat panel, from a run in progress to the message box. It blocks the
release.

**Settled with the owner on 5 November**; the boards are in [`boards/02b-conversation/`](boards/02b-conversation/index.html).
Sixteen improvements, each approved by number (the chat list added 6 Nov), then refined while the owner walked the built screens on 6 Nov (the panel, the header, answers, the Chat page's controls); three add something the product does not do today (Rename, Try again,
hearing an answer read aloud) and one adds photos and files.

- **What the agent is doing.** A line just above the message box, with a moving indicator, says what is happening
  now in words: *Writer is thinking*, *is looking at the boards*, *is searching Knowledge and 2 more*, *is writing*,
  with the turn's time; only what the run reports, never a guess. When the agent waits for the person it becomes the
  *waiting for you* strip. In the thread, the agent's name line keeps one quiet toggle: *Thinking ›* while it works,
  *Thought for 26 s ›* after, nothing more; it opens the steps. Stop says "You stopped it here", with **Try again**.
- **Steps and what they made.** One list of steps per turn, in plain words, folded by default; what a turn made is one
  card at the end of the answer (its title, then what it is, its key and its state; the whole card opens it). Under an
  answer: copy and speaker icons and ⋯ (*Show the run*, what the answer used), each a 32 px target, 44 px on a phone.
  The speaker reads the answer aloud in the agent's voice with the text to speech hq already has; hidden where voice
  is unavailable.
- **Approvals.** A request appears as a card in the thread where it was asked, with **Approve** and **Deny**, and a
  *waiting for you* strip above the box until it is answered. It is one card everywhere it can be answered (a task's
  page and session too); once answered it says the outcome in place: *You approved it · 06:31 PM*. Today a request in
  a conversation shows nothing at all: a fault, fixed on its own.
- **When something goes wrong.** A failure says what happened in plain words and names the provider; who can fix it is
  worded for the reader (an admin gets the way to Providers, a member is told an admin has been told); a half-written
  answer is marked "The answer stopped here"; **Try again** sends the message again.
- **Reading.** A new answer opens at its start; headings, wide tables and code blocks read as such. A round ↓ above the
  box while scrolled up jumps to the latest, with a dot when a new answer has arrived. The start of the conversation is
  marked.
- **The header** is one bar (owner, walking the built screens, 6 Nov): the agent's avatar, its name (the main text
  colour) with the conversation's title under it in a quieter colour, cut with … when long; on the right the places as
  stacked tiles (where it lives first, then what it reads, +N past two, named on hover; ▾ opens them by name, each a
  link to the place, with ＋ Add a place), then ⋯. ⋯ holds Rename, Summarise now, Show its runs, Keep it, Archive and
  Delete…, each with an icon; only Summarise now and Keep it carry a short line. A hairline the panel's full width
  under it. The place chip the panel's frame drew above it is gone.
- **The panel** takes the page's surface (white in the light theme), with one hairline to the page; the rails stay on
  the frame's surface. An agent's answer runs the panel's full width under a small line with its avatar, name, time
  and the Thinking › toggle, not indented beside the avatar. The message box floats over the thread, which scrolls
  under it and fades out just above it; the round ↓ and the live line or waiting strip float above it with it. A new
  conversation started over an open one is a dialog of its own: a minimised panel stays minimised until it starts.
- **The message box.** Two rows: what is typed, then ＋ and the model as its own chip. The model list starts with a
  search, then the models recommended here and recent ones, each with its cost in words. How to send is the send
  button's tooltip (*Send (Enter) · Shift+Enter for a new line*); nothing is added on a phone.
- **Photos and files.** ＋ adds a photo or file (and *Take a photo* on a phone); paste and drag work too. It shows in the
  box before sending and in the message after, and is saved in the conversation's place under *Shared in
  conversations/*. A model that can see images gets the image. Best effort: a model known to read text only is named
  when the image is added, before sending, with a switch; when hq does not know and the provider refuses, the turn is
  sent again without the image and the agent gets the file. Blocks the release.
- **The chat list** (the Chat page and the chat panel's list, the same rows). Newest first by the time each row shows,
  so order and time always agree. Two lines a row: the title and time, then the last message; the place is its tile
  alone, on the lower corner of the agent's avatar, named in its tooltip. Later, with several agents, the
  avatar is two smaller faces (the latest in front, +N for more) and the tile moves to the lower left; the places a
  conversation also reads stay in its header. Unread is a count at the row's right, with the title bold and the time in the accent colour; the open
  conversation has an accent bar at its left. Day headings: Today, Yesterday, then the date. The Chat page has one
  toolbar line of one height: the search (filled), *Filter ▾* (project, agent, archived; it shows how many are set) and
  *Select*, which, while choosing several, gives way to *N selected · Mark read · Archive · Cancel*, each row's tick
  box inside the row. Under it, tabs, a choice of one: *All*, *Unread*, and *Needs you* only when something does (the
  chat panel's list has the same tabs). *New conversation* is the page's filled button and its one way to start one;
  no subtitle. Added by the owner, 6 Nov.
- **On a phone** the same: the title and who leads in the top bar, the line above the box, the cards and the strip.

### 3. Onboarding a member

The second person's first minutes: the invite, the first sign-in, and Your space.

### 4. Tasks and projects

Boards, the task page, and where a task's model is chosen.

### 5. Agents and their permissions

The agent pages, the approval cards and the permission presets: approvals come up in nearly every run.

### 6. Places and files

Where results land: a place's files, Knowledge and workspaces.

### 7. The workspace view

The view where people review and merge code work, beside the app's rail: Files, Git, the branch select, the conversation, and
*About*. Its layout was set aside for this pass when code work on branches shipped. It blocks the release.

**Settled with the owner on 5 November**; the boards are in [`boards/07-workspace/`](boards/07-workspace/index.html). **Built, walked and accepted by the owner on 5 November**, with the walk's fixes: a branch from someone
else's conversation names it rather than linking it, and its chat is shown as theirs; the app's rail stays in the view.

- **The breadcrumb says where you are.** Project / workspace ▾ / the branch ▾. On a branch it ends with 💬 Chat, which
  opens that branch's own chat (the conversation or task it came from; one per branch). On main it ends with the
  version (v14 · latest ▾); choosing an older version shows the whole workspace as it was, read-only, like checking it
  out, with *Back to latest* and *Return main to this version…*. A branch's details (where it came from, its changes,
  how far behind main) are one line in the branch menu and in About, nowhere else.
- **One next-step button**, top right beside About: *Merge into main…*; *Bring up to date* when the branch is behind
  or a merge clashes (the agent's existing job, started from the button), then *Updating…*; *Keep versions with Git…*
  without Git. A clash ends with that button, not a promise.
- **Files and changes are one view.** The left panel is the file tree as it is on the branch in view, the branch's
  changes marked in it (changed, new, deleted), with *Only changed* to narrow it. A file opens whole, its changes in
  place, with a way to step between them. No tabs.
- **The chat is the app's chat panel**, full height on the right, as everywhere. The view owns no conversations and
  browsing never moves the chat: any conversation can ask an agent to change the workspace, the work gets a branch,
  and the branch remembers where it came from as a link.
- **The app's rail stays**, as on every page, its foot holding Manage, Runs, Notifications and you; the project's menu does
  not show, since the breadcrumb names the project.
- **Turning Git on** says first that it cannot be undone and what changes in the folder. Git stays opt-in.
- **Narrower windows** keep the tree and labels; the chat opens over the page. **On a phone** the title is the
  workspace with the branch or version under it, the next step is a button at the foot, and ⋮ holds the branch's chat,
  switching workspace and About.
- **A workspace that cannot be opened** gets a page that says why and links back, instead of an endless loading line.
- **Open:** whether a branch's own steps (its commits) are shown (not for now); Git on by default (no for now); when
  another conversation asks for a change to a branch, whether it goes to the branch's own chat (default) or that
  conversation's agent writes to the branch itself (a change to how work runs, for phase 4).

### 8. The skills screens

The Library list, an asset's page, the editor, adding a skill, rolling back, and a place's Skills page and Your space.
Inputs: the skills unit's `design-state.md`. It blocks the release.

**Settled with the owner on 5 November**; the boards are in [`boards/08-skills/`](boards/08-skills/index.html). Making a
skill works and what the product does stays; what changes is everything around it.

- **The Library.** One **＋ Add ▾** holds New skill and the ways to bring one in. Each row shows its description and one
  line of state in words (who made it, its version, how many agents use it, or what it needs). One filter, *Needs you*,
  replaces six; the type chips stay. One name per skill; its identity is on its page only.
- **Bringing a skill in ends on agents.** Publishing and installing both end on *Which agents use it?* (every agent,
  chosen agents, or not yet); *Not yet* is shown as *No agent uses it* and counts under *Needs you*.
- **A skill's page is its files**, as a workspace's are in the workspace view: the folder tree on the left, one file open
  whole on the right, filling the window. SKILL.md opens first, read as a page with its name and description as a small
  table; *Source* shows the file as written. One header line holds the version (the breadcrumb's last part), **Used by
  2 agents ▾** (or *No agent uses it ▾*), **About**, **Edit** and ⋯.
- **Versions work like main's in the workspace view.** An older version is shown read-only, marking what it changed in
  the tree and in place, with **Return to this version…** and *Back to the version in use*. One name for going back.
- **The editor is the same page, ready to write in.** The breadcrumb ends in *draft ▾*; View, Edit and Changes become one
  view with a *Changes* switch that shows the draft's changes in place. SKILL.md's name and description are two fields;
  checks are one line at the foot, a problem shown at its line, and Publish says what it waits for. Discard draft moves
  into ⋯.
- **A place's skills** come first, each row saying its state in words with at most one action; the setting for skills
  found in files is one button in the header. A copy from the Library says so and offers *Update…* when a newer one
  exists. Your space and a project are one page.
- **A member** is not shown ＋ Add or New skill in the Library; one line says who adds organisation skills and links to
  Your space.
- **On a phone** the same rules: rows of state, ＋ Add at the foot; a skill shows who uses it, then its files full width,
  and a file opens on its own screen.

### 9. Workflows and GitHub set-up

Connecting GitHub, accounts, starters, approvals, secrets and variables: working, but too much at once for a first-
time person. The aim is sensible defaults with the advanced parts out of the way until needed.

### 10. Settings

The organisation's and a person's settings.

### 11. The Fleet Console

The fleet admins' screens.

## Each area's shape

1. **Prepare:** the *Today* board and the findings, numbered.
2. **Walk with the owner:** the change boards, decided one by one.
3. **Baseline:** the settled boards committed under `boards/<area>/`.
4. **Build:** in lanes, feature by feature.
5. **Accept:** the owner walks the built screens; fixes until accepted. The area's design-pass issue closes then.

## Close

Each area leaves a `design-state.md` beside its boards: what was decided, what changed while building and why, and what
is left for later. The design pass is done when the owner has accepted every area.
