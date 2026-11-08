---
title: Tasks
description: Plan work as tasks with a type and a column, put it in order, group it under epics, and read where each one stands.
sidebar:
  order: 2
---

A **task** is one piece of planned work with a number, such as `WEB-3`. Tasks are for planning: what is to be done,
by whom, in what order. What an agent is doing with a task right now is a separate thing, a **run**, and it is shown
as the task's **execution state**. Anyone with the **Member** or **Admin** role in a project can change its tasks; a
**Viewer** reads only.

A task never starts by itself. It runs only when a person or an agent starts it: see [Starting work](starting-work.md).

## What a task has

| What | Values | Who sets it |
|---|---|---|
| **Type** | A kind of work in the project, such as **Task**, **Bug** or **Epic** | People and agents |
| **Column** | One of the type's own columns, such as **Reported** or **Fixed** | People and agents, by moving the task |
| **Task state** | **Backlog**, **To do**, **In progress** or **Done**. The state of the task's column | Follows the column |
| **Execution state** | **Not started**, **Waiting**, **Running**, **Needs you**, **Failed** or **Finished** | The system, from the task's latest run |
| **Sprint** | One sprint of the project, or none | People and agents |
| **Custom fields** | Extra single-choice fields the project defines, such as **Area** | People and agents |

The two states never stand in for each other. Moving a task to **Done** does not run anything, and a run that finishes
does not move the task: a person, or the agent with its tool, moves it.

### Types and columns

Every project starts with the type **Task**, whose four columns are the four task states: **Backlog**, **To do**,
**In progress** and **Done**. A project can add types of its own, such as **Bug**, each with its own columns. Every
column sits in exactly one task state, so a **Reported** column in **Backlog** and a **Fixed** column in **Done** still
mean "not committed to yet" and "done". Wherever a task's column shows, only the column's name shows.

Changing a task's type keeps its task state: the task lands in the new type's default column for that state.

### Backlog

**Backlog** is the first task state: wanted, but not yet committed to. A task made with **New task** starts there. Moving
it to **To do** is deciding to do it. Adding a Backlog task to a sprint moves it to **To do** for you.

### One order for the whole project

Every task has one place in the project's order, its **rank**. Every board sorts by it, and dragging a task on any
board changes it. It is the order an agent follows when it is started on its tasks. The rank is never shown as a
number. A task's **⋯** menu on its page has **Move to top** and **Move to bottom**.

### Epics

**Epic** is a type every project has. An epic groups tasks toward one goal, shows how many of its tasks are done, and has
a date. An epic is never run, but it can have an agent that manages it: talks it through and writes and orders its
tasks. On an epic's page the main button is **Add a task**. A task with runs cannot be made an epic.

## The Tasks list

Open **Tasks** in a project. Across the top, cards count the tasks in each state: **All**, **Backlog**, **To do**,
**In progress**, **Done** (the last 30 days), **Late** (past its due date and not done) and **No agent**. Select a card
to show only those tasks; select **All** to see every task again. The cards count planning only, never runs: what
agents are doing is on the [Workroom](workroom.md).

Under the cards, search by title or number, and narrow the list with **＋ Filter**: by type, column, task state, epic,
sprint, agent, priority, a custom field, or the archived tasks. Each filter in use is a chip, and its **✕** takes it
away. **Sort** orders the list by **Rank** (the default), **Priority**, **Due date**, **Recently updated** or
**Newest**. **Fields ▾** chooses which columns each line shows: **Column**, **Agent** and **Due** by default, and
**Sprint**, **Priority** and each custom field if you add them. Dragging a line changes its rank while the list is
sorted by **Rank**.

Each line shows the task's title, its type mark, its key, the columns you chose, and the agent. An agent's picture
carries a ring while a run matters: a thin dotted ring for **Waiting**, a turning ring for **Running**, a full ring with
a dot for **Needs you**, and a full ring with a ! for **Failed**. There is no ring for **Not started** and **Finished**.
Words appear when you hover over the ring.

**Your tasks** in the side bar is the same list for the tasks planned for you, across all your projects, by due date:
the tasks that are done on your behalf. What needs you from a run is in [Runs and the Workroom](workroom.md), not here.

### Select several tasks

Tick the box at the start of a line to select it, or on a phone hold a finger on a line. Once anything is ticked, a
tap on a line ticks it instead of opening it. A bar at the foot shows how many are selected and what you can do with
them: **Move to To do**, **Add to sprint…**, **Set epic…**, **Assign agent…** and **Archive**. On a phone the top bar
changes while you select: **✕** leaves selection, the title says how many are selected, and the **⋯** holds the same
actions and **Select all**.

## Add a task

1. Select **New task**.
2. The **New task** page is shaped like a task's own page. On the left are a required **Title** and a **Description**.
   The description is Markdown with a toolbar; paste or drop an image to attach it.
3. On the right are the details, all optional: the **Type** (a new task starts in **Backlog**, in its type's first
   column), the **Agent** and, once one is chosen, its **Model**; when it **Starts** (a time to run at); its
   **Priority**; and its **Epic**.
4. Select **Create task** to open the new task, or tick **Create more** to stay on a fresh page.

A task added from a board's column starts in that column, at the bottom of the project's order.

## Open a task

Select a task to open it. The header shows its key, its **Type** and **Column**, and a ring on its agent while a run
matters. Select the title or description to edit them. The details are beside them:

| Detail | What it sets |
|---|---|
| **Agent**, **Model** | Who does it, and which model it uses. A task can't run without an agent |
| **Type**, **Column** | Where it sits. Changing the column changes the task state |
| **Sprint** | The sprint it is planned in |
| **Priority** | **High**, **Medium** or **Low** |
| **Due**, **Starts** | The date it is due, and the time **Run at…** sets |
| **Epic** | The larger task it belongs to |
| **Fields** | The project's custom fields |
| **On behalf of** | The person the work is done for. Their access bounds the run, and they answer its approvals. A project administrator can choose someone else |

The one filled button at the top is **Run**, **Stop**, **Review**, **Answer** or **Run again**, whichever fits where the task is.
**Run** opens **Run now** and **Run at…**: see [Starting work](starting-work.md). Below the description are three tabs:

- **Comments**: the task's record, for context, decisions and handovers, in Markdown. **Reply** answers a comment in its
  thread. Every run of the task reads them.
- **Runs**: every run of the task, newest first. Select one to see its steps. Nothing is typed into a run: to change its
  course, stop it or talk about the task.
- **Activity**: everything that happened to the task, newest first.

The **⋯** menu holds **Run again** (on a finished task), **Move to top**, **Move to bottom**, **Copy link**, **Archive**
(or **Unarchive**) and **Delete…**.

### Talk about a task

**Talk about this task** puts the task's conversation with its agent in the panel beside the page. Everyone in the
project shares it. Work you ask for there is a run of the task. To keep something the conversation decided, select
**Save to the task** under a message: it becomes your comment on the task, so the next run reads it. Only a project
administrator can delete a task's conversation.

## Task types and custom fields

Both are set up in a project's **Settings**, in the tabs **Task types** and **Custom fields**. Anyone who may work in
the project can change them.

- **Task types** lists the types. **New task type** makes one, blank or from a [task template](../agents/library.md#task-templates).
  Open a type to name it, add and rename its columns, choose the task state each column sits in, give each column a
  colour, and put the columns in order. A column that holds tasks can't be removed: move them first.
- **Custom fields** lists the project's fields. **New field** makes one with its first options. A field is a single
  choice (one option or none) and is an extra way to look at tasks on a [board](boards.md); it never changes a task's
  state. **Add option** adds a choice to a field.

Both tabs have **Publish as task template…** (or **Propose as task template…**) in the **⋯** menu, to share the
project's types and fields through the Library.

## On a phone

The top bar holds the menu (or **Back**), the title, chat and one **⋯**. The screen's actions are behind the **⋯**, the
main one first. A form such as **New task** is a page of its own, with **✕**, the title and one filled button.
