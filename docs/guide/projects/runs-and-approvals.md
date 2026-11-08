---
title: Follow what agents are doing
description: See every run, answer an agent that is waiting for you, and stop one that shouldn't continue.
sidebar:
  order: 3
---

A **run** is one stretch of an agent working: a message in a conversation, a task starting, a routine firing. Most runs need nothing from you. This page is for seeing them, and for the few that stop and wait for a person.

## Where to look

- The [Workroom](workroom.md) shows a project's agents at work and what needs you; **Workrooms** shows every project's.
- The **Notifications** bell and the **Runs** button sit together at the foot of the side bar (on a phone, in the menu).
  **Notifications** lists what waits on you under **Needs you**, and what has passed under **Earlier**. An item stays under
  **Needs you** until it is handled, which happens by itself when its run moves on or anyone answers it. **You're all caught
  up** means there is nothing.
- **Runs** is the history of every run, with its steps, model, time and cost: see [The Workroom and Runs](workroom.md#the-runs-panel-and-runs).
- A task's **Runs** tab lists every run of the task, one line each; select one to see its steps.

## Answer an approval

An agent can only use the tools and commands it has been allowed. When it wants to do something its permissions leave to a person, it asks: by default when it has done everything else, or at once if its approval is set to **Immediate**. The task shows **Wants approval**, and the request appears on the task, in the Workroom's **Needs you** bars, and in the **Notifications** of the person the task is done on behalf of. How much an agent may do before it asks is set in [Permissions and approvals](../agents/permissions.md).

A request is the same card wherever you answer it, on the task, in its session and in a conversation: it says in plain words what the agent asks to do, such as *Writer asks to fetch a web page and run one command*, with each tool and each whole command it wants, and why in the agent's own words.

- **Approve** lets the work go on with the access it asked for, for this run only.
- **Deny** refuses it. On the task, in its session and in a conversation you can give a reason, which the agent reads.

Once it is answered the buttons go and the card says the outcome in place, such as *You approved it · 06:31 PM*. A request you denied on the task leaves *Request denied — run again to retry*. In a conversation the card is where the request was asked, with a line above the message box until it is answered, as in [Your first conversation](../getting-started/first-conversation.md#when-an-agent-asks-to-do-something). On a task, and in a task's conversation, anyone who works in the project, as a member or administrator, can answer; a viewer sees the request but can't. In a personal or project conversation, only the person having it can.

## Stop a run

Select **Stop** on a running task, on a run in the Workroom, or on the run's page. A run that fails shows its reason on the
task and **Run again**; **Dismiss** in the task's page clears one you don't want. To stop many at once, see
[Starting work](starting-work.md#stop).

An organisation administrator can select **Stop all** in the Runs panel to stop every active run in the organisation. For the
limits on what agents may start, see [Limits, and stopping everything](../automation/limits-and-stopping.md).
