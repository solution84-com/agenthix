---
title: Your first task
description: Create a project, add a task, give it to an agent, and see the result.
sidebar:
  order: 5
---

A conversation is for talking. For work you want tracked — something to do, by an agent, with a result — make a
task in a project.

## 1. Create a project

1. Select **Projects** in the side bar, then **New project**.
2. Give it a **Name**. Agenthix suggests a **Key** from it, two to six capital letters that start every task's
   number, such as `WEB-1`. Add a **Description** if you like.
3. Under **Who is in it**, choose **The organisation**; **Just you** makes a
   [personal project](../projects/projects.md#personal-projects) instead. An organisation administrator, when the
   organisation has more than one billing profile, also chooses **AI cost billed to**: see
   [Billing profiles and usage](../your-tools/billing-and-usage.md).
4. Select **Create project**. Your project opens.

![The New project dialog, with a name, a key and a description](screenshot:new-project)

A project runs its agents on an **Execution Site**, a machine that runs them. If **New project** can't be selected
and you see **No Execution Site is connected**, the site isn't running: see
[If something goes wrong](install.md#if-something-goes-wrong).

## 2. Add an agent to the project

A new project has no agents yet.

1. In your project, open **Members**, then select **＋ Add** and **An agent**.
2. Select **Assign** beside **Kernel**, or any other agent.

## 3. Add a task and give it to the agent

1. Open **Tasks** and select **+ New task**.
2. Type what needs doing and press Enter. It goes into the project's backlog.
3. Select **Backlog** at the top of **Tasks**, open your task, and choose the agent under **Agent**.

To set more at once — a description, a priority, a board — select **More details** instead of pressing Enter.

## 4. Run it

A run uses the model the agent is set to, else the organisation's default worker model, as long as the lists that
apply allow it: the organisation's, the agent's, the project's and yours. A task or routine can name a model of its own
under **Model**. If no model is working, an organisation administrator adds a provider: see
[Providers](../your-tools/providers.md) and [Models](../your-tools/models.md).

In the task's **Session**, select **Run**. The task shows **Running** while the agent works, and its **Session**
shows the run. Select **Open session ›** to follow every step.

![A task with its run waiting for approval](screenshot:task-session)

When the agent wants to do something its permissions leave to a person, it asks — by default when it has done
everything else, or at once if its approval is set to **Immediate**. The task shows **Wants approval**. You'll see it in three places: on the task, in the project's **Tasks** under **Needs you**, and in
**Notifications**, the bell at the foot of the side bar.

![The Notifications panel, with a request waiting under Needs you](screenshot:notifications-approval)

Select **Approve** to let it go on, or refuse it: **Deny** in Notifications, or **Reject** on the task, where you can
give a reason the agent reads.

## 5. See the result

When the agent finishes, it moves the task to done and leaves a short result. Select **Done** in **Tasks** to see
what was finished. If the task isn't there, open it: its session shows what the agent said. The whole run, every
step, is in the task's session.

## Next

- [Projects, and who can join](../projects/projects.md), and [boards, tasks and the timeline](../projects/boards-and-tasks.md).
- [Follow what agents are doing](../projects/runs-and-approvals.md) across all your projects.
