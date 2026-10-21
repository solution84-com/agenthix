---
title: Routines
description: Create a task again and again on a schedule, and see how each round went.
sidebar:
  order: 2
---

A **routine** is work that comes round again: a weekly status summary, a daily check of a dashboard. You describe
the task once and say when it repeats. Each time, Agenthix makes the task, called a **round**, and an agent starts it
at its time. A routine always has exactly one round waiting for its next time.

A round is an ordinary task. It appears on a board, has a session, and can ask for approval like any other.

## 1. Set up a routine

You need to be able to start runs in the project, so a project **Viewer** can't set one up.

1. Open the project's **Automation** tool, then select **Routines**.
2. Select **New routine**.
3. Fill in what each round is:
   - **Title of each round** and an optional **Description**: what the agent is asked to do.
   - **Priority**, **Agent** and **Labels, comma-separated**.
   - **Starts on**: **The backlog** or a board, and the **Column** the round is placed in.
4. Under **When rounds come**, choose **Every…** (a number of minutes, hours or days, at least 5 minutes apart) or
   **On weekdays** (a time, and the days). Leave **Starting** empty to begin now. The times are in
   your own time zone.
5. Select **Set up routine**.

The routine opens, and its first round is made straight away.

With an **Agent**, the round starts by itself at its time, whatever column it is in, as if its person had pressed
**Run**. With none, it waits for a person to start it. If the project's automation is off at that moment, the round
is queued and waits: see [Turn on automation](turn-on-automation.md).

## 2. Read a routine

Select a routine in the list. The list shows each routine's switch, when it repeats, who it runs for, its next time,
and a square for each of its last rounds.

![A routine, with its next round, its recent rounds and what it creates](screenshot:routine-detail)

The first line is a sentence saying what happens. Below it:

- **Next round**: its time and task. **Run now**, shown when the routine has an **Agent**, starts it at once and keeps the schedule as it was. **Skip this
  time** passes over this one time. **Open** with the round's key opens the task.
- **Rounds**: the last ones, newest first, with how each went (**Done**, **Failed**, **Needs you**, **Running** or
  **Waiting**) and how long its run took. **Older rounds ›** reads more.
- **What it creates** and **When**: select **Edit** to change either. Saving moves the waiting round to match; rounds
  already made stay as they are.

## 3. Pause, change or delete it

Only the routine's person or a project administrator can pause, change or delete it.

- **Pause**: use the switch beside the routine's name. A paused routine makes no rounds. Turn it on again and it
  makes a fresh one.
- **Delete**: use the **⋯** menu and select **Delete routine**. Its waiting round goes with it.
- **Who it is for**: every round runs on behalf of the person who set the routine up, shown as **On behalf of**.
  If they can no longer work in the project, the routine pauses and says so, and a project administrator can select
  **Change**, or **Take it over** to become the person it runs for. Only one of those two resumes it: the switch
  alone can't turn it back on.

If a routine's last three rounds all fail, its person is told and the notice stays in **Notifications** until a
round succeeds.

## Turn a task into a routine

To repeat a task you already have, open it and, under **Start time**, select **Make this a routine…**. Choose how
often and select **Make it a routine**. The task becomes the first round if it has a start time still to come.

## Let an agent set one up

If an administrator allows it, an agent can set start times and routines when you ask it to in a conversation you
started. It can't do this in a run that automation started. See
[Limits, and stopping everything](limits-and-stopping.md#what-agents-may-schedule).
