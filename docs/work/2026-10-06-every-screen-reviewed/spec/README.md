---
created: 2026-10-06
description: Agenthix is usable — every screen reviewed. The first design pass makes hq conversation-first. A project opens on its conversations, with the project's tools beside them. "Chat" becomes the person's personal space. Home is a place to start talking. Notifications and runs become twin panels beside the navigation. Addresses every screen reviewed, and one place to see and control automation in a later pass.
---

# Design Spec · Agenthix is usable — every screen reviewed

**Drafted** on 2026-10-06 from the design sessions held with the owner that day. How it is built is in
[`plan.md`](../plan.md). Addresses every screen
reviewed, starting with the project view. One
place to see and control automation is designed in a later pass of this unit.

This spec is a living design document. Each screen's design was agreed on a mockup with the owner, one screen at a
time. A later pass corrects the section it changes; it never appends a second version.

## Why this exists

The walkthrough of *Agents act on their own schedule* found hq hard to find one's way around. Settings were spread
across many places, and nothing said what agents were doing or why. Reviewing it screen by screen, the owner
changed the question from "is each screen tidy?" to "does each screen serve what the person came to do?"

The answer is a change of model. hq was a project-management application with chat added on: a tab bar of
Overview, Tasks, Boards, Files and the rest, and chat in a side panel. The person's main way of working is to talk
to agents, so the redesign inverts that. **Conversation captures intent; structured views expose state.** The
conversation is the main workspace, and tasks, boards, runs, files and the rest are tools beside it.

The test, for a new user looking at a project: *"I'm talking to my AI organisation about this project, and I can
inspect the project's work whenever I need to"* — not *"a project-management app with a chat feature"*.

## How this unit is worked

- **Design first, then build in slices, then refine.** A screen is designed on a mockup until the owner agrees
  it. Agreed screens are built while the next ones are designed. The owner uses what is built, and the design is
  refined until it feels simple and intuitive. Nothing is designed far ahead of use, because a design not yet
  tried may be thrown away.
- **Redesign first.** A new feature comes in only when an agreed design needs it and it is easy to build.
  Anything with a large architectural consequence is deferred and raised as an issue.

## Terms

| Term | Meaning |
|---|---|
| **Conversation** | A chat between one person and one agent. Today's `AgentSession` with `sessionType` `chat` |
| **Place** | Where a conversation belongs: a project, or the person's personal space |
| **Personal space** | A person's own place, shown as **Chat**. It is today's personal project (`Project.personalOwnerId`) together with the person's own storage |
| **Tools panel** | The right-hand panel beside a conversation or a conversations list. It holds the place's facts, its People and Agents, and its tools |
| **Tool** | One structured view of a place's work — Tasks, Boards, Timeline, Runs, Automation, Files, Artefacts, Knowledge, Workspaces, Settings. A place's agents and people are not tools: they are who works there |
| **Layout** | How the conversation and the tools panel share the screen. There are four |
| **Pin** | An item a person keeps in their navigation: a project, a board or an agent |
| **Run** | One stretch of an agent's work — the industry's term (OpenAI's thread → run → run steps; Claude Code calls it a *query*, made of turns), with Agenthix's own boundary: from the message, task start or routine that hands the agent work, through everything it does without a person in between, until it hands back with its reply (completed, failed or stopped). Waiting for approval does not end it. Defined in the concepts' *Sessions* |

## Areas

| File | Covers |
|---|---|
| [`shell.md`](shell.md) | The shell: navigation, the screen bar, the look, and the four layouts |
| [`tools-panel.md`](tools-panel.md) | The tools panel's structure: facts, Members, the tool groups, opening a tool, Run all and Stop all |
| [`automation.md`](automation.md) | The Automation tool and routines |
| [`tasks.md`](tasks.md) | The Tasks tool: the backlog, a task, its session, Your tasks, shared sessions and approvals |
| [`boards.md`](boards.md) | The Boards tool: lasting boards, columns, sprints |
| [`timeline.md`](timeline.md) | The Timeline tool: a task's plan, epics, milestones |
| [`files.md`](files.md) | The Files tools: Files, Artefacts, Knowledge and Workspaces |
| [`agents.md`](agents.md) | Agents in a project, an agent's place and managing agents, an agent's permissions |
| [`people.md`](people.md) | People in a project, profile cards, roles, invitations, leaving |
| [`settings.md`](settings.md) | Settings, Organisation › Settings and Infrastructure, and a project's Settings |
| [`sites.md`](sites.md) | Execution Sites: the list, a site's page, health, notifications |
| [`projects-screen.md`](projects-screen.md) | The Projects screen and its Projects, Boards, Workspaces and Routines views |
| [`organisation.md`](organisation.md) | The Organisation page: hero, Needs attention, Today, Teams, Products, Programs, Library |
| [`conversations.md`](conversations.md) | A project's conversations list, a conversation and what it shows, and Chat (the personal space) |
| [`notifications-runs.md`](notifications-runs.md) | The Notifications and Runs panels, and the Runs screen |
| [`getting-in.md`](getting-in.md) | Installing with one command, the first admin's one-time link and setup, signing in, accepting an invitation, getting back in without email, and the problem screens on the way in |
| [`diagnostics.md`](diagnostics.md) | Logs and diagnostics in Organisation › Infrastructure: health, recent errors, logs, the support bundle; the debug page removed |
| [`home.md`](home.md) | Home: the greeting, the message box, signal buttons, Jump back in |
| [`testing.md`](testing.md) | How the new behaviour and the screens are tested |

Each area file ends with its **New behaviour this design needs** (the rows of the table that belong to it) and, where it has any, its **Not in this pass**.

Each is small and was accepted on the rule in *How this unit is worked*.

## Not in this pass

**Later design passes of this unit**, in an order the owner picks as the build comes back:

- **Each tool's own design:** the tool risk rules stay, and are seen on the [Runs screen](notifications-runs.md#the-runs-screen). The built-in agent's approval starts Deferred, like any new agent's, and may be changed. Settings, a project's Settings and the [Runs screen](notifications-runs.md#the-runs-screen) are designed. Automation,
  Tasks, Boards, the Timeline, Files (with Workspaces and Knowledge), Agents (with an agent's place, Organisation ›
  Agents and an agent's permissions) and People (with Organisation › People) are designed ([Automation](automation.md), [Tasks](tasks.md), [Boards](boards.md), [Timeline](timeline.md), [Files](files.md), [Agents](agents.md), [People](people.md)).
- **Organisation-wide runs:** runs by site and the organisation's Stop all. Today's numbers are on the Organisation
  page and each site's load on its card and page ([Execution Sites](sites.md), [Organisation](organisation.md)); until the rest exists, the organisation-wide Stop all appears on
  the Runs screen for admins.

**Deferred, raised as issues:**

- Home's "coming up today" and what its click opens agreeing; the Organisation page's size;
  the Runs screen taking over the dashboard's run history.
- How knowledge's entries and tags are stored, whether agents manage it through a platform tool or the files, and
  editing it by hand; archiving or pruning old
  conversations with their artefacts; a project's
  ROADMAP.md generated from its timeline's milestones and epics.

**Not decided, and not part of this design:** whether there is ever one organisation-wide agent. **Out:** project
status.
