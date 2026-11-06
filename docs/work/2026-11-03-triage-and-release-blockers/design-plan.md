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
