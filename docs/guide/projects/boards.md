---
title: Boards
description: Look at a project's tasks in columns, filter and save the view, and drag tasks to change their column and order.
sidebar:
  order: 3
---

A **board** is a way of looking at a project's tasks, laid out in columns. A board never owns a task: the same task
shows on every board that fits it, and moving a card on a board moves the task itself. Anyone who can see the project
can open its boards; **Member** and **Admin** can move cards, and a **Viewer** reads only.

## The Boards list

Open **Boards** in a project. It lists the two built-in boards, then every board the project has saved. Each shows how its
tasks spread across its columns, and how many need you. **New board** makes a saved board. **Boards** in the side bar
lists the boards of all your projects.

The built-in boards are:

- **Task state**: every task of every type, in the columns **Backlog**, **To do**, **In progress** and **Done**.
- **Execution**: the tasks by what the system says is happening with them. See below.

## A board

![A board's tasks, grouped under its columns](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/project-board.png)

Open a board to see its cards in columns, with a count at the top of each. A card is calm: the task's priority and key,
its title, and, when it has an agent, the agent's picture at the left of the foot with its ring (see [Tasks](tasks.md#the-tasks-list))
and a **⋯** menu at the right, shown when you hover over the card. On a board that mixes types, a small mark for the type
comes before the key.

- **Drag a card** to another column to move the task, or up and down in a column to change its rank. The order is the
  project's one order, the same on every board.
- **The card's ⋯** has **Open**, one run action that fits the task (**Run**, **Stop** or **Run again**; an epic has
  none), **Move to** another column, and **Sprint** to put it in a sprint or take it out. On a phone, where nothing is
  dragged, it also has **Move up** and **Move down**.
- **New task** starts a task in the column you add it from, at the bottom of the project's order.

### Choose the columns

The **Columns** menu chooses what the columns are:

- **Task state**: all types, by state.
- **A type's own columns**: listed only for types whose columns differ from the four states, such as **Bug**.
- **A custom field**: a column for each of the field's options. A task can be
  on several such boards, and moving it between the columns sets only that field.
- **Execution state**: **Not started**, **Waiting**, **Running**, **Needs you**, **Failed** and **Finished**. It is
  read-only (marked **Read-only**): the system moves the cards as runs start and end, and you can't drag them.

Only a type's columns change a task's state. A custom field is an extra view and never does.

### Filter

Below the title, filters narrow the cards on the board:

- **Sprint**: **Any sprint**, **Current sprint** (which follows to the next one when a sprint ends), an upcoming sprint,
  **Not in a sprint**, or a past sprint under **Past sprints**.
- **Epic**, **Agent**, and on a board that spans types, **Type**.

### Save a board

A filter or column choice you make is only for you, until you keep it: **Save as board** names it and adds it to the
project's boards. Saved boards belong to the project, so everyone in it sees them. A saved board's
**⋯** menu has **Rename…**, **Duplicate** and **Delete…**; the built-in ones are fixed. Deleting a
board only removes the view. Its tasks are untouched.

**Talk about this board** opens a conversation with an agent about the board, which can add tasks and put them in order.

## Sprint boards

A sprint board is simply a board filtered to the current sprint: choose **Sprint** › **Current sprint**, then **Save as
board**. See [Sprints and the timeline](sprints-and-timeline.md).
