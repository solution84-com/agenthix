---
title: Projects, and who can join
description: Create a project, choose whether anyone may join it, give people and teams their roles, and set it up.
sidebar:
  order: 1
---

A **project** is a shared place where people and agents work together on tasks. Its files are kept, and its agents run, on one **Execution Site**: a machine that runs agents. Everything in it is reached from one screen.

## The Projects screen

Select **Projects** in the side bar. Each project you can see is a card with its name, its description, and one line
that says what is going on in it: how many of its tasks need you, how many are running and how many are open
(**2 need you · 1 running · 6 open**), or **Nothing open**. The search box narrows the list, and so do the **Product**
and **Programme** filters when your organisation has them. Your projects come with the one with the latest activity
first.

**Boards**, **Workspaces** and **Routines** in the side bar list those things across all your projects, and your own
Chat, at once: see [Boards, workspaces, routines and Workrooms across your projects](#boards-workspaces-routines-and-workrooms-across-your-projects).

Select the pin on a project's card, or beside its name at the top of its menu, to pin it: a pinned project shows on
**Home** and in the chat bar, and its pin is filled. Your pinned projects come first on the Projects screen, under
**Pinned**, then **Your projects**; **Edit** beside **Pinned** moves them earlier or later. Pinned projects also come
first when you switch project.

Open projects you aren't in come last, under **Other projects you can join**. Select **Join** on one to join it as a
member, or select the card to read what it is first and
select **Join project** there. A private project doesn't appear to people who aren't in it.

## Boards, workspaces, routines and Workrooms across your projects

Each of these is its own place in the side bar, with its own **New** button:

- **Boards** lists every saved board you can see, grouped by project, with a **Project** filter. **New board** asks which
  project it goes in.
- **Workspaces** lists the workspaces of your projects and of your own Chat, with the **Project or Chat** filter.
  **New workspace** asks where it goes.
- **Routines** lists your projects' routines and your own, with counts, **Up next** and a card for each. **New routine**
  asks where it goes.
- **Workrooms** shows every project's agents at work on one page: see [The Workroom and Runs](workroom.md).

Selecting a row opens it inside its project, or in Chat. Inside a project, its own **Boards**, **Workspaces**,
**Routines** and **Workroom** tools show only that project's.

## Create a project

Select **New project**. Every member of the organisation can make a project, for the organisation or for themselves.

1. Give it a **Name**. A **Key** follows the name, two to six capital letters that start every task's number, such as
   `WEB-1`; type your own and it stays. Add a **Description** if you like.
2. Under **Who is in it**, choose **The organisation**, which people you add can see and work in, or **Just you**: see
   [Personal projects](#personal-projects).
3. For a project of the organisation, **Where it runs** asks which Execution Site keeps its files and runs its agents,
   when your organisation has more than one; that choice is fixed once it is made. An organisation administrator is
   also asked **AI cost billed to** when the organisation has more than one billing profile; anyone else's project
   bills to the default, and an organisation administrator can change it in its **Settings**.
4. Select **Create project**. The project opens on its **Overview**.

The person who creates it is its first administrator.

![The New project dialog, with a name, a key and a description](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/new-project.png)

## Inside a project

Selecting a card opens the project on its **Overview**: its facts (lead, site, default agent, product and access), then its sections. The side bar stays, and the project's menu opens beside it: the project's name at the top, and every section with a count where it has one, the one you are on marked. The chosen section fills the screen. The icon beside the project's name hides the menu, so the page takes the width; the same icon, at the start of the path above the page, brings it back.

To switch project, select the project's name **▾**, at the top of its menu or in the path above the page. **Find a project** lists your pinned projects first, then the others, with a search; choosing one opens it on the same section. Select anywhere outside, or press **Esc**, to close it with nothing changed.

![A project's sections down the side bar, opened on Overview](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/project-sections.png)

| Section | What it holds |
|---|---|
| **Overview** | The project's facts, and each section as a row with its count. Select a row to open that section |
| **Conversations** | The conversations you have had about the project. Select one to open it beside the page: see [The conversation beside your work](../getting-started/first-conversation.md#the-conversation-beside-your-work) |
| **Tasks** | See [Tasks](tasks.md) |
| **Boards** | See [Boards](boards.md) |
| **Sprints**, **Timeline** | See [Sprints and the timeline](sprints-and-timeline.md) |
| **Workroom**, **Runs** | See [Starting work](starting-work.md), [The Workroom and Runs](workroom.md) and [Follow what agents are doing](runs-and-approvals.md) |
| **Routines** | See [Routines](../automation/routines.md) |
| **Files**, **Artefacts**, **Workspaces** | See [Files, workspaces and previews](files-and-previews.md) |
| **Knowledge** | See [Knowledge](knowledge.md) |
| **Members**, **Settings** | See below |
| **Vault** | The secrets and variables the project's workflows use: see [Vault](../workflows/secrets-and-variables.md) |

At the foot of the side bar are **Manage**, for administrators, the notifications bell, and your initials, which open a menu with **Your settings**, your **Organisation**, **Help and the guide** and **Sign out**.

On a medium window the project's menu shows an icon for each section, with its name when you point at it. On a phone, the bar at the top has **‹** to go back to the Projects screen, and names the section you are on with the project's name under it. The button at its right opens the project's menu from the right; select the project's name at its top to switch project. **☰**, on the screens outside a project, opens the app's menu. The section is part of the address, so a link, a reload or Back returns you to it.

Your own space is drawn as a project's place too, with the same menu, without **Sprints**, **Timeline**, **Workroom**, **Members** and **GitHub**, and with **Agents** where a project has **Members**: see [Your space](../getting-started/first-conversation.md#your-space).

## Personal projects

A personal project is a project only you see, for work of your own: a tax return, a side study, anything the
organisation has no part in.

1. Select **New project**, and under **Who is in it** choose **Just you**.
2. Give it a **Name** and, if you like, a **Description**. Select **Create project**.

![The New project dialog with Just you chosen, a name and a description](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/personal-project.png)

You can make as many as you like. **Your space** is the first, made with your account and kept for as long as you are in
the organisation; the others are yours to delete from their **Settings**. Nobody can be added to a personal project, and
its **Settings** have no access, members or billing parts, and its **Overview** has no lead or people. Any agent can work in it, as you: with your own
agent settings, your Claude subscription if you have one, and your own list of which models may run. It keeps its own
files, apart from your space's.

Its **Agents** page lists the agents its tasks and routines can be given to: select **Add** to put any agent in the
organisation on the list, or **Remove** beside one to take it off. **Kernel** is on the list from the start. Only you change the list, and you can still
talk to any agent in the organisation there, whether it is on the list or not.

## Roles in a project

What someone may do in a project is their role there. The organisation role doesn't change it.

| Role | What it allows |
|---|---|
| **Admin** | Everything a member does, and runs the project: its people, agents, permissions, repositories and settings |
| **Member** | Works in it: talks to its agents, starts, stops and changes work, comments and answers approvals |
| **Viewer** | Reads everything a member reads, and changes nothing |

A viewer sees a note where a member would see a button. Nothing is ever done in a project on a viewer's behalf. A project always has at least one administrator.

## Who can join

Under **Settings**, **Who can join** is either:

- **Open**: anyone in the organisation may join. A new project is open.
- **Private**: only the people on its member list can see it, start a run in it, or write anything it owns.

For a project where newcomers should only read, make it private and add them as viewers.

## Add people, agents and teams

![A project's Members, with its teams, people and agents](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/project-members.png)

Open **Members**. It shows whether the project is open or private, then its teams, its people and its agents. Project administrators, and organisation administrators, select **＋ Add** and choose:

- **A person**: choose their role at the top (**Member**, **Viewer** or **Admin**), search, and select **Add** beside them. **Invite them in Organisation ›** is there for someone new.
- **An agent**: select **Assign** beside it. The first agent you assign becomes the project's default agent.
- **A team**: choose the team's role, then **Add** beside it. Everyone in the team joins at once. See [Teams](../people/teams.md).

Select a person to change their role, to open the tasks done on their behalf, or to remove them. Removing someone asks, first, who their open tasks are now done on behalf of, or whether to leave them waiting. Anyone can select **Leave this project** for themselves, unless they are its only administrator. Someone who is in only through a team is changed through the team.

## Filing projects under products and programmes

A **product** is something your organisation makes or runs, and a **programme** is a goal several projects work towards. Both only group projects: filing a project under one gives nobody access to anything. Neither is required.

Organisation administrators make them from **Organisation**, on the **Products** or **Programmes** card. Select **New**, name it, and use **File a project** on its page to add projects. Or open a project's **Settings** and choose its **Product** or **Programme**.

## Project settings

Open **Settings**. Each part saves on its own, and people who can't change a part read its value as text, with the names of the administrators who can.

| Part | What it holds |
|---|---|
| **Name**, **Key**, **Description**, **Lead** | The key starts every task's number (`WEB-1`), and is fixed once the first task exists. The lead is shown in the project's facts and has no extra rights |
| **Product**, **Programme** | Where the project is filed: see above. Organisation administrators set these |
| **Who can join** | **Open** or **Private** |
| **Default agent** | The agent a new conversation here starts with |
| **Execution Site** | Where it runs. Chosen when the project was made |
| **Models** | Which models may run in this project: a list that narrows the organisation's, for everyone working here, agents included. See [Which models may run](../your-tools/models.md#which-models-may-run). Shown only to project administrators |
| **Billing** | **AI cost billed to**, the billing profile this project's AI cost is charged to. Shown when the organisation has more than one. Only an organisation administrator changes it: see [Billing profiles and usage](../your-tools/billing-and-usage.md) |
| **Run time limit (minutes)** | Stops any run in the project after this long. It can only be tighter than the organisation's limit |
| **Archive finished tasks after** | How long a finished task stays in the lists before it is archived |
| **Delete** | **Delete project** removes it with all its tasks and boards, permanently. Only an organisation administrator can |
