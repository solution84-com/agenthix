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

![The New project dialog, with a name, a key and a description](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/new-project.png)

A project runs its agents on an **Execution Site**, a machine that runs them. If **New project** can't be selected
and you see **No Execution Site is connected**, the site isn't running: see
[If something goes wrong](install.md#if-something-goes-wrong).

## 2. Add an agent to the project

A new project has no agents yet.

1. In your project, open **Members**, then select **＋ Add** and **An agent**.
2. Select **Assign** beside **Kernel**, or any other agent.

## 3. Add a task and give it to the agent

1. Open **Tasks** and select **New task**.
2. Type a **Title** and, if you like, a **Description**, and choose the **Agent**. Select **Create task**. A new task starts in
   **Backlog**: wanted, but not yet committed to.
3. Open the task and move it to **To do** with its **Column**. That is deciding to do it, and it is what an agent's **Start** in the Workroom looks for.

## 4. Run it

Nothing runs until you start it. A run uses the model the agent is set to, else the organisation's default model, as long as the lists that
apply allow it: the organisation's, the agent's, the project's and yours. A task or routine can name a model of its own
under **Model**; a task an agent creates for you in a conversation starts with that conversation's model there. If no model is working, an organisation administrator adds a provider: see
[Providers](../your-tools/providers.md) and [Models](../your-tools/models.md).

On the task, select **Run** and **Run now**. The agent's picture shows a turning ring while it runs, and the task shows **Running**. Its **Session**
shows the run. Its **Runs** tab, below the description, shows each run's steps.

![A task with its run waiting for approval](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/task-session.png)

When the agent wants to do something its permissions leave to a person, it asks — by default when it has done
everything else, or at once if its approval is set to **Immediate**. The task shows **Wants approval**. You'll see it in three places: on the task, in the project's **Workroom** under **Needs you**, and in
**Notifications**, the bell at the foot of the side bar.

![The Notifications panel, with a request waiting under Needs you](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/notifications-approval.png)

Select **Approve** to let it go on, or refuse it: **Deny** in Notifications, or **Reject** on the task, where you can
give a reason the agent reads.

## 5. See the result

When the agent finishes, the task shows **Finished** and the agent leaves a short result. Moving the task to **Done** is yours,
or the agent's if it was asked to. Select **Done** in **Tasks** to see what was finished. Open the task to read what the agent said. The whole run, every
step, is in the task's session.

## Next

- [Projects, and who can join](../projects/projects.md), and [tasks](../projects/tasks.md), [boards](../projects/boards.md) and [starting work](../projects/starting-work.md).
- [Follow what agents are doing](../projects/runs-and-approvals.md) across all your projects.
