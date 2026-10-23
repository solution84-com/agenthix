---
title: Limits, and stopping everything
description: Set how far automation may go, tighten it for one project, and stop all work at once.
sidebar:
  order: 3
---

Automation spends a model's time, so it has limits. An organisation administrator sets the furthest any project may
go. A project's administrators can set the same limits lower for that project, never higher. If the organisation later
lowers a limit below a project's choice, the stricter one applies and the project's screen says **limited by the
organisation**.

## What the organisation allows

An organisation administrator opens **Manage**, then **Settings** and **Automation**. Each value is where every project starts and the most any project can have. Select **Save** when done.

| Setting | What it does | Default |
|---|---|---|
| **Automation allowed** | Off stops every automatic start in the organisation at once. Projects keep their own choices for when it is back on. | On |
| **Highest maximum depth** | How far a chain of work that agents queue for each other may go before a person must queue the next step. At 0, every task an agent queues outside a person's own run waits for a person. From 0 to 20. | 3 |
| **Every project must throttle** | On, every project's queued tasks start only in rounds. Off, each project chooses. | Off |
| **Shortest interval (minutes)** | With the throttle on, the least time between one round ending and the next starting. From 5 to 10080. | 30 |
| **Largest batch** | With the throttle on, the most tasks one round starts for one agent. From 1 to 50. | 3 |
| **Highest queue limit** | The most tasks agents may hold queued in one project. People are never limited. From 0 to 1000. | 20 |
| **Agents may set schedules when asked** | Allows projects to let an agent set a start time, only in a run a person started. | Off |

![The organisation's Automation settings, with the allowed switch and the limits](screenshot:automation-settings)

## How far agents can queue work

Agents can queue tasks for each other, which could otherwise go on without end, so two limits hold it:

- **Chain depth.** A task a person queues or starts is at depth 0. A task queued by a run that automation or another
  agent started is one deeper. Past the maximum, the task is still made, but not queued: it waits for a person.
- **Queue limit.** When agents already hold this many queued tasks in a project, a task an agent makes isn't queued,
  and waits for a person.

## What the throttle does

Normally a project starts a queued task as soon as its agent is free. With the **Throttle** on, queued tasks are held
and let through in **rounds**: every **Every (minutes)** at most **At a time** tasks per agent. Use it to spread cost
over time or to leave a gap to see what happened. The Automation tool shows **round in progress** or **next round** and
the time. A person's **Run** is never throttled.

## Tighten it for one project

A project administrator opens the project's **Automation** tool and selects **Rules**.

1. **Limits** shows the **Throttle**, **Chain depth**, **Queue limit**, **Turn limit** and **Run time limit** in force.
   **Chain depth**, **Queue limit** and **Turn limit** also show the organisation's maximum.
2. Select **Edit**, change a value, and select **Save**. A field left empty takes the organisation's value.
3. The **Run time limit** is shown here but changed in the project's **Settings**, because it applies to every run,
   conversations included.

![The Rules view of a project's Automation tool, with its limits and the columns that start work](screenshot:automation-rules)

**Rules** also lists **Columns that start work automatically**, each board a link. Switch one on or off on the
board: see [Turn on automation](turn-on-automation.md#3-choose-what-gets-queued).

### What agents may schedule

Under **Agents**, **Agents may set start times when asked** is the project's level of the organisation's **Agents may
set schedules when asked**: the same permission at two levels. It lets an agent set a task's start time or a routine, but
only in a run a person started. It is off unless the organisation allows it and the project turns it on. An agent
working unattended can never schedule work, so a schedule can't be used to get around these limits.

## How long a run may last

Separate from automation, every run has a **Time limit (minutes)**, and a run that no person started, such as one
automation starts, also has a **Turn limit**. A turn is one round trip with the model. An administrator sets both
under **Manage › Settings › Runs**, from 1 minute to 24 hours (1440) and from 1 to 1000 turns, and a project
may only lower them. A run that reaches a limit stops, and its task says which limit it reached.

## Stop everything

- **Pause one project's automation.** In its **Automation** tool, select **Pause**. Nothing new starts on its own, work
  already running carries on, and queued tasks stay queued in order.
- **Pause the whole organisation's.** Turn off **Automation allowed** under **Manage › Settings ›
  Automation**. No project can turn it back on.
- **Stop what is running.** In a project, under **Agents at work**, select **Stop all** and confirm **Stop all runs in
  this project?** Every running task stops, and queued tasks leave the queue. Only the project's administrators can
  use it. Your own conversations here stop answering, and other people's are not stopped. In your own **Chat** it
  does the same for your space.
- **Stop one agent.** On an agent's page in **Manage › Agents**, the **⋯** menu has **Stop its runs**.
- **Stop one task.** Select **Stop** on the task.
