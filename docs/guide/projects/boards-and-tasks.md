---
title: Boards, tasks and the timeline
description: Add and organise tasks, move them across boards and sprints, and see the plan over time.
sidebar:
  order: 2
---

A **task** is one piece of work with a number, such as `WEB-3`. A **board** arranges tasks in columns. The **timeline** lays them out against dates. All three are tools in a project, under **Work**. Anyone with the **Member** or **Admin** role in the project can change them; a **Viewer** reads only.

## Tasks

Open **Tasks** in a project. One list sorts every open task into three groups:

- **Needs you**: a run is waiting for a person, a run failed, or the task has no agent to start it.
- **Working on**: an agent is running it.
- **Up next**: everything on a board that is neither done nor running, those waiting to start first, then by priority. It shows the first eight, then a count of the rest.

Each row says where the task stands: **Running** with how long, **In line**, **Waiting its turn**, or a start time. **Backlog** and **Done** at the top open the tasks on no board and those finished in the last 30 days. Search and filters narrow the list. **Tasks** in the side bar shows the same list across every project, for the tasks done on your behalf, with a count of how many need you.

### Add a task

1. Select **+ New task**.
2. Type what needs doing and press Enter. It goes into the backlog.
3. To set more at once, select **More details** instead. The **New Task** dialog takes:
    - a **Title** and a **Description**
    - a **Priority**
    - the **Board** and the **Stage** (column) it starts in
    - an **Agent**

### Open a task

Select a task to open it. Its number, board and column are at the top. Select the title or description to edit it. Beside it are its facts:

| Fact | What it sets |
|---|---|
| **Agent** | Who does it. A task can't run without one |
| **Board**, and its column | Where it sits. **Backlog** means no board |
| **Priority** | **High**, **Medium** or **Low** |
| **Plan** | **Start** and **Finish** dates, drawn on the timeline. Changing them never starts or stops a run |
| **Epic** | The larger task this belongs to |
| **On behalf of** | The person the work is done for. Their access bounds the run, and they answer its approvals. A project administrator can choose someone else |

The one button at the top is **Run**, **Stop**, **Approve** or **Run again**, whichever fits where the task is. Comments are at the foot: the agent reads them on its next run. The **⋯** menu holds:

- **Make this an epic** (or **Not an epic**)
- **Move to board:** each other board
- **Dismiss this run** and **Clear the session**, when they apply
- **Archive** and **Delete**

What a run did is in [Follow what agents are doing](runs-and-approvals.md).

### Talk about a task

At the top of the task's page, **Talk about this task** puts the task's **conversation** with the task's agent in the
conversation beside the page. It is shared by everyone in the project, and the page has no message box of its own: the first
time, write your first message in the conversation beside the page and it starts the conversation. Anyone who can see the task reads it, and anyone
who works in the project writes in it; each message shows who wrote it once more than one person has. Work you ask for
there is a run of the task, and every run of the task, whoever started it, leaves a card in the conversation. If you give
the task to another agent, the conversation carries on with the new one, with a quiet line saying so. A task with no agent
says *Assign an agent to talk here.* On the board, a task with a conversation shows a mark with the number of messages you
have not read. The conversation is for talking and for what the agent did; comments stay the place for notes other people
and agents should find.

Only a project administrator can delete a task's conversation. It is archived with its task.

## Boards

Open **Boards** for the project's boards. Each shows a bar of how many tasks sit in each column, its counts, and how many need you.

- **Project Tasks** is made with every project, marked **Default**. Its columns are fixed: **To do**, **In progress** and **Done**. Every task on no other board is on it.
- Select **＋ New** to make another. Give it a **Name**, choose its **Kind**, and choose **Columns from** a template or **Your own**. A **Workflow** board has columns tasks move through. A **Sprints** board adds sprints of two weeks, planned from its backlog.

![A board's tasks, grouped under its columns](screenshot:project-board)

Select a board to open it. Move a card by dragging it to another column on a wide board, or from the card's **⋯**, which also moves it to another board's backlog. **Add task** at the top adds one in place. The board's **⋯** menu has **Edit columns**, **Archive** and **Delete**. **Archived** on the list shows archived boards, each with **Unarchive**.

A column on a board you made can **Start work on arrival**: a task with an agent, created in it or moved into it, is queued. The default **Project Tasks** board has no such setting. That is how a board hands work to agents; see [Turn on automation](../automation/turn-on-automation.md).

### Sprints

A sprint board shows its current sprint with its dates and the days left. The tasks in its columns are in the sprint; its **Backlog** holds the tasks in none. **Rename sprint** gives it a name. **Finish sprint** keeps the done tasks recorded in it and starts the next sprint, and you choose where the unfinished tasks go, **The next sprint** or **The Backlog**: nothing is chosen for you. The **▾** beside the sprint's name lists past sprints, which you can read.

### The backlog

**Backlog** in the Tasks tool lists the Project Tasks backlog by priority. Choose **Show also…** in the backlog's **⋯** menu to add other boards' backlogs under their own headings. Plan from here by moving tasks onto boards, or ask in a conversation: "plan the backlog into Sprint 4".

## The timeline

Open **Timeline** for the whole project, a row for each board. A board also has its own, through the **Columns** and **Timeline** switch in its header.

- **Week**, **Month** and **Quarter** set the scale.
- **‹**, **Today** and **›** move through time.
- **Show** chooses **Tasks**, **Epics** or **Milestones**.
- **Boards** chooses which boards appear.
- A task's bar runs from its plan **Start** to **Finish**. Drag the bar to move it, or an end to change it. That changes only the plan.
- **▶** marks a task's own start time, or the round of a routine that made it.
- An **Epic** groups tasks and spans theirs. A milestone (⚑) is a dated goal that epics belong to. An agent makes one when you ask in a conversation, and an epic's **Milestone** field then offers it.

Select a bar to open its task. **‹ Timeline** returns you to where you were.
