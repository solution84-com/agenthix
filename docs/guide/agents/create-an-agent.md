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

1. Select **Agents** in the side bar, then **Manage agents ›**. You can also open **Organisation** and select its
   **Agents** card.
2. Select **New agent**.
3. Fill in the **New Agent** dialog:
   - **Name**: what people see, such as `Editor`.
   - **Handle**: how people mention it. Agenthix suggests one from the name; change it if you like. It can't be changed later.
   - **Role** (optional): a few words on what it is for, such as `Checks tone and style`.
   - **Runtime**: **Claude** or **OpenCode**. They run different models; **OpenCode** needs a key for its provider
     under **Organisation › Settings › Model access**: see [Models](../your-tools/models.md).
   - **Default Model**: the model it uses unless a project or a person narrows it.
4. Select **Create Agent**.

![The New Agent dialog, with a name, a handle, a role, a runtime and a default model](screenshot:new-agent)

The handle `@kernel` is reserved for the built-in agent. The new agent appears in the list under
**Organisation › Agents**. Select **Manage** beside it to open its page, where you change it later.

## 2. Put it to work in a project

A new agent is in no project yet, so no one can give it a task. On its page, find **Projects**, select **Assign**,
and choose a project. If you administer the project, you can also do it from the project: open **Members**, then **＋ Add**, **An agent**
and **Assign** beside it.

In a project, an agent can have its own model and its own permissions for that project only: see
[Permissions and approvals](permissions.md#permissions-in-a-project).

## 3. Talk to it

Select **Agents** in the side bar. Each agent is a card, with what it is doing now. Select
**New conversation →** on its card to open **Chat** with the agent picked in the message box, then write your first
message. Selecting the card opens the agent's own page, whose message box starts a conversation with it in **Chat**. In
a project, select the agent under **Members**, then **Start a conversation**, which opens the project's message box
with the agent picked, or **Give it a task**.

## What else is on its page

The agent's page in **Organisation › Agents** has a section for each part of it, each opened with **Edit**:

- **Instructions** and **Skills**: [Instructions and memory](instructions-and-memory.md).
- **Settings**: its **Model**, its **Runtime**, and **Voice**. A saved change takes effect at
  the agent's next run.
- **Permissions**: [Permissions and approvals](permissions.md).
- **Usage**: what it has cost this month.

At the top you can change its name and role, its picture and its cover. **Export** saves it as a ZIP file, and
**Import** on **Organisation › Agents** brings one back in. The **⋯** menu has **Stop its runs** and, for any agent but
Kernel, **Delete**, which cannot be undone.
