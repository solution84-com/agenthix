---
title: Turn on automation
description: Let a project start its queued tasks, and tasks with a start time, without anyone pressing Run.
sidebar:
  order: 1
---

**Automation** lets a project start work by itself. It does two things: it starts the tasks waiting in each agent's
line, one task at a time per agent, and it starts tasks at the start time you set. Every project has its own
switch, and it is off until a project administrator turns it on.

An organisation administrator can also turn automation off for the whole organisation. If they have, nothing starts
on its own anywhere, and no project can turn it back on: see
[Limits, and stopping everything](limits-and-stopping.md).

## 1. Open the Automation tool

Open the project, and under **Agents at work** in the tool list, select **Automation**. It is marked **On** or
**Off**. Your own **Chat** has the same tool, for your own space.

![A project's Automation tool, showing its status, what is running and what will start later](screenshot:automation-overview)

The top shows the status, **Running** or **Paused**:

- **Running**: queued tasks start on their own.
- **Paused**: nothing new starts on its own, and work already running carries on. If the status says automation is
  off for the whole organisation, an organisation administrator has to turn it back on.

## 2. Turn it on

A project administrator selects **Resume**. The button becomes **Pause**, which turns automation off again. Anyone
else sees why the button is unavailable.

## 3. Choose what gets queued

A **queued** task is waiting in its agent's line. Automation starts the first in line when the agent is free, then
the next when that run ends. Tasks someone asked to start go first, then the rest by priority, then by how long
they have waited. A task needs an agent, so give it one.

The simplest way to queue work is to let a column do it:

1. Open a board you made in the project's **Boards** tool. The default **Project Tasks** board has no such setting.
2. Select the **⋯** menu of any column but **Done**, and choose **Start work on arrival**. The column is marked
   **starts work**.
3. Tasks already in it that have an agent are queued at once, and so is every task placed there later. **Stop
   starting work here** reverses it.

Agents can queue tasks for each other too, up to the limits in
[Limits, and stopping everything](limits-and-stopping.md#how-far-agents-can-queue-work). A person is never held
back by automation: select **Run** on any task, or **Start every waiting task** at the top of the **Runs** tool, to start work at once.

## 4. Follow it

The **Now** section lists what is **running**, what is **in line**, and anything stuck, each with a fix beside it:

- **couldn't queue — no agent assigned**: select **Assign**.
- **is blocked — its person lost access**: select **Choose someone**. Every task runs on behalf of a person, and
  that person can no longer work in the project.
- **The routine's name, then paused**, with the reason: select **Open**. See [Routines](routines.md).

**Later** lists what will start next, in time order: tasks with a start time and routines. Select **See them in
Runs →** to open **Runs**. A queued task also says on the task itself why it hasn't started: its place in the line,
when the next round is, or that automation is off.

## Start a single task later

To start one task at a set time without a routine, open the task and select **Set a start time** under **Start
time**. Choose when, and select **Save**. It starts once, in whatever column it is in. If the project's automation is
off at that time, the task is queued instead and waits.
