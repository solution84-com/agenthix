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

The full-screen view where people review and merge code work: Files, Git, the branch select, the conversation, and
*About*. Its layout was set aside for this pass when code work on branches shipped. It blocks the release.

### 8. The skills screens

The Library list, an asset's page, the editor, adding a skill, rolling back, and a place's Skills page and Your space.
Inputs: the skills unit's `design-state.md`. It blocks the release.

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
