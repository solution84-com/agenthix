---
title: Permissions and approvals
description: Decide what an agent may do alone, what it must ask about, and narrow that for a project or for yourself.
sidebar:
  order: 3
---

Every tool an agent can use has one of three settings:

- **Always**: the agent uses it without asking.
- **Ask**: a person must approve it first.
- **Never**: the agent can't use it.

**Approval** decides what happens when an agent reaches a tool set to **Ask**. Permissions are set at three levels,
and each level can only make the one above it stricter.

## The organisation's permissions

An organisation administrator sets these on the agent's page, and they apply wherever the agent works.

1. Open **Agents**, then **Manage agents ›**, then **Manage** beside the agent.
2. In **Permissions**, select **Edit**.
3. Choose its **Approval**:
   - **Deferred**, the default: it carries on, and lists every **Ask** for a person to approve at the end.
   - **Immediate**: it stops at the first **Ask** and asks a person at once.
   - **⚠ Bypassed**: every tool runs, including tools set to **Never**, and no one is asked. It still can only do
     what the person it works for may do. Saving this asks you to confirm with **Bypass approval**, and the agent is
     marked **⚠ Approval bypassed** wherever it is listed. Use it only for agents you trust completely.
4. Under **Start from a preset**, choose **Safe**, **Read only**, **Developer**, **Product manager** or
   **Project manager**, or leave it as **Custom**. A preset sets many tools at once.
5. Adjust any tool (the list is not shown while approval is **⚠ Bypassed**). They are grouped as **Files**, **Commands**, **Web** and **Platform**, each **Always**, **Ask**
   or **Never**. **Platform** is the tools that act on Agenthix itself, such as creating tasks; a button under its
   heading shows them. A command that no pattern matches follows **Any other command**; select
   **＋ Add a command pattern** to treat a start such as `git` or `npm run` differently.
6. Select **Save**.

![An agent's permissions open for editing, with the three approval choices and the presets](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/agent-permissions.png)

When an agent may use the web without asking and may also change files, run commands, change tasks or use
administrative tools without asking, a note warns that a page it reads could steer it into doing so. Set the web
tools, or the others, to **Ask** or **Never**.

### Fetching pages and searching the web

**Fetch a page** and **Search the web**, under **Web**, are **Ask** for an agent until an administrator changes them.
In a conversation, the agent goes on with a search in the background and tells you it will ask: you approve it on its
card in the conversation, or in **Notifications**. In a task's or a routine's run, the search waits with the run's other requests, and is asked
for at the end under **Deferred** or at once under **Immediate**, of the people who answer that run's approvals. Set
**Search the web** to **Always** for an agent that should search without asking, or **Never** for one that shouldn't
search at all: an agent set to **Never** says its permissions don't allow it, and where an administrator changes that,
rather than trying. Whether it can search at all also depends on what it runs on: see
[Web search](../your-tools/providers.md#web-search).

## Permissions in a project

A project's administrators can make an agent stricter inside that project only.

1. In the project, open **Members** and select the agent.
2. Find **Permissions here**. Every member can read it; only the project's administrators can change it.

It looks like the organisation's, with the organisation's setting beside each line and only that setting or a
stricter one on offer. **The organisation's** preset puts everything back. Select **＋ Block a command here** to stop
a command in this project. The heading counts what you have narrowed.

## Your own permissions in Chat

For your own conversations in **Chat**, you can narrow an agent too. Open it from **Agents** and open its **Your
settings** section. It shows **Its models**, which the organisation's admins set, and **Your permissions in Chat**,
which works as above and affects no one else. To narrow which models may run for you, use **Your settings** in the menu
behind your name: see [Models](../your-tools/models.md#which-models-may-run).

## Answering an approval

When a run reaches a tool set to **Ask**, it asks a person: at the end under **Deferred**, or at once under
**Immediate**. You are told in the conversation, on the task and in **Notifications**, and you choose **Approve** or
**Deny**. **Decline** in a conversation, and **Reject** on the task, take a reason the agent reads; **Deny** in
Notifications and on the **Runs** screen send a fixed one. In a personal or project conversation only its owner can
answer; on a task, and in a task's conversation, anyone in the project who isn't a viewer. See
[Your first task](../getting-started/first-task.md#4-run-it), and
[Follow what agents are doing](../projects/runs-and-approvals.md) for every run across your projects. A project
**Viewer** can't answer one.
