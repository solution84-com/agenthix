---
title: Create an agent
description: Name a new agent, choose its model, add it to a project, and start a conversation with it.
sidebar:
  order: 1
---

Every new **HQ** comes with one built-in agent, **Kernel**. You add the rest. An agent belongs to your whole
organisation: you create it once, then choose which projects it works in.

Only an organisation administrator creates agents. If you are not one, you won't see **Manage agents ›**, but you can
still talk to every agent from the **Agents** screen.

## 1. Create it

1. Select **Agents** in the side bar, then **Manage agents ›**. You can also open the menu behind your name, select
   **Manage**, then **Agents**.
2. Select **New agent**.
3. Fill in the **New Agent** dialog:
   - **Name**: what people see, such as `Editor`.
   - **Handle**: how people mention it. Agenthix suggests one from the name; change it if you like. It can't be changed later.
   - **Role** (optional): a few words on what it is for, such as `Checks tone and style`.
   - A **picture** and a **cover**, already drawn for you: a random robot on a random background and a random
     cover. Select **Change** to choose others or upload your own: see [Pictures and covers](pictures-and-covers.md).
4. Select **Create Agent**.

![The New Agent dialog, with a name, a handle and a role](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/new-agent.png)

The dialog asks for no model. A new agent follows the organisation's defaults until it is given its own: see
[An agent's own models, hearing and speaking](../your-tools/models.md#an-agents-own-models-hearing-and-speaking).

The handle `@kernel` is reserved for the built-in agent. The new agent appears in the list under
**Manage › Agents**. Select **Manage** beside it to open its page, where you change it later.

## 2. Put it to work in a project

A new agent is in no project yet, so no one can give it a task. On its page, find **Projects**, select **Assign**,
and choose a project. If you administer the project, you can also do it from the project: open **Members**, then **＋ Add**, **An agent**
and **Assign** beside it.

In a project, an agent can have its own permissions for that project only: see
[Permissions and approvals](permissions.md#permissions-in-a-project). A project's administrators can also narrow which
models may run there: see [Models](../your-tools/models.md#which-models-may-run).

## 3. Talk to it

Select **Agents** in the side bar. Each agent is a card, with what it is doing now. Select
**New conversation →** on its card to open **Chat** with the agent picked in the message box, then write your first
message. Selecting the card opens the agent's own page, whose message box starts a conversation with it in **Chat**. In
a project, select the agent under **Members**, then **Start a conversation**, which starts one in the conversation
beside the page with the agent picked, or **Give it a task**.

## What else is on its page

The agent's page in **Manage › Agents** has a section for each part of it, most opened with **Edit**:

- **Instructions**: [Instructions and memory](instructions-and-memory.md).
- **Skills**: the skills the agent has, with **Add a skill** to give it one: [Give a skill to agents](../skills/give-skills-to-agents.md).
- **Thinking, hearing and speaking**: its **Model**, its **Speaking** voice and **Hearing** model, and
  **Which models it may use**. Each row says whether it is the organisation's or the agent's own, and **Follow** hands
  it back. See [Models](../your-tools/models.md).
- **Settings**: its name and handle, which cannot be changed. A saved change takes effect at the agent's next run.
- **Permissions**: [Permissions and approvals](permissions.md).
- **Usage**: what it has cost this month.

At the top you can change its name and role, and its picture and cover with **Change** and **Change cover**: see [Pictures and covers](pictures-and-covers.md). **Export** saves it as a ZIP file, and
**Import** on **Manage › Agents** brings one back in. The **⋯** menu has **Stop its runs** and, for any agent but
Kernel, **Delete**, which cannot be undone.
