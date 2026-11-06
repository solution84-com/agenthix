---
title: Follow what agents are doing
description: See every run, answer an agent that is waiting for you, and stop one that shouldn't continue.
sidebar:
  order: 3
---

A **run** is one stretch of an agent working: a message in a conversation, a task starting, a routine firing. Most runs need nothing from you. This page is for seeing them, and for the few that stop and wait for a person.

## Where to look

The **Notifications** bell and the **Runs** button sit together at the foot of the side bar (on a phone, in the bar at the top). Each shows a count and opens a panel beside the side bar.

- **Notifications** lists what waits on you under **Needs you**, and what has passed under **Earlier**. An item stays under **Needs you** until it is handled, which happens by itself when its run moves on or anyone answers it. **You're all caught up** means there is nothing.
- **Runs** lists your own runs, the ones waiting for you first. **Show all ›** opens the **Runs** screen.
- A project's **Runs** tool, under **Agents at work**, lists every run active in that project right now: the agent, who or what started it, where it is working and since when. It never shows what was said.
- A task's **Session** holds the whole transcript of its runs: select **Open session ›**.

## The Runs screen

Select the **Runs** button beside the notifications bell, then **Show all ›**.

![The Runs screen, with a run waiting for approval open beside the list](screenshot:runs-screen)

Runs are in four groups, newest first: **Waiting for you**, **Running**, **Queued** and **Finished**. A row says which agent, in which project or Chat, how it ended, how long it took, and how many risky calls it made. **Older runs ›** loads more.

Narrow the list with the search box and these filters:

- **All of mine**, **Started by me** or **On my behalf**
- **Place**: a project, or Chat
- **Agent**, **Outcome** (completed, failed or stopped) and **Time**

Select a run to open it. The top shows its title, how it ended and when, and **Open the task** or **Open the conversation**. Below are who started it, which **Site** ran it, its **Approval**, its **Runtime and model**, its **Usage** and any **Error**. **Tool calls** lists every call in order with a risk label: **Safe**, **Low**, **Medium**, **High** or **Flagged**. **High and Flagged** shows only those; select a call to read what it was given and what it returned.

## Answer an approval

An agent can only use the tools and commands it has been allowed. When it wants to do something its permissions leave to a person, it asks: by default when it has done everything else, or at once if its approval is set to **Immediate**. The task shows **Wants approval**, and the request appears on the task, under **Needs you** in the project's **Tasks**, and in the **Notifications** of the person the task is done on behalf of. How much an agent may do before it asks is set in [Permissions and approvals](../agents/permissions.md).

A request is the same card wherever you answer it, on the task, in its session and in a conversation: it says in plain words what the agent asks to do, such as *Writer asks to fetch a web page and run one command*, with each tool and each whole command it wants, and why in the agent's own words.

- **Approve** lets the work go on with the access it asked for, for this run only.
- **Deny** refuses it. On the task, in its session and in a conversation you can give a reason, which the agent reads.

Once it is answered the buttons go and the card says the outcome in place, such as *You approved it · 06:31 PM*. A request you denied on the task leaves *Request denied — run again to retry*. In a conversation the card is where the request was asked, with a line above the message box until it is answered, as in [Your first conversation](../getting-started/first-conversation.md#when-an-agent-asks-to-do-something). On a task, and in a task's conversation, anyone who works in the project, as a member or administrator, can answer; a viewer sees the request but can't. In a personal or project conversation, only the person having it can.

## Stop a run

Select **Stop** on a running task or on the run in the **Runs** screen. A run that fails shows its reason on the task and **Run again**; **Dismiss this run** in the task's **⋯** menu clears one you don't want.

An organisation administrator can select **Stop all** at the top of the **Runs** screen to stop every active run. For stopping a whole project's automation, see [Limits, and stopping everything](../automation/limits-and-stopping.md).
