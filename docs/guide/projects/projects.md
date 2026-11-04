---
title: Projects, and who can join
description: Create a project, choose whether anyone may join it, give people and teams their roles, and set it up.
sidebar:
  order: 1
---

A **project** is a shared place where people and agents work together on tasks. Its files are kept, and its agents run, on one **Execution Site**: a machine that runs agents. Everything in it is reached from one screen.

## The Projects screen

Select **Projects** in the side bar. Each project you can see is a card with its description, how many of its tasks are done, and what is happening in it now. The search box narrows the list, and so do the **Product** and **Programme** filters when your organisation has them. The views above it, **Boards**, **Workspaces** and **Routines**, show those things across all your projects at once.

Select **Pin** in a project's header to keep it under **Pinned**, one row at the foot of the side bar that never moves, whatever you choose. The row shows the pin you used last, other than the place you are in, with how many pins you have; select its name to go there. Select **▴** to open the whole list upward from the row, with the place you are in marked, and **▴** again to close it. The list stays open until you close it, and the side bar remembers whether it is open and the pin you used last. **Edit** at the top of the list reorders or removes pins. With no pins there is no row.

A card marked **Open project · not joined** is a project you may look at but aren't in. Select it, read what it is, and select **Join this project** to join as a member. A private project doesn't appear to people who aren't in it.

## Create a project

Select **New project**. Everyone can make a personal project, which only they see: see [Personal projects](#personal-projects). Only an organisation administrator makes a project for the organisation, so an administrator is first asked **Just for you** or **For the organisation**; anyone else goes straight to the personal form. For a project of the organisation, follow [Your first task](../getting-started/first-task.md#1-create-a-project). The person who creates it is its first administrator.

If your organisation has more than one Execution Site, the dialog asks which one the project lives on. That choice is fixed once it is made.

## Inside a project

Selecting a card opens the project on its **Overview**: its facts (lead, site, default agent, product and access), then its sections. The side bar shows the project: its name at the top, and every section down the side bar with a count where it has one, the one you are on marked. The chosen section fills the screen. Select **‹** at the top of the side bar to go back to the main navigation, over the side bar; selecting the project you are in, **✕**, **Esc** or anywhere outside closes it and nothing moves.

![A project's sections down the side bar, opened on Overview](screenshot:project-sections)

| Section | What it holds |
|---|---|
| **Overview** | The project's facts, and each section as a row with its count. Select a row to open that section |
| **Conversations** | The conversations you have had about the project. Select one to open it beside the page: see [The conversation beside your work](../getting-started/first-conversation.md#the-conversation-beside-your-work) |
| **Tasks**, **Boards**, **Timeline** | See [Boards, tasks and the timeline](boards-and-tasks.md) |
| **Runs**, **Automation** | See [Follow what agents are doing](runs-and-approvals.md) |
| **Files**, **Artefacts**, **Workspaces** | See [Files, workspaces and previews](files-and-previews.md) |
| **Knowledge** | See [Knowledge](knowledge.md) |
| **Members**, **Settings** | See below. **Memory** is also there for project administrators |

At the foot, under **Pinned**, your name opens a menu with:

- your organisation's **Overview**
- **Manage**, for administrators
- **Your settings** and **Sign out**

**«** beside it narrows the side bar to icons, and **»** widens it again. On a medium window the side bar shows an icon for each section, with its name when you point at it. **Pinned** is then the last pin's picture, with its list opening to the right, and you are your picture, opening the same menu. On a phone, **☰** opens the side bar as a drawer, and the bar at the top names the section you are on; select its name to list the sections. The section is part of the address, so a link, a reload or Back returns you to it.

Your own space has the same sections, without **Timeline**, **Members** and **Settings**, and with **Agents**: see [Your space](../getting-started/first-conversation.md#your-space).

## Personal projects

A personal project is a project only you see, for work of your own: a tax return, a side study, anything the
organisation has no part in.

1. Select **New project**. If you are an organisation administrator, choose **Just for you**.
2. Give it a **Name** and, if you like, a **Description**. Select **Make it**.

![The New project dialog for a project just for you, with a name and a description](screenshot:personal-project)

You can make as many as you like. **Your space** is the first, made with your account and kept for as long as you are in
the organisation; the others are yours to delete from their **Settings**. Nobody can be added to a personal project, and
its **Settings** have no access, members or billing parts. Any agent can work in it, as you: with your own
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

![A project's Members, with its teams, people and agents](screenshot:project-members)

Open **Members**. It shows whether the project is open or private, then its teams, its people and its agents. Project administrators, and organisation administrators, select **＋ Add** and choose:

- **A person**: choose their role at the top (**Member**, **Viewer** or **Admin**), search, and select **Add** beside them. **Invite them in Organisation ›** is there for someone new.
- **An agent**: select **Assign** beside it. The first agent you assign becomes the project's default agent.
- **A team**: choose the team's role, then **Add** beside it. Everyone in the team joins at once. See [Teams](../people/teams.md).

Select a person to change their role, to open the tasks done on their behalf, or to remove them. Removing someone asks, first, who their open tasks are now done on behalf of, or whether to leave them waiting. Anyone can select **Leave this project** for themselves, unless they are its only administrator. Someone who is in only through a team is changed through the team.

## Filing projects under products and programmes

A **product** is something your organisation makes or runs, and a **programme** is a goal several projects work towards. Both only group projects: filing a project under one gives nobody access to anything. Neither is required.

Organisation administrators make them from **Organisation**, on the **Products** or **Programs** card (the card spells it **Programs**; the project's own setting and filter say **Programme**). Select **New**, name it, and use **File a project** on its page to add projects. Or open a project's **Settings** and choose its **Product** or **Programme**.

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
| **Archive finished tasks after** | How long a finished task stays on the board before it is archived |
| **Delete** | **Delete project** removes it with all its boards and tasks, permanently. Only an organisation administrator can |
